"""DB-safety-tools write-parity probe (CV22.DS7.TS1 plateau 4).

``repair_encoding`` seeds rows carrying reversible mojibake into user-text
columns across the target tables of a REAL database copy, then grades the
operation `scan -> apply` on that copy: the ordered hit list the scan finds
(Python's ``json.dumps(sort_keys=True)`` of the hits) and the seeded rows'
cells after the single-transaction apply. The synthetic golden already pins
the text repair itself; this probe proves the scan and the write over a
real-shaped schema with FTS triggers, real rowids, and rows that must NOT be
touched sitting beside the seeded ones.

The backup archive is graded by the lifecycle smoke instead: it needs both
engines' real CLIs on the same file and Python's ``zipfile`` reading the
TypeScript archive, which is a process-level check, not a row-state one.
"""

from __future__ import annotations

import json
from pathlib import Path

from memory.cli import repair_encoding
from memory.storage import Store

# Seeded rows, keyed so both cores snapshot the same cells afterwards.
IDENTITY_KEY = "parity-mojibake-persona"
MEMORY_ID = "parity-mojibake-memory"
CONVERSATION_ID = "parity-mojibake-conversation"
MESSAGE_ID = "parity-mojibake-message"
TASK_ID = "parity-mojibake-task"
CLEAN_MEMORY_ID = "parity-clean-memory"

SEED_ROWS: tuple[tuple[str, dict[str, object]], ...] = (
    (
        "identity",
        {
            "id": "parity-mojibake-identity-id",
            "layer": "persona",
            "key": IDENTITY_KEY,
            "content": "# Reflex\u00c3\u00a3o\n\nPersona de paridade com \u00c3\u201cculos.",
            "created_at": "2026-09-07T12:00:00.000000Z",
            "updated_at": "2026-09-07T12:00:00.000000Z",
        },
    ),
    (
        "memories",
        {
            "id": MEMORY_ID,
            "memory_type": "insight",
            "layer": "ego",
            "title": "Parity mojibake memory",
            "content": "Mem\u00c3\u00b3ria semeada pela sonda de paridade",
            "journey": "jornada-\u00c3\u00a9pica",
            "created_at": "2026-09-07T12:00:00.000000Z",
        },
    ),
    (
        "memories",
        {
            "id": CLEAN_MEMORY_ID,
            "memory_type": "insight",
            "layer": "ego",
            "title": "Parity clean memory",
            "content": "\u00c2ncora leg\u00edtima que n\u00e3o deve mudar",
            "journey": None,
            "created_at": "2026-09-07T12:00:00.000000Z",
        },
    ),
    (
        "conversations",
        {
            "id": CONVERSATION_ID,
            "title": "T\u00c3\u00adtulo semeado",
            "started_at": "2026-09-07T12:00:00.000000Z",
            "interface": "pi",
            "persona": "\u00c3\u2030tica",
            "journey": None,
            "summary": None,
        },
    ),
    (
        "messages",
        {
            "id": MESSAGE_ID,
            "conversation_id": CONVERSATION_ID,
            "role": "user",
            "content": "  muitos   espa\u00c3\u00a7os \t aqui  ",
            "created_at": "2026-09-07T12:00:01.000000Z",
        },
    ),
    (
        "tasks",
        {
            "id": TASK_ID,
            "title": "Tarefa \u00c3\u00ba",
            "status": "pendente",
            "journey": None,
            "created_at": "2026-09-07T12:00:00.000000Z",
            "updated_at": "2026-09-07T12:00:00.000000Z",
        },
    ),
)


def _existing_columns(conn, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def seed_repair_encoding(store: Store) -> None:
    """Insert the mojibake rows, keeping only the columns the copy's schema has."""
    conn = store.conn
    for table, values in SEED_ROWS:
        present = _existing_columns(conn, table)
        cells = {column: value for column, value in values.items() if column in present}
        columns = ", ".join(f'"{c}"' for c in cells)
        marks = ", ".join("?" for _ in cells)
        conn.execute(f'INSERT INTO "{table}" ({columns}) VALUES ({marks})', tuple(cells.values()))


def _hits_json(hits) -> str:
    return json.dumps(
        [
            {"after": h.after, "before": h.before, "column": h.column, "row_id": h.row_id, "table": h.table}
            for h in hits
        ],
        sort_keys=True,
        ensure_ascii=True,
    )


def repair_encoding_probe(python_copy: Path, frozen_datetime, now_iso: str) -> dict:
    """Scan, apply, scan again on the Python copy; the TS side replays the same."""
    hits = repair_encoding.scan_database(python_copy)
    applied = repair_encoding.apply_repairs(python_copy, hits)
    remaining = repair_encoding.scan_database(python_copy)
    state = [
        {"id": "hits:json", "cells": {"json": _hits_json(hits)}},
        {"id": "apply:count", "cells": {"applied": applied, "remaining": len(remaining)}},
    ]
    return {
        "label": "repair_encoding_demo",
        "probe_type": "repair_encoding",
        "now_iso": now_iso,
        "target_ids": [IDENTITY_KEY, MEMORY_ID, CLEAN_MEMORY_ID, CONVERSATION_ID, MESSAGE_ID, TASK_ID],
        "repair_encoding": {
            "identity_keys": [IDENTITY_KEY],
            "memory_ids": [MEMORY_ID, CLEAN_MEMORY_ID],
            "conversation_ids": [CONVERSATION_ID],
            "message_ids": [MESSAGE_ID],
            "task_ids": [TASK_ID],
        },
        # The seeded rows' cells after apply ride as snapshots on the TS side;
        # here they are read the same way so the ids and columns line up.
        "python_state": state + _snapshot_rows(python_copy),
    }


_SNAPSHOTS: tuple[tuple[str, str, tuple[str, ...], tuple[str, ...]], ...] = (
    ("identity", "key", ("content",), (IDENTITY_KEY,)),
    ("memories", "id", ("content", "journey", "layer"), (MEMORY_ID, CLEAN_MEMORY_ID)),
    ("conversations", "id", ("title", "summary", "journey", "persona"), (CONVERSATION_ID,)),
    ("messages", "id", ("content",), (MESSAGE_ID,)),
    ("tasks", "id", ("title", "journey", "status"), (TASK_ID,)),
)


def _snapshot_rows(db_path: Path) -> list[dict]:
    import sqlite3

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows: list[dict] = []
        for table, key_column, columns, selector in _SNAPSHOTS:
            present = _existing_columns(conn, table)
            selected = [c for c in columns if c in present]
            placeholders = ", ".join("?" for _ in selector)
            cursor = conn.execute(
                f'SELECT "{key_column}", {", ".join(f"{chr(34)}{c}{chr(34)}" for c in selected)} '
                f'FROM "{table}" WHERE "{key_column}" IN ({placeholders}) ORDER BY "{key_column}"',
                selector,
            )
            for row in cursor:
                rows.append(
                    {
                        "id": f"{table}:{row[key_column]}",
                        "cells": {c: row[c] for c in selected},
                    }
                )
        return rows
    finally:
        conn.close()


SEEDERS = {"repair_encoding": seed_repair_encoding}
PROBES = {"repair_encoding": repair_encoding_probe}
