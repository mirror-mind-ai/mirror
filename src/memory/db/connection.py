"""SQLite connection factory with pragmas and schema management."""

from __future__ import annotations

import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from memory.db.migrations import run_migrations
from memory.db.schema import SCHEMA

# Per-database-path threading locks. Guards bootstrap within a single process.
# fcntl.flock (used below) is a cross-process primitive and does NOT serialize
# threads that share the same process — hence the separate thread-level layer.
_thread_locks: dict[str, threading.Lock] = {}
_thread_locks_mu = threading.Lock()


def _get_thread_lock(db_path: Path) -> threading.Lock:
    key = str(db_path.resolve())
    with _thread_locks_mu:
        if key not in _thread_locks:
            _thread_locks[key] = threading.Lock()
        return _thread_locks[key]


@contextmanager
def _bootstrap_lock(db_path: Path) -> Iterator[None]:
    """Serialize the bootstrap phase (schema + migrations) for one DB path.

    Two layers of locking:
    1. A per-path ``threading.Lock`` — serializes concurrent threads within
       the same process. ``fcntl.flock`` is a process-level primitive and does
       not block threads that share the same PID.
    2. A sibling ``.bootstrap.lock`` file with ``fcntl.flock`` — serializes
       concurrent processes on POSIX systems. Falls back to a no-op on
       platforms without ``fcntl``; migrations are idempotent enough to
       remain safe in that case.
    """
    thread_lock = _get_thread_lock(db_path)
    lock_path = db_path.with_suffix(db_path.suffix + ".bootstrap.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        import fcntl  # POSIX only
    except ImportError:
        with thread_lock:
            yield
        return

    with thread_lock:
        with open(lock_path, "w") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def get_connection(db_path: Path | None = None) -> sqlite3.Connection:
    """Return a database connection, creating directory and schema if needed."""
    if db_path is None:
        from memory.config import require_db_path

        db_path = require_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    # Everything that writes to the database during bootstrap (journal-mode
    # switch, schema DDL, migrations) must happen under a cross-process lock.
    # Otherwise concurrent openers race on `PRAGMA journal_mode=WAL` (which
    # refuses to run when any other connection is open), on DDL statements,
    # and on migration bookkeeping.
    with _bootstrap_lock(db_path):
        conn = sqlite3.connect(str(db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=30000")
        conn.execute("PRAGMA foreign_keys=ON")
        # Switching to WAL requires that no other connection has the database
        # open, which is precisely what the bootstrap lock guarantees.
        current_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        if (current_mode or "").lower() != "wal":
            conn.execute("PRAGMA journal_mode=WAL")
        # Migrations first: they modernize any legacy schema (Portuguese-era
        # column/table names) into the modern shape. Then SCHEMA creates any
        # new tables/indexes on top. Both layers are idempotent.
        run_migrations(conn)
        conn.executescript(SCHEMA)

    return conn
