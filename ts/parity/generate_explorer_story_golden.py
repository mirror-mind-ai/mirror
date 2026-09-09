"""Generate the Explorer Story state golden fixture (CV22.DS7.US7 plateau 2).

`services/explorer_story.py` keeps an Exploratory Story in TWO places at once,
and the graded artifact is what both of them contain after each operation --
the `exploratory_stories` row AND the `__explorer_story__:<journey>` runtime
session, cell by cell, because a value comparison cannot see the differences
that matter here:

  * the four `*_json` columns are written `ensure_ascii=False` in INSERTION
    order, never sorted, so `JSON.stringify` stores different bytes for
    identical state;
  * an absent experiment or handoff is SQL `NULL`, not the string `"null"` --
    invisible to a parsed comparison, and a real data-shape contract;
  * `upsert` preserves `id` and `created_at` from the existing active row and
    only moves `updated_at`.

The load-bearing family is the LEGACY FALLBACK. `get_explorer_story` reads the
durable row first and falls back to the runtime-state payload, which is how any
install that has not written a story since DS8 still sees its work. Porting the
table without the fallback empties those stories silently -- the same class as
the `conversations append` data loss (CR055), arriving through a read. That path
has no test coverage on either side today, so its malformed inputs are graded
here: invalid JSON, a JSON array, a JSON string, non-string fields, attractors
that are not a list, an attractor with no label, and an inactive session row.

The docstring in the service calls that payload "pre-DS8". It understates it:
`_store_story` still writes BOTH stores on every mutation, so the fallback is a
live dual write, not a legacy read. A port that drops it also stops feeding
whatever still reads it.

`_projected_story` is graded as its own family. It decides whether a mutation
requests a Journey projection refresh, and it deliberately EXCLUDES
`current_story` and `last_story_card` while including `title` -- which
`_derive_title` derives from `current_story`. So editing the story text usually
does request a refresh, and editing only the last card never does. That
asymmetry is behavior (CV22.DS7.US7 plan, Scope Amendment item 16).

Volatile fields are frozen: `storage/explorer_stories.py` imports `_now` and
`_uuid` BY VALUE (`from memory.models import ...`), so patching `memory.models`
would not reach it and the patch is applied to the storage module itself.

Run:  uv run python ts/parity/generate_explorer_story_golden.py
"""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "explorer-story.golden.json"

JOURNEY = "probe-journey"
SESSION_PREFIX = "__explorer_story__:"

# Volatile fields advance deterministically rather than freezing to a constant.
# A constant clock makes `ORDER BY updated_at DESC` a tie that SQLite breaks by
# whatever it likes, and a constant id makes the second INSERT after an archive
# collide on `ON CONFLICT(id)` -- which silently UPDATES the archived row
# without restoring `status='active'`, so the very next read raises "failed to
# persist active Exploratory Story". Both are generator artifacts, but they are
# the shape of two real properties, so the corpus keeps them distinguishable
# instead of frozen flat.
CLOCK_BASE = "2026-09-09T12:%02d:00Z"
UUID_TEMPLATE = "explorer-%02d"

ASTRAL = "🌱 a seed 🎯 and a target"
CJK = "沉默不是空白而是尚未成形的語言"


def _rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Every durable row, cell by cell, so NULL and \"null\" cannot be confused."""
    cursor = conn.execute(
        "SELECT * FROM exploratory_stories WHERE journey = ? ORDER BY created_at, id",
        (JOURNEY,),
    )
    columns = [description[0] for description in cursor.description]
    return [
        {column: (None if value is None else value) for column, value in zip(columns, row)}
        for row in cursor.fetchall()
    ]


def _runtime(conn: sqlite3.Connection) -> dict[str, Any]:
    row = conn.execute(
        "SELECT metadata, active FROM runtime_sessions WHERE session_id = ?",
        (f"{SESSION_PREFIX}{JOURNEY}",),
    ).fetchone()
    if row is None:
        return {"row_present": False, "metadata": None, "active": None}
    return {"row_present": True, "metadata": row[0], "active": row[1]}


def _story_dict(story: Any) -> Any:
    """Flatten an ExplorerStory into JSON, preserving None vs absent."""
    if story is None:
        return None
    return {
        "journey": story.journey,
        "current_exploratory_story": story.current_exploratory_story,
        "narrative_field_summary": story.narrative_field_summary,
        "last_story_card": story.last_story_card,
        "attractors": [
            {"label": a.label, "description": a.description, "status": a.status}
            for a in story.attractors
        ],
        "experiment_proposal": (
            {
                "title": story.experiment_proposal.title,
                "description": story.experiment_proposal.description,
                "status": story.experiment_proposal.status,
            }
            if story.experiment_proposal
            else None
        ),
        "builder_handoff": (
            {
                "title": story.builder_handoff.title,
                "summary": story.builder_handoff.summary,
                "readiness": story.builder_handoff.readiness,
                "artifact_dir": story.builder_handoff.artifact_dir,
                "index_path": story.builder_handoff.index_path,
                "exploratory_story_path": story.builder_handoff.exploratory_story_path,
                "handoff_info_path": story.builder_handoff.handoff_info_path,
                "product_design_proposal_path": story.builder_handoff.product_design_proposal_path,
                "full_conversation_path": story.builder_handoff.full_conversation_path,
            }
            if story.builder_handoff
            else None
        ),
        "source_conversations": [
            {"conversation_id": s.conversation_id, "title": s.title, "role": s.role}
            for s in story.source_conversations
        ],
        "id": story.id,
        "title": story.title,
        "status": story.status,
        "created_at": story.created_at,
        "updated_at": story.updated_at,
        "promoted_at": story.promoted_at,
        "archived_at": story.archived_at,
    }


def build(make_store) -> dict[str, Any]:
    import memory.storage.explorer_stories as storage_mod
    from memory.services.explorer_story import (
        _projected_story,
        _UNSET,
        ExplorerAttractor,
        ExplorerBuilderHandoff,
        ExplorerExperimentProposal,
        ExplorerSourceConversation,
        ExplorerStory,
        archive_explorer_story,
        clear_explorer_story,
        get_explorer_story,
        list_explorer_stories,
        mark_explorer_story_promoted,
        render_explorer_story_context,
        set_explorer_attractors,
        set_explorer_builder_handoff,
        set_explorer_experiment_proposal,
        set_explorer_source_conversations,
        update_explorer_story,
    )

    payload: dict[str, Any] = {}

    # --- A. the _UNSET / None / blank matrix on update -------------------
    # Three optional scalars, each distinguishing "not passed" (keep) from
    # "passed empty" (clear). A port that maps both to `undefined` silently
    # turns every clear into a keep.
    update_cases: list[dict[str, Any]] = []
    matrix = [
        ("omitted", _UNSET),
        ("none", None),
        ("empty_string", ""),
        ("blank_string", "   "),
        ("padded_value", "  a value with padding  "),
        ("value", "a value"),
    ]
    for seeded in (False, True):
        for name, value in matrix:
            store, conn = make_store()
            if seeded:
                update_explorer_story(
                    store,
                    JOURNEY,
                    current_exploratory_story="seeded story",
                    narrative_field_summary="seeded summary",
                    last_story_card="seeded card",
                )
            result = update_explorer_story(store, JOURNEY, current_exploratory_story=value)
            update_cases.append(
                {
                    "name": f"{'seeded' if seeded else 'fresh'}_current_story_{name}",
                    "seeded": seeded,
                    "field": "current_exploratory_story",
                    "argument": "__UNSET__" if value is _UNSET else value,
                    "result": _story_dict(result),
                    "rows": _rows(conn),
                    "runtime": _runtime(conn),
                }
            )
    # The other two scalars, seeded only -- the branch that matters is "keep".
    for field in ("narrative_field_summary", "last_story_card"):
        for name, value in (("omitted", _UNSET), ("none", None), ("value", "replaced")):
            store, conn = make_store()
            update_explorer_story(
                store,
                JOURNEY,
                current_exploratory_story="seeded story",
                narrative_field_summary="seeded summary",
                last_story_card="seeded card",
            )
            result = update_explorer_story(store, JOURNEY, **{field: value})
            update_cases.append(
                {
                    "name": f"seeded_{field}_{name}",
                    "seeded": True,
                    "field": field,
                    "argument": "__UNSET__" if value is _UNSET else value,
                    "result": _story_dict(result),
                    "rows": _rows(conn),
                    "runtime": _runtime(conn),
                }
            )
    payload["update_matrix"] = update_cases

    # --- B. the legacy runtime-state fallback ----------------------------
    # The read path an install that has not written since DS8 still uses.
    legacy_payloads: list[tuple[str, str | None, bool]] = [
        (
            "valid_full",
            json.dumps(
                {
                    "current_exploratory_story": "a legacy story",
                    "narrative_field_summary": "a legacy summary",
                    "last_story_card": "a legacy card",
                    "attractors": [
                        {"label": "legacy attractor", "description": "detail", "status": "accepted"}
                    ],
                    "experiment_proposal": {"title": "legacy experiment", "status": "accepted"},
                    "builder_handoff": {"title": "legacy handoff", "readiness": "confirmed"},
                    "source_conversations": [
                        {"conversation_id": "conv-1", "title": "t", "role": "origin"}
                    ],
                },
                ensure_ascii=False,
            ),
            True,
        ),
        ("valid_minimal", json.dumps({"current_exploratory_story": "only text"}), True),
        ("invalid_json", "{not json at all", True),
        ("json_array", json.dumps([{"current_exploratory_story": "x"}]), True),
        ("json_string", json.dumps("a bare string"), True),
        ("json_null", json.dumps(None), True),
        ("empty_object", json.dumps({}), True),
        ("empty_string_metadata", "", True),
        ("non_string_fields", json.dumps({"current_exploratory_story": 42, "attractors": 7}), True),
        ("blank_string_fields", json.dumps({"current_exploratory_story": "   "}), True),
        (
            "attractor_without_label",
            json.dumps({"attractors": [{"description": "no label"}, {"label": "kept"}]}),
            True,
        ),
        (
            "attractor_not_a_dict",
            json.dumps({"attractors": ["a string", {"label": "kept"}]}),
            True,
        ),
        (
            "invalid_status_falls_back",
            json.dumps({"attractors": [{"label": "l", "status": "invented"}]}),
            True,
        ),
        (
            "experiment_without_title",
            json.dumps({"experiment_proposal": {"description": "no title"}}),
            True,
        ),
        ("handoff_without_title", json.dumps({"builder_handoff": {"summary": "no title"}}), True),
        (
            "source_without_id",
            json.dumps({"source_conversations": [{"title": "no id"}, {"conversation_id": "kept"}]}),
            True,
        ),
        (
            "source_blank_role_defaults",
            json.dumps({"source_conversations": [{"conversation_id": "c", "role": "  "}]}),
            True,
        ),
        ("null_metadata", None, True),
        (
            "inactive_session_is_ignored",
            json.dumps({"current_exploratory_story": "must not be read"}),
            False,
        ),
    ]
    legacy_cases = []
    for name, metadata, active in legacy_payloads:
        store, conn = make_store()
        store.upsert_runtime_session(
            f"{SESSION_PREFIX}{JOURNEY}",
            interface="explorer_story",
            journey=JOURNEY,
            active=active,
            metadata=metadata,
        )
        legacy_cases.append(
            {
                "name": name,
                "seed_metadata": metadata,
                "seed_active": active,
                "story": _story_dict(get_explorer_story(store, JOURNEY)),
            }
        )
    # A durable row WINS over a legacy payload, and updating a legacy-only
    # story migrates it into the durable table.
    store, conn = make_store()
    store.upsert_runtime_session(
        f"{SESSION_PREFIX}{JOURNEY}",
        interface="explorer_story",
        journey=JOURNEY,
        active=True,
        metadata=json.dumps({"current_exploratory_story": "legacy text", "last_story_card": "lc"}),
    )
    migrated = update_explorer_story(store, JOURNEY, narrative_field_summary="added later")
    legacy_cases.append(
        {
            "name": "legacy_story_migrates_into_durable_on_update",
            "seed_metadata": "(see name)",
            "seed_active": True,
            "story": _story_dict(migrated),
            "rows": _rows(conn),
            "runtime": _runtime(conn),
        }
    )
    payload["legacy_fallback"] = legacy_cases

    # --- C. JSON column bytes and the NULL contract ----------------------
    column_cases = []

    def column_case(name: str, mutate):
        store, conn = make_store()
        update_explorer_story(store, JOURNEY, current_exploratory_story="base story")
        result = None
        error = None
        try:
            result = mutate(store)
        except ValueError as exc:
            error = str(exc)
        case: dict[str, Any] = {"name": name, "rows": _rows(conn), "runtime": _runtime(conn)}
        if error is not None:
            case["expected_error"] = error
        else:
            case["result"] = _story_dict(result)
        column_cases.append(case)

    column_case("base_has_null_experiment_and_handoff", lambda store: get_explorer_story(store, JOURNEY))
    column_case(
        "attractors_unicode_insertion_order",
        lambda store: set_explorer_attractors(
            store,
            JOURNEY,
            [
                ExplorerAttractor(label=ASTRAL, description=CJK, status="accepted"),
                ExplorerAttractor(label="  padded  ", status="invented"),
            ],
        ),
    )
    column_case(
        "attractors_empty_list_clears",
        lambda store: set_explorer_attractors(store, JOURNEY, []),
    )
    column_case(
        "attractor_blank_label_refuses",
        lambda store: set_explorer_attractors(store, JOURNEY, [ExplorerAttractor(label="   ")]),
    )
    column_case(
        "experiment_written",
        lambda store: set_explorer_experiment_proposal(
            store, JOURNEY, ExplorerExperimentProposal(title=CJK, description=None, status="accepted")
        ),
    )
    column_case(
        "experiment_blank_title_refuses",
        lambda store: set_explorer_experiment_proposal(
            store, JOURNEY, ExplorerExperimentProposal(title=" ")
        ),
    )
    column_case(
        "handoff_written",
        lambda store: set_explorer_builder_handoff(
            store,
            JOURNEY,
            ExplorerBuilderHandoff(
                title="a handoff",
                summary=None,
                readiness="confirmed",
                artifact_dir="/tmp/x",
                index_path="/tmp/x/index.md",
            ),
        ),
    )
    column_case(
        "handoff_invalid_readiness_falls_back",
        lambda store: set_explorer_builder_handoff(
            store, JOURNEY, ExplorerBuilderHandoff(title="a handoff", readiness="whatever")
        ),
    )
    column_case(
        "handoff_blank_title_refuses",
        lambda store: set_explorer_builder_handoff(store, JOURNEY, ExplorerBuilderHandoff(title="")),
    )
    column_case(
        "source_conversations_written",
        lambda store: set_explorer_source_conversations(
            store,
            JOURNEY,
            [
                ExplorerSourceConversation(conversation_id="c1", title=ASTRAL, role="origin"),
                ExplorerSourceConversation(conversation_id="c2", title=None, role="   "),
            ],
        ),
    )
    column_case(
        "source_conversation_blank_id_refuses",
        lambda store: set_explorer_source_conversations(
            store, JOURNEY, [ExplorerSourceConversation(conversation_id="  ")]
        ),
    )
    payload["columns"] = column_cases

    # --- D. identity preservation across upserts -------------------------
    # `id` and `created_at` survive; only `updated_at` moves.
    store, conn = make_store()
    first = update_explorer_story(store, JOURNEY, current_exploratory_story="first")
    second = update_explorer_story(store, JOURNEY, current_exploratory_story="second")
    payload["upsert_identity"] = {
        "first": _story_dict(first),
        "second": _story_dict(second),
        "rows": _rows(conn),
    }

    # --- E. list ordering and lifecycle transitions ----------------------
    store, conn = make_store()
    update_explorer_story(store, JOURNEY, current_exploratory_story="story one")
    archived = archive_explorer_story(store, JOURNEY)
    after_archive_runtime = _runtime(conn)
    update_explorer_story(store, JOURNEY, current_exploratory_story="story two")
    promoted = mark_explorer_story_promoted(store, JOURNEY)
    update_explorer_story(store, JOURNEY, current_exploratory_story="story three")
    payload["lifecycle"] = {
        "archived": _story_dict(archived),
        "runtime_after_archive": after_archive_runtime,
        "promoted": _story_dict(promoted),
        "list": [_story_dict(story) for story in list_explorer_stories(store, JOURNEY)],
        "rows": _rows(conn),
    }
    # archive / promote with nothing active still clears the runtime payload.
    store, conn = make_store()
    payload["archive_without_story"] = {
        "result": _story_dict(archive_explorer_story(store, JOURNEY)),
        "runtime": _runtime(conn),
    }
    store, conn = make_store()
    payload["promote_without_story"] = {
        "result": _story_dict(mark_explorer_story_promoted(store, JOURNEY)),
        "runtime": _runtime(conn),
    }
    # `clear` is archive under another name, kept for the pre-DS8 CLI.
    store, conn = make_store()
    update_explorer_story(store, JOURNEY, current_exploratory_story="to be cleared")
    clear_explorer_story(store, JOURNEY)
    payload["clear_is_archive"] = {"rows": _rows(conn), "runtime": _runtime(conn)}

    # --- F. _derive_title ------------------------------------------------
    title_cases = []
    for name, story_text, summary in (
        ("from_story", "a short story", None),
        ("first_line_only", "first line\nsecond line\nthird", None),
        ("strips_before_splitting", "\n\n  padded first line  \n\nrest", None),
        ("truncates_at_80", "x" * 200, None),
        ("truncation_then_strip", ("y" * 79) + "   tail", None),
        ("falls_back_to_summary", None, "the summary becomes the title"),
        ("falls_back_to_constant", None, None),
        ("unicode_counts_code_points", ASTRAL * 8, None),
    ):
        store, conn = make_store()
        update_explorer_story(
            store,
            JOURNEY,
            current_exploratory_story=story_text,
            narrative_field_summary=summary,
        )
        rows = _rows(conn)
        title_cases.append(
            {
                "name": name,
                "current_story": story_text,
                "narrative_summary": summary,
                "title": rows[0]["title"] if rows else None,
            }
        )
    payload["derive_title"] = title_cases

    # --- G. _projected_story change detection ----------------------------
    # Decides whether a mutation asks for a Journey projection refresh.
    # `current_story` and `last_story_card` are NOT compared; `title` is, and
    # `_derive_title` derives it from `current_story`.
    def story(**kwargs: Any) -> ExplorerStory:
        base: dict[str, Any] = {"journey": JOURNEY, "id": "id-1", "title": "t", "status": "active"}
        base.update(kwargs)
        return ExplorerStory(**base)

    projection_cases = []
    for name, left, right in (
        ("identical", story(), story()),
        ("none_vs_story", None, story()),
        ("both_none", None, None),
        (
            "current_story_is_not_compared",
            story(current_exploratory_story="a"),
            story(current_exploratory_story="b"),
        ),
        ("last_card_is_not_compared", story(last_story_card="a"), story(last_story_card="b")),
        ("title_is_compared", story(title="a"), story(title="b")),
        ("status_is_compared", story(status="active"), story(status="archived")),
        ("id_is_compared", story(id="a"), story(id="b")),
        (
            "summary_is_compared",
            story(narrative_field_summary="a"),
            story(narrative_field_summary="b"),
        ),
        (
            "attractors_are_compared",
            story(attractors=(ExplorerAttractor(label="a"),)),
            story(attractors=(ExplorerAttractor(label="b"),)),
        ),
        (
            "attractor_order_is_compared",
            story(attractors=(ExplorerAttractor(label="a"), ExplorerAttractor(label="b"))),
            story(attractors=(ExplorerAttractor(label="b"), ExplorerAttractor(label="a"))),
        ),
        (
            "experiment_is_compared",
            story(experiment_proposal=ExplorerExperimentProposal(title="a")),
            story(experiment_proposal=ExplorerExperimentProposal(title="b")),
        ),
        (
            "handoff_is_compared",
            story(builder_handoff=ExplorerBuilderHandoff(title="a")),
            story(builder_handoff=ExplorerBuilderHandoff(title="b")),
        ),
        (
            "handoff_present_vs_absent",
            story(builder_handoff=None),
            story(builder_handoff=ExplorerBuilderHandoff(title="a")),
        ),
        (
            "source_conversations_are_not_compared",
            story(source_conversations=(ExplorerSourceConversation(conversation_id="a"),)),
            story(source_conversations=(ExplorerSourceConversation(conversation_id="b"),)),
        ),
    ):
        projection_cases.append(
            {
                "name": name,
                "left": _story_dict(left),
                "right": _story_dict(right),
                "refresh_requested": _projected_story(left) != _projected_story(right),
            }
        )
    payload["projection_change_detection"] = projection_cases

    # --- H. render_explorer_story_context --------------------------------
    context_cases = []
    for name, build_story in (
        ("minimal", lambda: ExplorerStory(journey=JOURNEY)),
        (
            "full",
            lambda: ExplorerStory(
                journey=JOURNEY,
                id="id-1",
                title="A title",
                status="active",
                current_exploratory_story="the story\nover two lines",
                narrative_field_summary="the summary",
                last_story_card="the card",
                attractors=(
                    ExplorerAttractor(label="with detail", description="detail", status="accepted"),
                    ExplorerAttractor(label="without detail"),
                ),
                experiment_proposal=ExplorerExperimentProposal(
                    title="an experiment", description="how", status="accepted"
                ),
                source_conversations=(
                    ExplorerSourceConversation(conversation_id="c1", title="t", role="origin"),
                    ExplorerSourceConversation(conversation_id="c2"),
                ),
                builder_handoff=ExplorerBuilderHandoff(
                    title="a handoff",
                    readiness="confirmed",
                    artifact_dir="/tmp/dir",
                    index_path="/tmp/dir/index.md",
                    full_conversation_path="/tmp/dir/full-conversation.md",
                ),
            ),
        ),
        (
            "handoff_without_optional_paths",
            lambda: ExplorerStory(
                journey=JOURNEY,
                builder_handoff=ExplorerBuilderHandoff(title="bare handoff"),
            ),
        ),
        ("unicode", lambda: ExplorerStory(journey=JOURNEY, current_exploratory_story=ASTRAL)),
    ):
        context_cases.append(
            {"name": name, "story": _story_dict(build_story()), "expected_stdout": render_explorer_story_context(build_story())}
        )
    payload["context_render"] = context_cases

    # --- I. journey normalization ----------------------------------------
    normalization = []
    for name, journey in (("padded", f"  {JOURNEY}  "), ("blank", "   "), ("empty", "")):
        store, _ = make_store()
        try:
            result = update_explorer_story(store, journey, current_exploratory_story="x")
            normalization.append({"name": name, "journey": journey, "result": _story_dict(result)})
        except ValueError as exc:
            normalization.append({"name": name, "journey": journey, "expected_error": str(exc)})
    payload["journey_normalization"] = normalization

    return payload


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "explorer-fixture"
        home.mkdir()
        # `memory.config` re-applies `.env` on import; clear the ambient
        # environment so the generator cannot reach a developer's real home
        # (CR065).
        for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "OPENROUTER_API_KEY"):
            os.environ.pop(key, None)
        os.environ["MIRROR_HOME"] = str(home)
        os.environ["MIRROR_USER"] = home.name
        os.environ["DB_PATH"] = str(home / "memory.db")

        from memory.db.connection import get_connection
        import memory.storage.explorer_stories as storage_mod
        from memory.storage.store import Store

        # `storage/explorer_stories.py` imports these BY VALUE, so the patch
        # must land on the storage module, not on `memory.models`. Each case
        # restarts the sequences so a scenario's ids and timestamps do not
        # depend on how many scenarios ran before it.
        ticks = {"clock": 0, "uuid": 0}

        def next_now() -> str:
            ticks["clock"] += 1
            return CLOCK_BASE % ticks["clock"]

        def next_uuid() -> str:
            ticks["uuid"] += 1
            return UUID_TEMPLATE % ticks["uuid"]

        storage_mod._now = next_now
        storage_mod._uuid = next_uuid

        counter = {"n": 0}

        def make_store():
            counter["n"] += 1
            ticks["clock"] = 0
            ticks["uuid"] = 0
            path = home / f"case-{counter['n']:03d}.db"
            conn = get_connection(path)
            opened = Path(conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
            if not opened.is_relative_to(Path(tmp).resolve()):
                raise RuntimeError(f"refusing non-temporary fixture database: {opened}")
            # A bare Store has no projection callback wired, so the generator
            # cannot publish into anyone's project. Publication parity is not
            # this artifact's subject; the delegated seam is graded separately.
            return Store(conn), conn

        payload = build(make_store)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    counts = {key: len(value) if isinstance(value, list) else 1 for key, value in payload.items()}
    print(", ".join(f"{key}={count}" for key, count in sorted(counts.items())))
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
