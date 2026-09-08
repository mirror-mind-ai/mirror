"""Soul session-state write-parity probe (CV22.DS7.US6 plateau 2).

The unit tests grade the Soul state functions against a golden built on
synthetic databases. This probe grades them where it actually matters: on a
copy of a REAL database, through the same `Store` a live session uses, with a
session row that already carries `operating_mode` metadata written by another
command.

The ritual sequence is the one a real Soul session performs -- mature, mature
again, harvest, decline -- and the graded artifact is the exact
`runtime_sessions.metadata` bytes after EACH step, not only at the end. The
intermediate states are where the interesting divergences live:

  * a soul key added beside `operating_mode` must not disturb it, and must be
    serialized with Python's `", "`/`": "` separators;
  * harvest must promote and pop in one write, never leaving both keys;
  * declining the harvest must remove the `soul` object and keep
    `operating_mode`;
  * on a session with NO other metadata, that same removal must write SQL
    NULL rather than `"{}"`.

The two sessions exist to separate those last two cases, which are the same
code path with different neighbours.

Copy-only: like every probe in this harness, it runs against a copied database
and never touches the source.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from memory.services.soul import (
    apply_identity_integration,
    clear_fruit_in_maturation,
    clear_harvested_fruit,
    harvest_fruit,
    set_fruit_in_maturation,
)
from memory.storage.store import Store

# A session that already carries other metadata, as a live session does.
SOUL_SESSION = "write-parity-soul-session"
# A session whose only metadata is the ritual's, to reach the NULL write.
BARE_SESSION = "write-parity-soul-bare-session"

SEED_OPERATING_MODE = json.dumps(
    {"operating_mode": {"active_mode": "Soul Mode", "active_journey": "mirror-ts-core"}},
    ensure_ascii=False,
)

FIRST_FRUIT = "a first maturation ✦ with unicode kept raw"
SECOND_FRUIT = "  a second maturation that replaces the first  "


def seed_soul_state(store: Store) -> None:
    store.upsert_runtime_session(SOUL_SESSION, interface="pi", metadata=SEED_OPERATING_MODE)
    store.upsert_runtime_session(BARE_SESSION, interface="pi", metadata=None)


def _snapshot_rows(db_path: Path) -> list[dict]:
    """The final row state, in the shape the TS side declares as `snapshots`.

    Note what this can and cannot prove: `writeParityFixture.ts` canonicalizes
    every `metadata` cell (parse, then key-sorted re-stringify) so write parity
    grades the VALUE rather than the serialization dialect. Byte parity of the
    column is therefore pinned by the unit golden, not here; this probe proves
    the state a real database ends in.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = []
        for session_id in (SOUL_SESSION, BARE_SESSION):
            row = conn.execute(
                "SELECT metadata, active FROM runtime_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if row is None:
                continue
            rows.append(
                {
                    "id": f"runtime_sessions:{session_id}",
                    "cells": {"metadata": row["metadata"], "active": row["active"]},
                }
            )
        return rows
    finally:
        conn.close()


def _metadata(db_path: Path, session_id: str) -> str | None:
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            "SELECT metadata FROM runtime_sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def soul_state_probe(python_copy: Path, frozen_datetime, now_iso: str) -> dict:
    import memory.models as models_mod

    original_datetime = models_mod.datetime
    models_mod.datetime = frozen_datetime
    conn = sqlite3.connect(python_copy)
    conn.row_factory = sqlite3.Row
    store = Store(conn)
    steps: list[dict] = []

    def record(step: str, session_id: str) -> None:
        conn.commit()
        steps.append(
            {
                "id": f"soul:{step}",
                "cells": {"metadata": _metadata(python_copy, session_id)},
            }
        )

    try:
        set_fruit_in_maturation(store, FIRST_FRUIT, session_id=SOUL_SESSION)
        record("1_first_maturation", SOUL_SESSION)
        set_fruit_in_maturation(store, SECOND_FRUIT, session_id=SOUL_SESSION)
        record("2_second_maturation", SOUL_SESSION)
        harvest_fruit(store, session_id=SOUL_SESSION)
        record("3_harvest_promotes", SOUL_SESSION)
        clear_harvested_fruit(store, session_id=SOUL_SESSION)
        record("4_decline_keeps_operating_mode", SOUL_SESSION)
        clear_fruit_in_maturation(store, session_id=SOUL_SESSION)
        record("5_clear_absent_key_is_stable", SOUL_SESSION)

        set_fruit_in_maturation(store, "bare session fruit", session_id=BARE_SESSION)
        record("6_bare_session_maturation", BARE_SESSION)
        clear_fruit_in_maturation(store, session_id=BARE_SESSION)
        record("7_bare_session_clear_writes_null", BARE_SESSION)
        conn.commit()
    finally:
        conn.close()
        models_mod.datetime = original_datetime

    return {
        "label": "soul_state_demo",
        "probe_type": "soul_state",
        "now_iso": now_iso,
        "target_ids": [SOUL_SESSION, BARE_SESSION],
        "soul_state": {
            "session_id": SOUL_SESSION,
            "bare_session_id": BARE_SESSION,
            "first_fruit": FIRST_FRUIT,
            "second_fruit": SECOND_FRUIT,
        },
        "python_state": steps + _snapshot_rows(python_copy),
    }


# The identity document the integration appends into. Seeded rather than reused
# from the demo database so the section-insertion branch is exercised on a row
# whose "before" state is known, while everything around it stays real.
APPLY_LAYER = "self"
APPLY_KEY = "soul"
APPLY_SEED_DOCUMENT = (
    "# Soul\n\nA seeded preamble.\n\n## New Incorporated Principles\n\n"
    "- [2026-01-01] an existing principle\n\n## Another Section\n\nmust survive untouched"
)
APPLY_CONTENT = "  a principle integrated by the write-parity probe  "
APPLY_ORIGIN = "  a Soul Mode rite  "


def seed_soul_apply(store: Store) -> None:
    from memory.models import Identity

    store.upsert_identity(Identity(layer=APPLY_LAYER, key=APPLY_KEY, content=APPLY_SEED_DOCUMENT))


def soul_apply_probe(python_copy: Path, frozen_datetime, now_iso: str) -> dict:
    """Integrate one principle on the Python copy; the TS side replays it.

    Both cores are given the same id and clock, so the audit row is comparable
    field by field rather than only in shape.
    """
    import memory.models as models_mod
    import memory.storage.identity as identity_mod

    original_datetime = models_mod.datetime
    original_identity_datetime = identity_mod.datetime
    original_uuid = models_mod._uuid
    models_mod.datetime = frozen_datetime
    identity_mod.datetime = frozen_datetime
    models_mod._uuid = lambda: PROBE_UUID

    conn = sqlite3.connect(python_copy)
    conn.row_factory = sqlite3.Row
    store = Store(conn)
    try:
        apply_identity_integration(
            store,
            layer=APPLY_LAYER,
            key=APPLY_KEY,
            content=APPLY_CONTENT,
            origin=APPLY_ORIGIN,
        )
        conn.commit()
        rows = [
            dict(row)
            for row in conn.execute(
                "SELECT id, layer, key, content, source, origin, conversation_id,"
                " journal_id, created_at, status, metadata FROM identity_integrations"
                " ORDER BY rowid"
            )
        ]
        document = conn.execute(
            "SELECT content FROM identity WHERE layer = ? AND key = ?", (APPLY_LAYER, APPLY_KEY)
        ).fetchone()[0]
    finally:
        conn.close()
        models_mod.datetime = original_datetime
        identity_mod.datetime = original_identity_datetime
        models_mod._uuid = original_uuid

    state = [{"id": f"integration:{index}", "cells": row} for index, row in enumerate(rows)]
    state.append({"id": "identity:document", "cells": {"content": document}})
    return {
        "label": "soul_apply_demo",
        "probe_type": "soul_apply",
        "now_iso": now_iso,
        "target_ids": [f"{APPLY_LAYER}/{APPLY_KEY}"],
        "soul_apply": {
            "layer": APPLY_LAYER,
            "key": APPLY_KEY,
            "content": APPLY_CONTENT,
            "origin": APPLY_ORIGIN,
            "integration_id": PROBE_UUID,
        },
        "python_state": state,
    }


PROBE_UUID = "5ou1pr0b"

SEEDERS = {"soul_state": seed_soul_state, "soul_apply": seed_soul_apply}
PROBES = {"soul_state": soul_state_probe, "soul_apply": soul_apply_probe}
