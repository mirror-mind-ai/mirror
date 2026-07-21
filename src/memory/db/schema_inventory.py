"""Canonical, cross-language schema inventory for the TS custody-transfer contract.

CV22.DS6.TS1 ports the fresh-database DDL (`memory.db.schema.SCHEMA`) to
TypeScript. Parity between a TS-created and a Python-created fresh database is
proven structurally, not by comparing raw `sqlite_master.sql` text: CV0
rewrites DDL comments to English on the TS side while the frozen Python DDL
keeps its historical (partly Portuguese) comments, so literal SQL text differs
on `identity` and `consolidations` even when the schema is identical.

`build_schema_inventory()` produces a canonical, JSON-serializable structure
covering tables (columns, foreign keys, and a comment-stripped/whitespace-
normalized `CREATE TABLE` body that captures CHECK constraints), indexes
(including partial-index predicates and the autoindexes SQLite creates for
inline `UNIQUE` table constraints), and triggers.

`ts/src/db/schemaInventory.ts` is an independent TypeScript implementation of
the same contract; `ts/src/db/schemaInventorySnapshot.ts` is the committed
snapshot both sides are graded against. This module's counterpart test
(`tests/unit/memory/db/test_schema_inventory_snapshot.py`) regenerates the
inventory from a live fresh Python database and fails if it no longer matches
that committed snapshot, so a Python schema/migration change cannot silently
drift from the TS build without updating the snapshot in the same commit —
mirroring the existing `KNOWN_MIGRATION_IDS` contract
(`tests/unit/test_ts_schema_contract.py`).

FTS5-internal shadow tables (`<virtual-table>_data`/`_idx`/`_docsize`/
`_config`/`_content`) are deliberately excluded from structural comparison:
their exact internal shape is a SQLite-library-version implementation detail,
not part of our DDL contract, and Python and Node may link different SQLite
versions. The virtual table's own `CREATE VIRTUAL TABLE` declaration is
compared, and FTS behavior is proven functionally (insert/update/delete plus
the `fts5(...)` integrity-check) rather than structurally.
"""

from __future__ import annotations

import re
import sqlite3

# Tables that are custody-transfer scope boundaries, not part of the TS1 DDL
# contract:
#   - `_migrations`: bookkeeping for the migration engine (CV22.DS6.TS2). A
#     fresh Python database has it (via `run_migrations`); a TS1
#     `createSchema()` fresh database intentionally does not yet.
#   - `sqlite_sequence`: SQLite's own AUTOINCREMENT bookkeeping table, created
#     as a side effect of `memory_access_log`'s `INTEGER PRIMARY KEY
#     AUTOINCREMENT` column. It carries no independent DDL to port.
_EXCLUDED_TABLES = frozenset({"_migrations", "sqlite_sequence"})

# FTS5 shadow-table suffixes the FTS5 module creates automatically for every
# virtual table it manages. Excluded from structural comparison — see the
# module docstring.
_FTS_SHADOW_SUFFIXES = ("_data", "_idx", "_docsize", "_config", "_content")


def normalize_sql(sql: str | None) -> str | None:
    """Strip SQL comments and collapse whitespace, preserving string literals.

    Makes two DDL statements comparable when they differ only in comment
    language/presence or incidental formatting (indentation, line breaks, or
    whitespace immediately before `,`/`)` — the shape SQLite's own `ALTER
    TABLE ADD COLUMN` produces when it textually splices a new column
    definition into a table's stored `CREATE TABLE` text) — exactly the
    TS-English-comments-vs-Python-mixed-comments (and TS-hand-written-DDL-vs-
    Python-migration-spliced-DDL) situations this contract must tolerate.
    `ts/src/db/schemaInventory.ts` implements the identical algorithm; keep
    the two in lockstep.
    """
    if sql is None:
        return None
    out: list[str] = []
    in_string = False
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        if in_string:
            out.append(ch)
            if ch == "'":
                if i + 1 < n and sql[i + 1] == "'":
                    out.append(sql[i + 1])
                    i += 2
                    continue
                in_string = False
            i += 1
            continue
        if ch == "'":
            in_string = True
            out.append(ch)
            i += 1
            continue
        if ch == "-" and i + 1 < n and sql[i + 1] == "-":
            newline = sql.find("\n", i)
            i = n if newline == -1 else newline
            continue
        if ch == "/" and i + 1 < n and sql[i + 1] == "*":
            end = sql.find("*/", i + 2)
            i = n if end == -1 else end + 2
            continue
        out.append(ch)
        i += 1
    collapsed = re.sub(r"\s+", " ", "".join(out)).strip()
    return re.sub(r"\s+([,)])", r"\1", collapsed)


def _virtual_table_names(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' "
        "AND sql LIKE 'CREATE VIRTUAL TABLE%'"
    ).fetchall()
    return {row[0] for row in rows}


def _is_fts_shadow_table(name: str, virtual_tables: set[str]) -> bool:
    return any(
        name == f"{vt}{suffix}" for vt in virtual_tables for suffix in _FTS_SHADOW_SUFFIXES
    )


def _table_inventory(conn: sqlite3.Connection, name: str, sql: str | None) -> dict:
    columns = [
        {
            "name": row[1],
            "type": row[2],
            "notnull": row[3],
            "dflt_value": row[4],
            "pk": row[5],
        }
        for row in conn.execute(f'PRAGMA table_info("{name}")').fetchall()
    ]
    foreign_keys = sorted(
        (
            {
                "table": row[2],
                "from": row[3],
                "to": row[4],
                "on_update": row[5],
                "on_delete": row[6],
                "match": row[7],
            }
            for row in conn.execute(f'PRAGMA foreign_key_list("{name}")').fetchall()
        ),
        key=lambda fk: (fk["table"], fk["from"]),
    )
    return {"columns": columns, "foreign_keys": foreign_keys, "sql": normalize_sql(sql)}


def _index_inventory(conn: sqlite3.Connection, name: str, table: str, sql: str | None) -> dict:
    # PRAGMA index_info columns: (seqno, cid, name) — name in seqno (declared) order.
    columns = [row[2] for row in conn.execute(f'PRAGMA index_info("{name}")').fetchall()]
    # PRAGMA index_list columns: (seq, name, unique, origin, partial).
    list_row = next(
        (row for row in conn.execute(f'PRAGMA index_list("{table}")').fetchall() if row[1] == name),
        None,
    )
    unique = int(list_row[2]) if list_row is not None else 0
    return {"table": table, "unique": unique, "columns": columns, "sql": normalize_sql(sql)}


def build_schema_inventory(conn: sqlite3.Connection) -> dict:
    """Build the canonical, cross-language schema inventory for `conn`.

    See the module docstring for what is included/excluded and why.
    """
    objects = conn.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_master "
        "WHERE type IN ('table', 'index', 'trigger')"
    ).fetchall()
    virtual_tables = _virtual_table_names(conn)

    tables: dict[str, dict] = {}
    indexes: dict[str, dict] = {}
    triggers: dict[str, dict] = {}

    for obj_type, name, tbl_name, sql in objects:
        # An index or trigger belonging to an excluded table (e.g. the
        # autoindex SQLite creates for `_migrations`' non-INTEGER PRIMARY KEY)
        # must not dangle in the inventory once its owning table is excluded.
        if tbl_name in _EXCLUDED_TABLES:
            continue
        if obj_type == "table":
            if name in _EXCLUDED_TABLES or name.startswith("sqlite_"):
                continue
            if _is_fts_shadow_table(name, virtual_tables):
                continue
            tables[name] = _table_inventory(conn, name, sql)
        elif obj_type == "index":
            indexes[name] = _index_inventory(conn, name, tbl_name, sql)
        elif obj_type == "trigger":
            triggers[name] = {"table": tbl_name, "sql": normalize_sql(sql)}

    return {"tables": tables, "indexes": indexes, "triggers": triggers}


def _regenerate_snapshot_json() -> str:
    """Build the inventory from a real fresh database, as committed JSON text.

    Regeneration entry point for maintainers: run
    ``uv run python -m memory.db.schema_inventory`` after any Python schema or
    migration change, and paste the printed JSON into the committed
    ``SCHEMA_INVENTORY_SNAPSHOT`` constant in
    ``ts/src/db/schemaInventorySnapshot.ts`` in the same commit — mirroring how
    ``KNOWN_MIGRATION_IDS`` in ``ts/src/db/schemaState.ts`` is maintained.
    ``tests/unit/memory/db/test_schema_inventory_snapshot.py`` fails the build
    if the two ever drift apart.
    """
    import json
    import tempfile
    from pathlib import Path

    from memory.db.connection import get_connection

    with tempfile.TemporaryDirectory() as tmp_dir:
        conn = get_connection(db_path=Path(tmp_dir) / "fresh.db")
        try:
            inventory = build_schema_inventory(conn)
        finally:
            conn.close()
    return json.dumps(inventory, indent=2, sort_keys=True)


if __name__ == "__main__":
    print(_regenerate_snapshot_json())
