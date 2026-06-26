"""Rehearse database migrations against a copied production SQLite DB."""

from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

from memory.db.connection import get_connection

TABLES_TO_COUNT = (
    "conversations",
    "messages",
    "memories",
    "tasks",
    "attachments",
    "identity",
)

EXPECTED_COLUMNS = {
    "conversations": {
        "id",
        "title",
        "started_at",
        "ended_at",
        "interface",
        "persona",
        "journey",
        "summary",
        "tags",
        "metadata",
    },
    "messages": {
        "id",
        "conversation_id",
        "role",
        "content",
        "created_at",
        "token_count",
        "metadata",
    },
    "memories": {
        "id",
        "conversation_id",
        "memory_type",
        "layer",
        "title",
        "content",
        "context",
        "journey",
        "persona",
        "tags",
        "created_at",
        "relevance_score",
        "embedding",
        "metadata",
    },
    "tasks": {
        "id",
        "journey",
        "title",
        "status",
        "due_date",
        "scheduled_at",
        "time_hint",
        "stage",
        "context",
        "source",
        "created_at",
        "updated_at",
        "completed_at",
        "metadata",
    },
    "attachments": {
        "id",
        "journey_id",
        "name",
        "description",
        "content",
        "content_type",
        "tags",
        "embedding",
        "created_at",
        "updated_at",
        "metadata",
    },
    "identity": {
        "id",
        "layer",
        "key",
        "content",
        "version",
        "created_at",
        "updated_at",
        "metadata",
    },
}

FORBIDDEN_COLUMNS = {
    "conversations": {"travessia"},
    "memories": {"travessia"},
    "tasks": {"travessia"},
    "attachments": {"travessia_id"},
}

EXPECTED_INDEXES = {
    "idx_memories_journey",
    "idx_tasks_journey",
    "idx_attachments_journey",
    "idx_attachments_journey_name",
}

FORBIDDEN_INDEXES = {
    "idx_memories_travessia",
    "idx_tasks_travessia",
    "idx_attachments_travessia",
    "idx_attachments_travessia_name",
}

LEGACY_LAYERS = ("caminho", "travessia")


class RehearsalVerificationError(RuntimeError):
    """Raised when the migrated copy does not match the expected schema."""


@dataclass(frozen=True)
class CopiedDatabase:
    db_path: Path
    sidecars: tuple[Path, ...]


@dataclass(frozen=True)
class MigrationRehearsalResult:
    source_db_path: Path
    rehearsal_db_path: Path
    sidecars_copied: tuple[Path, ...]
    row_counts_before: dict[str, int]
    row_counts_after: dict[str, int]
    columns: dict[str, set[str]]
    indexes: set[str]
    legacy_layer_counts: dict[str, int]
    applied_migrations: tuple[str, ...]


def _environment_home() -> Path:
    """Return a home directory that honors HOME in Windows test/process envs."""
    home = os.environ.get("HOME")
    if home:
        return Path(home).expanduser()
    return Path.home()


def resolve_production_db_path() -> Path:
    """Resolve the production DB path without importing config or copying legacy DBs."""
    configured_db_path = os.environ.get("DB_PATH")
    if configured_db_path:
        return Path(configured_db_path).expanduser()

    configured_prod_dir = os.environ.get("MEMORY_PROD_DIR")
    configured_memory_dir = os.environ.get("MEMORY_DIR")
    if configured_prod_dir or configured_memory_dir:
        base_dir = Path(configured_prod_dir or configured_memory_dir or "").expanduser()
    else:
        home = _environment_home()
        mirror_dir = home / ".mirror"
        legacy_dir = home / ".espelho"
        base_dir = mirror_dir if mirror_dir.exists() or not legacy_dir.exists() else legacy_dir

    new_path = base_dir / "memory.db"
    legacy_path = base_dir / "memoria.db"
    if new_path.exists() or not legacy_path.exists():
        return new_path
    return legacy_path


def _copy_database_files(source_db_path: Path, output_dir: Path) -> CopiedDatabase:
    source_db_path = source_db_path.expanduser()
    if not source_db_path.exists():
        raise FileNotFoundError(f"Database not found: {source_db_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    rehearsal_dir = output_dir / f"migration-rehearsal-{uuid.uuid4().hex[:8]}"
    rehearsal_dir.mkdir()

    copied_db_path = rehearsal_dir / source_db_path.name
    shutil.copy2(source_db_path, copied_db_path)

    copied_sidecars = []
    for suffix in ("-wal", "-shm"):
        source_sidecar = source_db_path.with_name(f"{source_db_path.name}{suffix}")
        if source_sidecar.exists():
            copied_sidecar = copied_db_path.with_name(f"{copied_db_path.name}{suffix}")
            shutil.copy2(source_sidecar, copied_sidecar)
            copied_sidecars.append(copied_sidecar)

    return CopiedDatabase(copied_db_path, tuple(copied_sidecars))


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
    ).fetchone()
    return row is not None


def _row_counts(conn: sqlite3.Connection) -> dict[str, int]:
    counts = {}
    for table in TABLES_TO_COUNT:
        if _table_exists(conn, table):
            row = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
            counts[table] = int(row[0])
    return counts


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    if not _table_exists(conn, table):
        return set()
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _indexes(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'").fetchall()
    return {row[0] for row in rows}


def _applied_migrations(conn: sqlite3.Connection) -> tuple[str, ...]:
    if not _table_exists(conn, "_migrations"):
        return ()
    rows = conn.execute("SELECT id FROM _migrations ORDER BY id").fetchall()
    return tuple(row[0] for row in rows)


def _legacy_layer_counts(conn: sqlite3.Connection) -> dict[str, int]:
    counts = {}
    for layer in LEGACY_LAYERS:
        total = 0
        if _table_exists(conn, "identity"):
            row = conn.execute("SELECT COUNT(*) FROM identity WHERE layer = ?", (layer,)).fetchone()
            total += int(row[0])
        if _table_exists(conn, "memories"):
            row = conn.execute("SELECT COUNT(*) FROM memories WHERE layer = ?", (layer,)).fetchone()
            total += int(row[0])
        counts[layer] = total
    return counts


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _verify_rehearsal(
    *,
    db_path: Path,
    row_counts_before: dict[str, int],
) -> MigrationRehearsalResult:
    conn = _connect(db_path)
    try:
        row_counts_after = _row_counts(conn)
        columns = {table: _columns(conn, table) for table in EXPECTED_COLUMNS}
        indexes = _indexes(conn)
        legacy_layer_counts = _legacy_layer_counts(conn)
        applied_migrations = _applied_migrations(conn)
    finally:
        conn.close()

    failures = []
    for table, expected in EXPECTED_COLUMNS.items():
        missing = expected - columns[table]
        if missing:
            failures.append(f"{table} missing expected columns: {', '.join(sorted(missing))}")

    for table, forbidden in FORBIDDEN_COLUMNS.items():
        present = forbidden & columns[table]
        if present:
            failures.append(f"{table} still has legacy columns: {', '.join(sorted(present))}")

    missing_indexes = EXPECTED_INDEXES - indexes
    if missing_indexes:
        failures.append(f"missing expected indexes: {', '.join(sorted(missing_indexes))}")

    legacy_indexes = FORBIDDEN_INDEXES & indexes
    if legacy_indexes:
        failures.append(f"legacy indexes still exist: {', '.join(sorted(legacy_indexes))}")

    changed_counts = {
        table: (before, row_counts_after.get(table))
        for table, before in row_counts_before.items()
        if row_counts_after.get(table) != before
    }
    if changed_counts:
        details = ", ".join(
            f"{table}: {before} -> {after}" for table, (before, after) in changed_counts.items()
        )
        failures.append(f"row counts changed: {details}")

    remaining_layers = {layer: count for layer, count in legacy_layer_counts.items() if count}
    if remaining_layers:
        details = ", ".join(f"{layer}: {count}" for layer, count in remaining_layers.items())
        failures.append(f"legacy layer values remain: {details}")

    if failures:
        raise RehearsalVerificationError("; ".join(failures))

    return MigrationRehearsalResult(
        source_db_path=Path(),
        rehearsal_db_path=db_path,
        sidecars_copied=(),
        row_counts_before=row_counts_before,
        row_counts_after=row_counts_after,
        columns=columns,
        indexes=indexes,
        legacy_layer_counts=legacy_layer_counts,
        applied_migrations=applied_migrations,
    )


def rehearse_database_migration(
    db_path: Path | str | None = None,
    *,
    output_dir: Path | str | None = None,
) -> MigrationRehearsalResult:
    """Copy a database, run normal migrations on the copy, and verify the result."""
    source_db_path = (
        Path(db_path).expanduser() if db_path is not None else resolve_production_db_path()
    )
    rehearsal_output_dir = (
        Path(output_dir).expanduser()
        if output_dir is not None
        else Path(tempfile.mkdtemp(prefix="memory-migration-rehearsals-"))
    )

    copied = _copy_database_files(source_db_path, rehearsal_output_dir)

    before_conn = _connect(copied.db_path)
    try:
        row_counts_before = _row_counts(before_conn)
    finally:
        before_conn.close()

    migrated_conn = get_connection(copied.db_path)
    migrated_conn.close()

    verified = _verify_rehearsal(
        db_path=copied.db_path,
        row_counts_before=row_counts_before,
    )

    return MigrationRehearsalResult(
        source_db_path=source_db_path,
        rehearsal_db_path=verified.rehearsal_db_path,
        sidecars_copied=copied.sidecars,
        row_counts_before=verified.row_counts_before,
        row_counts_after=verified.row_counts_after,
        columns=verified.columns,
        indexes=verified.indexes,
        legacy_layer_counts=verified.legacy_layer_counts,
        applied_migrations=verified.applied_migrations,
    )


def _print_result(result: MigrationRehearsalResult) -> None:
    print("Migration rehearsal succeeded.")
    print(f"Source DB: {result.source_db_path}")
    print(f"Rehearsal DB: {result.rehearsal_db_path}")
    if result.sidecars_copied:
        print("Copied sidecars:")
        for sidecar in result.sidecars_copied:
            print(f"  - {sidecar.name}")
    else:
        print("Copied sidecars: none")

    print("Row counts:")
    for table in sorted(result.row_counts_after):
        before = result.row_counts_before.get(table, 0)
        after = result.row_counts_after[table]
        print(f"  - {table}: {before} -> {after}")

    print("Applied migrations:")
    for migration in result.applied_migrations:
        print(f"  - {migration}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Rehearse pending memory DB migrations against a copied SQLite database."
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="Source database path. Defaults to the production DB path without touching it.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Directory where the rehearsal copy should be created. Defaults to a temp directory.",
    )
    args = parser.parse_args(argv)

    try:
        result = rehearse_database_migration(args.db_path, output_dir=args.output_dir)
    except (FileNotFoundError, RehearsalVerificationError, sqlite3.Error, OSError) as exc:
        print(f"Migration rehearsal failed: {exc}")
        return 1

    _print_result(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
