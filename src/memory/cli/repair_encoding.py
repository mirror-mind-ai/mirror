"""Repair reversible Portuguese mojibake in the local Mirror database.

This command exists because older Windows/local-runtime combinations may have
stored UTF-8 text after decoding it as a legacy code page, producing strings like
``Ã©`` instead of ``é``. The repair is intentionally explicit (dry-run by
default) because identity and conversation text are user-owned data.
"""

from __future__ import annotations

import argparse
import re
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path

from memory.cli.common import db_path_from_mirror_home

# UTF-8 bytes decoded as Latin-1: "Ã©", "Ã§", "Ã£", "Âº", ...
_LATIN1_UTF8_PAIR = re.compile(r"[\u00c2-\u00c3][\u0080-\u00bf]")
# UTF-8 bytes decoded as Windows-1252: "Ã“", "Ã‰", ...
_CP1252_UTF8_PAIR = re.compile(r"[\u00c2-\u00c3].", re.DOTALL)

# User-text columns that can be safely scanned without touching arbitrary
# extension tables. Missing tables/columns are ignored for older DB versions.
_TEXT_TARGETS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("identity", ("content",)),
    ("attachments", ("content",)),
    ("memories", ("content", "summary", "source", "journey", "layer")),
    ("messages", ("content",)),
    ("conversations", ("title", "summary", "journey", "persona")),
    ("memory_access_log", ("access_context",)),
    ("tasks", ("title", "description", "journey", "status", "notes")),
)


@dataclass(frozen=True)
class RepairHit:
    table: str
    column: str
    row_id: int
    before: str
    after: str


def _decode_pair(chunk: str, encoding: str) -> str:
    try:
        return chunk.encode(encoding).decode("utf-8")
    except UnicodeError:
        return chunk


def repair_text(text: str) -> str:
    """Return text with reversible mojibake repaired.

    The function only changes two-byte sequences that successfully decode as
    UTF-8 after re-encoding through Latin-1 or Windows-1252. Non-mojibake text
    (including legitimate Portuguese like "Âncora") stays unchanged.
    """

    def fix_latin1(match: re.Match[str]) -> str:
        return _decode_pair(match.group(0), "latin1")

    def fix_cp1252(match: re.Match[str]) -> str:
        return _decode_pair(match.group(0), "cp1252")

    return _CP1252_UTF8_PAIR.sub(fix_cp1252, _LATIN1_UTF8_PAIR.sub(fix_latin1, text))


def has_repairable_mojibake(text: str) -> bool:
    return repair_text(text) != text


def _existing_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    try:
        return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    except sqlite3.Error:
        return set()


def _scan_table(conn: sqlite3.Connection, table: str, columns: tuple[str, ...]) -> list[RepairHit]:
    existing = _existing_columns(conn, table)
    selected = [col for col in columns if col in existing]
    if not selected:
        return []

    hits: list[RepairHit] = []
    quoted_cols = ", ".join(f'"{col}"' for col in selected)
    try:
        rows = conn.execute(f'SELECT _rowid_ AS __rowid__, {quoted_cols} FROM "{table}"').fetchall()
    except sqlite3.Error:
        return []

    for row in rows:
        row_id = int(row["__rowid__"])
        for col in selected:
            value = row[col]
            if isinstance(value, str):
                fixed = repair_text(value)
                if fixed != value:
                    hits.append(
                        RepairHit(table=table, column=col, row_id=row_id, before=value, after=fixed)
                    )
    return hits


def scan_database(db_path: Path) -> list[RepairHit]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        hits: list[RepairHit] = []
        for table, columns in _TEXT_TARGETS:
            hits.extend(_scan_table(conn, table, columns))
        return hits
    finally:
        conn.close()


def apply_repairs(db_path: Path, hits: list[RepairHit]) -> int:
    conn = sqlite3.connect(db_path)
    try:
        for hit in hits:
            conn.execute(
                f'UPDATE "{hit.table}" SET "{hit.column}" = ? WHERE _rowid_ = ?',
                (hit.after, hit.row_id),
            )
        conn.commit()
        return len(hits)
    finally:
        conn.close()


def _preview(text: str, limit: int = 80) -> str:
    compact = " ".join(text.split())
    if len(compact) > limit:
        compact = compact[: limit - 1] + "…"
    return compact


def main(argv: list[str] | None = None) -> int:
    from memory.cli.backup import backup
    from memory.config import DB_BACKUP_PATH, DB_PATH

    parser = argparse.ArgumentParser(
        description="Repair reversible UTF-8/Windows mojibake in Mirror user text"
    )
    parser.add_argument(
        "--mirror-home", default=None, help="Mirror home whose memory.db should be repaired"
    )
    parser.add_argument("--apply", action="store_true", help="Apply repairs (default is dry-run)")
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Do not create a database backup before --apply (not recommended)",
    )
    parser.add_argument("--limit", type=int, default=20, help="Maximum rows to preview")
    args = parser.parse_args(argv)

    mirror_home = Path(args.mirror_home).expanduser() if args.mirror_home else None
    db_path = db_path_from_mirror_home(mirror_home) if mirror_home else DB_PATH
    if db_path is None or not db_path.exists():
        print(f"Database not found: {db_path}", file=sys.stderr)
        return 1

    hits = scan_database(db_path)
    print(f"Database: {db_path}")
    print(f"Repairable mojibake hits: {len(hits)}")
    for hit in hits[: max(args.limit, 0)]:
        print(
            f"- {hit.table}.{hit.column} row={hit.row_id}: {_preview(hit.before)} -> {_preview(hit.after)}"
        )
    if len(hits) > max(args.limit, 0):
        print(f"… {len(hits) - max(args.limit, 0)} more")

    if not args.apply:
        print("Dry-run only. Re-run with --apply to modify the database.")
        return 0
    if not hits:
        print("No changes needed.")
        return 0

    if not args.no_backup:
        backup_dir = mirror_home / "backups" if mirror_home else DB_BACKUP_PATH
        created = backup(
            silent=False, db_path=db_path, db_backup_path=backup_dir, mirror_home=mirror_home
        )
        if created is None:
            print("Backup failed; aborting repair.", file=sys.stderr)
            return 1

    changed = apply_repairs(db_path, hits)
    print(f"Applied repairs: {changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
