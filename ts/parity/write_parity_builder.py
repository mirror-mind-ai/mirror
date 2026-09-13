"""Builder delivery-cursor write-parity probe (CV22.DS7.US8 plateau 2).

The synthetic corpus already grades the cursor's bytes exhaustively. This probe
answers a different question: does the sequence hold on a REAL database, starting
from whatever cursor that database already carries?

That starting state is the point. Every synthetic case begins from an empty row,
while a real install begins from a cursor mid-lifecycle — a generation well above
zero, an active item, possibly a pending confirmation and a receipt. The
carry-forward rule (`cursor_generation=None` keeps the stored value) and the
receipt-invalidation rule are both defined RELATIVE to a previous row, so they are
only fully exercised when a previous row exists and was not written by this
harness.

The probe therefore:

  1. reads the journeys the copy actually has, and picks one deterministically;
  2. records the cursor row as it stands, if any;
  3. applies a lifecycle sequence with Python, recording the full
     `runtime_sessions` row after EVERY step;
  4. leaves the copy for the TypeScript verifier, which replays the same sequence
     on its own fresh copy of the same seed and compares the sequences.

Graded as the whole row per step — `interface`, `journey`, `active`, `started_at`,
`closed_at`, `metadata` — with `started_at` the field that proves the upsert
PRESERVED a pre-existing row instead of recreating it.

What this probe does NOT prove: byte parity of `metadata`. The harness
canonicalizes every metadata cell (parse, then key-sorted re-stringify) so write
parity grades the VALUE rather than the serialization dialect. The bytes are the
contract D2 rests on, and they are pinned by `builder-cursor.golden.json` instead.
Saying so here matters, because a green probe could otherwise be mistaken for
proof of the property the revert actually needs.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from memory.builder.delivery_cursor import (
    clear_delivery_cursor,
    get_delivery_cursor,
    set_delivery_cursor,
)
from memory.storage.store import Store

CURSOR_PREFIX = "__builder_delivery_cursor__:"
ADOPTION_PREFIX = "__builder_method_adoption__:"

ROW_COLUMNS = (
    "session_id",
    "interface",
    "journey",
    "active",
    "started_at",
    "updated_at",
    "closed_at",
    "metadata",
)

# The sequence, in the order the real commands write it. Kept free of any value
# derived from the copy so the TypeScript side can rebuild it from the fixture.
SEQUENCE: tuple[tuple[str, dict[str, Any]], ...] = (
    ("sync", {"last_delivery_event": "template_preparation", "cadence_profile": "stepwise"}),
    (
        "pull",
        {
            "active_item": "PARITY.DS1.US1",
            "active_item_title": "Write-parity probe story",
            "active_item_level": "user_story",
            "last_delivery_event": "pulled",
            "cadence_profile": "stepwise",
        },
    ),
    (
        "plan",
        {
            "active_item": "PARITY.DS1.US1",
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
            "active_item": "PARITY.DS1.US1",
            "active_item_level": "user_story",
            "last_delivery_event": "plan_approved",
            "cadence_profile": "stepwise",
        },
    ),
    # An explicit generation bump, which is the only thing that changes it.
    (
        "bump_generation",
        {
            "active_item": "PARITY.DS1.US1",
            "active_item_level": "user_story",
            "last_delivery_event": "plan_approved",
            "cadence_profile": "stepwise",
            "cursor_generation": 99,
        },
    ),
    # An ordinary write afterwards must CARRY 99 forward, not reset it.
    (
        "carry_generation",
        {
            "active_item": "PARITY.DS1.US1",
            "active_item_level": "user_story",
            "last_delivery_event": "validated",
            "cadence_profile": "stepwise",
        },
    ),
)


def _row(conn: sqlite3.Connection, session_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM runtime_sessions WHERE session_id = ?", (session_id,)
    ).fetchone()
    return None if row is None else {column: row[column] for column in ROW_COLUMNS}


def _pick_journey(conn: sqlite3.Connection) -> str:
    """A journey the copy actually has, chosen deterministically.

    Prefers one that ALREADY carries a delivery cursor, because a pre-existing row
    is what makes carry-forward and receipt invalidation real rather than
    synthetic. Falls back to the first journey identity, then to a fixed slug.
    """
    existing = conn.execute(
        """SELECT journey FROM runtime_sessions
            WHERE session_id LIKE ? AND journey IS NOT NULL
            ORDER BY journey LIMIT 1""",
        (f"{CURSOR_PREFIX}%",),
    ).fetchone()
    if existing and existing["journey"]:
        return str(existing["journey"])
    row = conn.execute(
        "SELECT key FROM identity WHERE layer = 'journey' ORDER BY key LIMIT 1"
    ).fetchone()
    return str(row["key"]) if row else "parity-journey"


def builder_cursor_state_probe(python_copy, frozen_datetime, now_iso: str) -> dict[str, Any]:
    """Apply the cursor sequence with Python and record every intermediate row.

    The clock is frozen the way every sibling probe freezes it. Without this the
    rows differ on `updated_at` alone -- `upsert_runtime_session` stamps
    `models._now()` -- and the probe reports a mismatch that is about the harness
    rather than about the port. Measured, not assumed: the first run failed on
    exactly those seven cells.
    """
    import memory.models as models_mod

    models_mod.datetime = frozen_datetime
    conn = get_connection_for(python_copy)
    try:
        journey = _pick_journey(conn)
        session_id = f"{CURSOR_PREFIX}{journey}"
        store = Store(conn)
        # The projection seam is Python-owned and best-effort; a probe must not
        # spawn it, so it is disabled rather than stubbed.
        store.configure_projection_refresh(None)

        starting_row = _row(conn, session_id)
        starting_cursor = get_delivery_cursor(store, journey)
        states: list[dict[str, Any]] = []
        for label, changes in SEQUENCE:
            set_delivery_cursor(store, journey=journey, method="ariad", **changes)
            row = _row(conn, session_id)
            states.append({"label": label, "row": row})
        # And the clear, which deactivates the row rather than deleting it.
        clear_delivery_cursor(store, journey)
        states.append({"label": "clear", "row": _row(conn, session_id)})
        # The TS harness ALSO emits the declared `snapshots` row, so the oracle
        # must append its equivalent or the two states differ by one row and the
        # verdict is a count mismatch rather than a behavioral one. Same shape the
        # soul probe uses (`steps + _snapshot_rows(...)`); the columns must match
        # the `SnapshotSpec` on the TypeScript side exactly.
        snapshot_row = _row(conn, session_id)
        snapshot = {
            "id": f"runtime_sessions:{session_id}",
            "cells": {
                column: (snapshot_row or {}).get(column)
                for column in (
                    "interface",
                    "journey",
                    "active",
                    "started_at",
                    "closed_at",
                    "metadata",
                )
            },
        }
    finally:
        conn.close()

    return {
        "label": "builder_cursor_state",
        "probe_type": "builder_cursor_state",
        "now_iso": now_iso,
        "builder_cursor": {
            "journey": journey,
            "session_id": session_id,
            "sequence": [{"label": label, "changes": changes} for label, changes in SEQUENCE],
            "starting_row": starting_row,
            "starting_generation": None
            if starting_cursor is None
            else starting_cursor.cursor_generation,
        },
        # Graded as an ordered sequence: the step index is part of the row id, so a
        # port that reaches the same END state through different intermediate rows
        # fails rather than passing on the final row alone.
        "python_state": [
            *(
                {
                    "id": f"{index:02d}:{state['label']}",
                    "cells": state["row"] or {"row": None},
                }
                for index, state in enumerate(states)
            ),
            snapshot,
        ],
    }


def get_connection_for(path) -> sqlite3.Connection:
    connection = sqlite3.connect(str(path))
    connection.row_factory = sqlite3.Row
    return connection


PROBES = {"builder_cursor_state": builder_cursor_state_probe}
