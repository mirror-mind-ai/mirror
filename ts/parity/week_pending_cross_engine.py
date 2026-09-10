"""Prove the `week plan` → `week save` pending file crosses engines (CV22.DS7.US11).

During the transition `week plan` and `week save` can be answered by different
engines: `plan` is replay-gated and falls back to Python on an unconfigured
install, while `save` is deterministic and flips ungated. A user therefore
routinely writes the pending file with one core and consumes it with the other.

This harness proves both directions on scratch databases:

  A. Python writes the pending file  ->  TypeScript `week save` consumes it
  B. TypeScript writes the pending file -> Python `week save` consumes it

and asserts the resulting `tasks` rows and receipts agree. It also compares the
serialized bytes of the file each engine writes, because a difference there
(key order, `ensure_ascii`, indentation, trailing newline) would not surface in
a single-engine test and would break exactly the mixed-engine case above.

No real database is touched: each direction runs against a fresh temp home.

Run:  uv run python ts/parity/week_pending_cross_engine.py
"""

from __future__ import annotations

import contextlib
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TS_DIR = REPO_ROOT / "ts"

ITEMS = [
    {
        "title": "Revisão do plano — café ☕",
        "due_date": "2026-09-16",
        "scheduled_at": "2026-09-16T18:00",
        "time_hint": None,
        "journey": "mirror-ts-core",
        "context": "carried over",
    },
    {
        "title": "Second item",
        "due_date": "2026-09-16",
        "scheduled_at": None,
        "time_hint": "morning",
        "journey": None,
        "context": None,
    },
]

TASK_COLUMNS = "journey, title, status, due_date, scheduled_at, time_hint, stage, context, source"


def _python_write(path: Path) -> None:
    """Exactly what `cmd_plan` writes: json.dumps(..., ensure_ascii=False, indent=2)."""
    path.write_text(json.dumps(ITEMS, ensure_ascii=False, indent=2), encoding="utf-8")


def _ts_write(path: Path) -> None:
    script = (
        'import { writePendingItems } from "#planning/weekPending.ts";'
        f"writePendingItems({json.dumps(str(path))}, {json.dumps(ITEMS)});"
    )
    subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=TS_DIR,
        check=True,
        capture_output=True,
    )


def _python_save(home: Path, pending: Path) -> tuple[str, list[dict]]:
    from memory import MemoryClient
    from memory.cli import week as week_cli
    from memory.config import default_db_path_for_home

    mem = MemoryClient(env="test", db_path=default_db_path_for_home(home))
    original = week_cli.PENDING_FILE
    week_cli.PENDING_FILE = pending
    try:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            week_cli.cmd_save(mem)
        receipt = out.getvalue()
    finally:
        week_cli.PENDING_FILE = original
    rows = [
        dict(r)
        for r in mem.store.conn.execute(
            f"SELECT {TASK_COLUMNS} FROM tasks ORDER BY created_at ASC, title ASC"
        ).fetchall()
    ]
    return receipt, rows


def _ts_save(home: Path, pending: Path) -> tuple[str, list[dict]]:
    from memory import MemoryClient
    from memory.config import default_db_path_for_home

    db_path = default_db_path_for_home(home)
    bootstrap = MemoryClient(env="test", db_path=db_path)
    # Checkpoint before copying: the database runs in WAL mode, so a fresh
    # schema lives in the -wal file until it is folded back into the main
    # file. Copying without this yields a db whose tables "do not exist".
    bootstrap.store.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    bootstrap.store.conn.close()

    # The DS4 copy guard requires a `tmp/` segment in a writable target.
    tmp_db = home / "tmp" / "copy.db"
    tmp_db.parent.mkdir(parents=True, exist_ok=True)
    tmp_db.write_bytes(db_path.read_bytes())

    script = (
        'import { openDatabaseCopyForWrite } from "#db/database.ts";'
        'import { runWeekSave } from "#planning/weekSave.ts";'
        f"const db = openDatabaseCopyForWrite({json.dumps(str(tmp_db))});"
        "const lines = [];"
        f"runWeekSave(db, {{ pendingPath: {json.dumps(str(pending))}, print: (l) => lines.push(l) }});"
        "db.close();"
        "process.stdout.write(lines.map((l) => l + String.fromCharCode(10)).join(''));"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=TS_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"TS week save failed:\n{result.stderr}")

    import sqlite3

    conn = sqlite3.connect(tmp_db)
    conn.row_factory = sqlite3.Row
    rows = [
        dict(r)
        for r in conn.execute(
            f"SELECT {TASK_COLUMNS} FROM tasks ORDER BY created_at ASC, title ASC"
        ).fetchall()
    ]
    conn.close()
    return result.stdout, rows


def _strip_ids(receipt: str) -> str:
    import re

    return re.sub(r"`[0-9a-f]+`", "`<id>`", receipt)


def main() -> int:
    failures: list[str] = []

    # --- serialized bytes agree -------------------------------------------
    with tempfile.TemporaryDirectory() as tmp:
        py_file = Path(tmp) / "py.json"
        ts_file = Path(tmp) / "ts.json"
        _python_write(py_file)
        _ts_write(ts_file)
        py_bytes = py_file.read_bytes()
        ts_bytes = ts_file.read_bytes()
        if py_bytes == ts_bytes:
            print(f"  ✓ pending file bytes identical across engines ({len(py_bytes)} bytes)")
        else:
            failures.append("pending file bytes differ")
            print("  ✗ pending file bytes DIFFER")
            print(f"      python: {py_bytes!r}")
            print(f"      ts    : {ts_bytes!r}")

    # --- direction A: Python writes, TS saves ------------------------------
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "home"
        pending = Path(tmp) / "mm_week_pending.json"
        _python_write(pending)
        a_receipt, a_rows = _ts_save(home, pending)
        a_removed = not pending.exists()

    # --- direction B: TS writes, Python saves ------------------------------
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "home"
        pending = Path(tmp) / "mm_week_pending.json"
        _ts_write(pending)
        b_receipt, b_rows = _python_save(home, pending)
        b_removed = not pending.exists()

    if _strip_ids(a_receipt) == _strip_ids(b_receipt):
        print("  ✓ receipts identical (ids aliased) across both directions")
    else:
        failures.append("receipts differ")
        print("  ✗ receipts DIFFER")
        print(f"      A (py->ts): {a_receipt!r}")
        print(f"      B (ts->py): {b_receipt!r}")

    if a_rows == b_rows:
        print(f"  ✓ task rows identical across both directions ({len(a_rows)} rows)")
    else:
        failures.append("task rows differ")
        print("  ✗ task rows DIFFER")
        print(f"      A: {a_rows}")
        print(f"      B: {b_rows}")

    if a_removed and b_removed:
        print("  ✓ both engines unlink the pending file after saving")
    else:
        failures.append("pending file not unlinked")
        print(f"  ✗ unlink: A removed={a_removed} B removed={b_removed}")

    if failures:
        print(f"\ncross-engine pending file: FAILED ({', '.join(failures)})")
        return 1
    print("\ncross-engine pending file: clean -- either engine can write, either can consume.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
