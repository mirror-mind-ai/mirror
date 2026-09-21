"""Generate the Builder delivery-cursor golden (CV22.DS7.US8 plateau 2).

This is the corpus D2 rests on.

The delivery cursor is not a row the two engines merely agree about -- it is a row
they hand back and forth. `set_delivery_cursor(expected_cursor=...)` writes through
`compare_and_swap_runtime_session_metadata`, whose WHERE clause matches on STRING
EQUALITY of the serialized metadata. So if TypeScript writes a cursor whose bytes
differ from the ones Python would have written for the same state, the next Python
compare-and-swap after a `MIRROR_TS_BUILD=0` revert fails with
`DeliveryCursorConflict`. The revert would corrupt on first use rather than fall
back cleanly, which is exactly what the gate exists to prevent.

Three consequences shape this file:

**1. The full ROW is graded, not the metadata cell.** `upsert_runtime_session`
also writes `interface`, `journey`, `active`, `started_at`, `updated_at`, and
`closed_at`, and `get_delivery_cursor` REFUSES a row whose `active` is 0. A port
that gets `metadata` right and `interface` wrong passes a cell-level golden and
fails the revert. Timestamps are frozen so the rest of the row can be compared
exactly.

**2. Transitions are graded as ORDERED SEQUENCES.** Two engines can agree on the
final row and disagree at every step in between: `cursor_generation` is carried
forward or reset, a pending receipt is invalidated or preserved, and
`plan_preauthorization` survives an unrelated write only because the sentinel says
so. The `sequences` block below replays whole lifecycles and records the row after
each step.

**3. Deserialization is a behavior, not a parse.** Every malformed input reads as
absent rather than raising: bad JSON, a JSON array, a missing `method`, a negative
generation, a boolean where an int belongs, a `delivery_story` receipt with no
children. A port that validates more strictly turns an old row into an error, and
one that validates less turns a corrupt row into authority.

Run:  uv run python ts/parity/generate_builder_cursor_golden.py
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from memory.builder.delivery_cursor import (
    DeliveryCursorConflict,
    PlanPreauthorizationReceipt,
    clear_delivery_cursor,
    get_delivery_cursor,
    set_delivery_cursor,
)
from memory.db.schema import SCHEMA
from memory.storage.store import Store

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "builder-cursor.golden.json"

FROZEN_NOW = "2026-01-01T00:00:00+00:00"
JOURNEY = "demo"
SESSION_ID = f"__builder_delivery_cursor__:{JOURNEY}"

ROW_COLUMNS = (
    "session_id",
    "conversation_id",
    "interface",
    "mirror_active",
    "persona",
    "journey",
    "hook_injected",
    "active",
    "started_at",
    "updated_at",
    "closed_at",
    "metadata",
)


def _freeze_now() -> None:
    """Freeze `_now()` so `started_at`/`updated_at` are comparable."""
    from memory import models

    models._now = lambda: FROZEN_NOW


def _store() -> tuple[Store, list[str]]:
    """A fresh in-memory store, plus the list that records projection requests."""
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA)
    requested: list[str] = []
    store = Store(connection)
    # CV22.DS10.TS1 deleted the Store hook this list used to receive. It stays so
    # the recorded shape is unchanged; it is now always empty, because Python no
    # longer requests a projection refresh. The non-empty values in the committed
    # goldens are history this generator can no longer reproduce (see D-019).
    return store, requested


def _row(store: Store) -> dict[str, Any] | None:
    row = store.conn.execute(
        "SELECT * FROM runtime_sessions WHERE session_id = ?", (SESSION_ID,)
    ).fetchone()
    if row is None:
        return None
    return {column: row[column] for column in ROW_COLUMNS}


def _cursor_dump(cursor: Any) -> dict[str, Any] | None:
    if cursor is None:
        return None
    receipt = cursor.plan_preauthorization
    return {
        "journey": cursor.journey,
        "method": cursor.method,
        "active_item": cursor.active_item,
        "active_item_title": cursor.active_item_title,
        "active_item_level": cursor.active_item_level,
        "active_checkpoint": cursor.active_checkpoint,
        "pending_confirmation": cursor.pending_confirmation,
        "last_delivery_event": cursor.last_delivery_event,
        "cadence_profile": cursor.cadence_profile,
        "cadence_limits": list(cursor.cadence_limits),
        "granularity_decision": cursor.granularity_decision,
        "navigator_flow_unit": cursor.navigator_flow_unit,
        "child_work_items": list(cursor.child_work_items),
        "aggregate_checkpoint_status": list(cursor.aggregate_checkpoint_status),
        "cursor_generation": cursor.cursor_generation,
        "plan_preauthorization": None
        if receipt is None
        else {
            "journey": receipt.journey,
            "method": receipt.method,
            "cursor_generation": receipt.cursor_generation,
            "active_item": receipt.active_item,
            "active_item_level": receipt.active_item_level,
            "flow_unit": receipt.flow_unit,
            "child_work_items": list(receipt.child_work_items),
            "plan_contract_version": receipt.plan_contract_version,
            "policy": receipt.policy,
            "stop_boundary": receipt.stop_boundary,
            "scope_fingerprint": receipt.scope_fingerprint,
            "status": receipt.status,
            "reason": receipt.reason,
        },
        "release_intent_delivery_story": cursor.release_intent_delivery_story,
        "release_intent": cursor.release_intent,
    }


def _receipt(**changes: Any) -> PlanPreauthorizationReceipt:
    base: dict[str, Any] = {
        "journey": JOURNEY,
        "method": "ariad",
        "cursor_generation": 3,
        "active_item": "CV22.DS7.US8",
        "active_item_level": "user_story",
        "flow_unit": "story_by_story",
        "child_work_items": (),
        "plan_contract_version": "story_plan@1",
        "policy": "single_use_exact_scope",
        "stop_boundary": "navigator_validation",
        "scope_fingerprint": "f" * 64,
        "status": "pending",
        "reason": None,
    }
    base.update(changes)
    return PlanPreauthorizationReceipt(**base)


# --- Writes: one call each, graded as a row -------------------------------

WRITE_CASES: list[tuple[str, dict[str, Any]]] = [
    ("minimal", {}),
    (
        "full",
        {
            "active_item": "CV22.DS7.US8",
            "active_item_title": "Builder/Ariad tree",
            "active_item_level": "user_story",
            "active_checkpoint": "after_plan",
            "pending_confirmation": "navigator_approval",
            "last_delivery_event": "plan_checkpoint",
            "cadence_profile": "stepwise",
            "cadence_limits": ("stop before push", "stop on scope change"),
            "granularity_decision": "implementable",
            "navigator_flow_unit": "story_by_story",
            "child_work_items": ("CV22.DS7.US8.A", "CV22.DS7.US8.B"),
            "aggregate_checkpoint_status": ("plan:approved",),
            "cursor_generation": 7,
        },
    ),
    # Normalizers: blank strings collapse to None, blank tuple entries drop.
    (
        "blank_strings_become_none",
        {
            "active_item": "   ",
            "active_item_title": "",
            "active_checkpoint": "\t",
            "cadence_limits": ("", "  ", "kept"),
            "child_work_items": ("  ",),
        },
    ),
    # Padding is stripped, not preserved.
    ("padded_values", {"active_item": "  CV1.DS1  ", "last_delivery_event": " pulled "}),
    # Unicode survives `ensure_ascii=False` as raw UTF-8, not \\uXXXX.
    (
        "unicode_values",
        {
            "active_item_title": "jornada de ação 🟦",
            "cadence_limits": ("não empurrar",),
        },
    ),
    # A generation of zero is written as the integer 0, never omitted.
    ("generation_zero", {"cursor_generation": 0}),
    ("generation_large", {"cursor_generation": 987654321}),
    (
        "release_intent_planned",
        {"release_intent": "planned", "release_intent_delivery_story": "CV22.DS8"},
    ),
    (
        "release_intent_none_word",
        {"release_intent": "none", "release_intent_delivery_story": "CV22.DS8"},
    ),
    ("release_intent_undecided", {"release_intent": "undecided"}),
    ("receipt_pending", {"plan_preauthorization": _receipt(), "cursor_generation": 3}),
    (
        "receipt_consumed",
        {"plan_preauthorization": _receipt(status="consumed"), "cursor_generation": 3},
    ),
    (
        "receipt_with_children",
        {
            "plan_preauthorization": _receipt(
                flow_unit="delivery_story",
                child_work_items=("A", "B"),
                plan_contract_version="delivery_story_plan@1",
            ),
            "navigator_flow_unit": "delivery_story",
            "child_work_items": ("A", "B"),
            "cursor_generation": 3,
        },
    ),
]

REFUSED_WRITE_CASES: list[tuple[str, dict[str, Any]]] = [
    ("empty_journey", {"journey": ""}),
    ("blank_journey", {"journey": "   "}),
    ("empty_method", {"method": ""}),
    ("negative_generation", {"cursor_generation": -1}),
    ("boolean_generation", {"cursor_generation": True}),
    ("unknown_release_intent", {"release_intent": "maybe"}),
]

# --- Deserialization: arbitrary metadata in, cursor or None out -----------

READ_CASES: list[tuple[str, str | None, bool]] = [
    ("absent_row", None, True),
    ("inactive_row", '{"method": "ariad"}', False),
    ("empty_metadata", "", True),
    ("invalid_json", "{not json", True),
    ("json_array", "[1, 2, 3]", True),
    ("json_string", '"ariad"', True),
    ("json_null", "null", True),
    ("no_method", '{"active_item": "CV1"}', True),
    ("blank_method", '{"method": "   "}', True),
    ("method_not_string", '{"method": 7}', True),
    ("minimal_valid", '{"method": "ariad"}', True),
    # Field-level leniency: wrong types read as absent, not as errors.
    ("active_item_not_string", '{"method": "ariad", "active_item": 7}', True),
    ("generation_negative", '{"method": "ariad", "cursor_generation": -5}', True),
    ("generation_bool", '{"method": "ariad", "cursor_generation": true}', True),
    ("generation_float", '{"method": "ariad", "cursor_generation": 3.5}', True),
    ("generation_string", '{"method": "ariad", "cursor_generation": "3"}', True),
    ("limits_not_list", '{"method": "ariad", "cadence_limits": "a,b"}', True),
    ("limits_mixed_types", '{"method": "ariad", "cadence_limits": ["a", 7, "", "  ", "b"]}', True),
    ("release_intent_unknown", '{"method": "ariad", "release_intent": "maybe"}', True),
    # Receipt drop rules.
    ("receipt_not_dict", '{"method": "ariad", "plan_preauthorization": "x"}', True),
    (
        "receipt_missing_field",
        '{"method": "ariad", "plan_preauthorization": {"journey": "demo"}}',
        True,
    ),
    (
        "receipt_bad_status",
        json.dumps(
            {
                "method": "ariad",
                "plan_preauthorization": {
                    "journey": JOURNEY,
                    "method": "ariad",
                    "cursor_generation": 1,
                    "active_item": "CV1",
                    "active_item_level": "user_story",
                    "flow_unit": "story_by_story",
                    "child_work_items": [],
                    "plan_contract_version": "story_plan@1",
                    "policy": "p",
                    "stop_boundary": "navigator_validation",
                    "scope_fingerprint": "f",
                    "status": "bogus",
                },
            }
        ),
        True,
    ),
    (
        "receipt_delivery_story_without_children",
        json.dumps(
            {
                "method": "ariad",
                "plan_preauthorization": {
                    "journey": JOURNEY,
                    "method": "ariad",
                    "cursor_generation": 1,
                    "active_item": "CV1",
                    "active_item_level": "delivery_story",
                    "flow_unit": "delivery_story",
                    "child_work_items": [],
                    "plan_contract_version": "delivery_story_plan@1",
                    "policy": "p",
                    "stop_boundary": "navigator_validation",
                    "scope_fingerprint": "f",
                    "status": "pending",
                },
            }
        ),
        True,
    ),
    (
        "receipt_valid",
        json.dumps(
            {
                "method": "ariad",
                "cursor_generation": 1,
                "plan_preauthorization": {
                    "journey": JOURNEY,
                    "method": "ariad",
                    "cursor_generation": 1,
                    "active_item": "CV1",
                    "active_item_level": "user_story",
                    "flow_unit": "story_by_story",
                    "child_work_items": [],
                    "plan_contract_version": "story_plan@1",
                    "policy": "p",
                    "stop_boundary": "navigator_validation",
                    "scope_fingerprint": "f",
                    "status": "pending",
                    "reason": None,
                },
            }
        ),
        True,
    ),
    # Unknown keys are ignored rather than rejected.
    ("unknown_keys", '{"method": "ariad", "future_field": {"a": 1}}', True),
]


def _write(store: Store, **kwargs: Any) -> Any:
    payload: dict[str, Any] = {"journey": JOURNEY, "method": "ariad"}
    payload.update(kwargs)
    return set_delivery_cursor(store, **payload)


def build_payload() -> dict[str, Any]:
    _freeze_now()

    writes: list[dict[str, Any]] = []
    for name, changes in WRITE_CASES:
        store, requested = _store()
        _write(store, **changes)
        writes.append(
            {
                "name": name,
                "row": _row(store),
                "cursor": _cursor_dump(get_delivery_cursor(store, JOURNEY)),
                "projection_requests": list(requested),
            }
        )

    refused: list[dict[str, Any]] = []
    for name, changes in REFUSED_WRITE_CASES:
        store, _ = _store()
        try:
            _write(store, **changes)
            refused.append({"name": name, "expected": "ok"})
        except Exception as exc:
            refused.append({"name": name, "expected_error": f"{type(exc).__name__}: {exc}"})

    reads: list[dict[str, Any]] = []
    for name, metadata, active in READ_CASES:
        store, _ = _store()
        if metadata is not None:
            store.upsert_runtime_session(
                SESSION_ID,
                interface="builder_delivery_cursor",
                journey=JOURNEY,
                active=active,
                metadata=metadata,
            )
        reads.append(
            {
                "name": name,
                "metadata": metadata,
                "active": active,
                "cursor": _cursor_dump(get_delivery_cursor(store, JOURNEY)),
            }
        )

    sequences = _build_sequences()
    cas = _build_cas_cases()
    clears = _build_clear_cases()

    return {
        "frozen_now": FROZEN_NOW,
        "session_id": SESSION_ID,
        "journey": JOURNEY,
        "writes": writes,
        "refused_writes": refused,
        "reads": reads,
        "sequences": sequences,
        "compare_and_swap": cas,
        "clears": clears,
    }


def _build_sequences() -> list[dict[str, Any]]:
    """Ordered lifecycles: the row and the projection log after every step."""
    sequences: list[dict[str, Any]] = []

    def run(name: str, steps: list[tuple[str, dict[str, Any]]]) -> None:
        store, requested = _store()
        recorded: list[dict[str, Any]] = []
        for label, changes in steps:
            _write(store, **changes)
            recorded.append(
                {
                    "label": label,
                    "changes": _jsonable(changes),
                    "row": _row(store),
                    "cursor": _cursor_dump(get_delivery_cursor(store, JOURNEY)),
                    "projection_requests": list(requested),
                }
            )
        sequences.append({"name": name, "steps": recorded})

    # A full story lifecycle, in the order the real commands write it.
    run(
        "story_lifecycle",
        [
            ("sync", {"cadence_profile": "stepwise"}),
            (
                "pull",
                {
                    "active_item": "CV22.DS7.US8",
                    "active_item_title": "Builder/Ariad tree",
                    "active_item_level": "user_story",
                    "last_delivery_event": "pulled",
                    "cadence_profile": "stepwise",
                },
            ),
            (
                "prepare",
                {
                    "active_item": "CV22.DS7.US8",
                    "active_item_level": "user_story",
                    "last_delivery_event": "prepared",
                    "cadence_profile": "stepwise",
                },
            ),
            (
                "plan",
                {
                    "active_item": "CV22.DS7.US8",
                    "active_item_level": "user_story",
                    "active_checkpoint": "after_plan",
                    "pending_confirmation": "navigator_approval",
                    "last_delivery_event": "plan_checkpoint",
                    "cadence_profile": "stepwise",
                },
            ),
            (
                "approve",
                {
                    "active_item": "CV22.DS7.US8",
                    "active_item_level": "user_story",
                    "last_delivery_event": "plan_approved",
                    "cadence_profile": "stepwise",
                },
            ),
        ],
    )

    # A receipt surviving, then being invalidated by each coordinate change.
    for reason, change in [
        ("cursor_generation_changed", {"cursor_generation": 4}),
        ("active_item_changed", {"active_item": "CV22.DS7.US9"}),
        ("active_item_level_changed", {"active_item_level": "technical_story"}),
        ("flow_unit_changed", {"navigator_flow_unit": "delivery_story"}),
        ("child_scope_changed", {"child_work_items": ("A",)}),
    ]:
        base = {
            "active_item": "CV22.DS7.US8",
            "active_item_level": "user_story",
            "navigator_flow_unit": "story_by_story",
            "cursor_generation": 3,
        }
        run(
            f"receipt_invalidated_by__{reason}",
            [
                ("record_receipt", {**base, "plan_preauthorization": _receipt()}),
                # An unrelated write must PRESERVE the pending receipt.
                ("unrelated_write", {**base, "last_delivery_event": "noted"}),
                ("coordinate_change", {**base, **change}),
            ],
        )

    # A consumed receipt is not re-invalidated by a later coordinate change.
    run(
        "consumed_receipt_survives_coordinate_change",
        [
            (
                "record_consumed",
                {
                    "active_item": "CV22.DS7.US8",
                    "active_item_level": "user_story",
                    "cursor_generation": 3,
                    "plan_preauthorization": _receipt(status="consumed"),
                },
            ),
            (
                "coordinate_change",
                {
                    "active_item": "CV22.DS7.US9",
                    "active_item_level": "user_story",
                    "cursor_generation": 3,
                },
            ),
        ],
    )

    # An explicit `None` clears the receipt; omitting the argument keeps it.
    run(
        "explicit_none_clears_receipt",
        [
            (
                "record",
                {
                    "active_item": "CV1",
                    "cursor_generation": 3,
                    "plan_preauthorization": _receipt(),
                },
            ),
            (
                "explicit_none",
                {"active_item": "CV1", "cursor_generation": 3, "plan_preauthorization": None},
            ),
        ],
    )

    # Projection refresh fires only when the projected tuple changes.
    run(
        "projection_refresh_change_detection",
        [
            ("no_active_item", {}),
            ("active_item_appears", {"active_item": "CV1", "last_delivery_event": "pulled"}),
            (
                "unprojected_field_changes",
                {
                    "active_item": "CV1",
                    "last_delivery_event": "pulled",
                    "cadence_profile": "checkpoint",
                },
            ),
            ("projected_field_changes", {"active_item": "CV1", "last_delivery_event": "prepared"}),
            (
                "checkpoint_appears",
                {
                    "active_item": "CV1",
                    "last_delivery_event": "prepared",
                    "active_checkpoint": "after_plan",
                },
            ),
            ("active_item_disappears", {"last_delivery_event": "prepared"}),
        ],
    )

    # The `or "active"` default inside `_projected_active_work` makes a MISSING
    # `last_delivery_event` indistinguishable from the literal string "active",
    # so moving between them requests NO refresh. Nothing else in the corpus can
    # see that default: found by mutation testing, which removed it and stayed
    # green.
    run(
        "projected_event_default_collides_with_literal_active",
        [
            ("item_without_event", {"active_item": "CV1"}),
            (
                "event_becomes_literal_active",
                {"active_item": "CV1", "last_delivery_event": "active"},
            ),
            (
                "event_becomes_something_else",
                {"active_item": "CV1", "last_delivery_event": "pulled"},
            ),
            ("event_returns_to_absent", {"active_item": "CV1"}),
        ],
    )

    return sequences


def _build_cas_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []

    # Success: the expectation matches the stored bytes.
    store, requested = _store()
    first = _write(store, active_item="CV1", last_delivery_event="pulled")
    second = set_delivery_cursor(
        store,
        journey=JOURNEY,
        method="ariad",
        active_item="CV1",
        last_delivery_event="prepared",
        expected_cursor=first,
    )
    cases.append(
        {
            "name": "swap_succeeds",
            "row": _row(store),
            "cursor": _cursor_dump(second),
            "projection_requests": list(requested),
        }
    )

    # Conflict: the row moved under the caller.
    store, _ = _store()
    observed = _write(store, active_item="CV1", last_delivery_event="pulled")
    _write(store, active_item="CV1", last_delivery_event="someone_else")
    try:
        set_delivery_cursor(
            store,
            journey=JOURNEY,
            method="ariad",
            active_item="CV1",
            last_delivery_event="prepared",
            expected_cursor=observed,
        )
        cases.append({"name": "swap_conflicts", "expected": "ok"})
    except DeliveryCursorConflict as exc:
        cases.append(
            {
                "name": "swap_conflicts",
                "expected_error": f"{type(exc).__name__}: {exc}",
                "row_after": _row(store),
            }
        )

    # A mismatched journey in the expectation is a ValueError, not a conflict.
    store, _ = _store()
    observed = _write(store, active_item="CV1")
    try:
        set_delivery_cursor(
            store,
            journey=JOURNEY,
            method="ariad",
            expected_cursor=observed.__class__(**{**observed.__dict__, "journey": "other"}),
        )
        cases.append({"name": "expected_journey_mismatch", "expected": "ok"})
    except Exception as exc:
        cases.append(
            {"name": "expected_journey_mismatch", "expected_error": f"{type(exc).__name__}: {exc}"}
        )

    # A swap against an absent row cannot match.
    store, _ = _store()
    absent_expectation = _write(store, active_item="CV1")
    clear_delivery_cursor(store, JOURNEY)
    try:
        set_delivery_cursor(
            store,
            journey=JOURNEY,
            method="ariad",
            active_item="CV1",
            expected_cursor=absent_expectation,
        )
        cases.append({"name": "swap_against_cleared_row", "expected": "ok"})
    except Exception as exc:
        cases.append(
            {"name": "swap_against_cleared_row", "expected_error": f"{type(exc).__name__}: {exc}"}
        )

    return cases


def _build_clear_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []

    # Clearing a cursor with an active item requests a refresh.
    store, requested = _store()
    _write(store, active_item="CV1", last_delivery_event="pulled")
    requested.clear()
    clear_delivery_cursor(store, JOURNEY)
    cases.append(
        {
            "name": "clear_with_active_item",
            "row": _row(store),
            "cursor": _cursor_dump(get_delivery_cursor(store, JOURNEY)),
            "projection_requests": list(requested),
        }
    )

    # Clearing a cursor with no active item does not.
    store, requested = _store()
    _write(store)
    requested.clear()
    clear_delivery_cursor(store, JOURNEY)
    cases.append(
        {
            "name": "clear_without_active_item",
            "row": _row(store),
            "cursor": _cursor_dump(get_delivery_cursor(store, JOURNEY)),
            "projection_requests": list(requested),
        }
    )

    # Clearing when nothing was ever written still creates an inactive row.
    store, requested = _store()
    clear_delivery_cursor(store, JOURNEY)
    cases.append(
        {
            "name": "clear_absent",
            "row": _row(store),
            "cursor": _cursor_dump(get_delivery_cursor(store, JOURNEY)),
            "projection_requests": list(requested),
        }
    )
    return cases


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, PlanPreauthorizationReceipt):
        return "<receipt>"
    return value


def main() -> None:
    payload = build_payload()
    text = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)
    for marker in ("/Users/", "/home/runner", "/private/var"):
        if marker in text:
            raise SystemExit(f"refusing to write a machine-dependent golden: contains {marker!r}")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")
    steps = sum(len(sequence["steps"]) for sequence in payload["sequences"])
    print(
        f"writes: {len(payload['writes'])}  refused: {len(payload['refused_writes'])}  "
        f"reads: {len(payload['reads'])}"
    )
    print(
        f"sequences: {len(payload['sequences'])} ({steps} graded steps)  "
        f"cas: {len(payload['compare_and_swap'])}  clears: {len(payload['clears'])}"
    )
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
