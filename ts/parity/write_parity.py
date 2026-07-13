"""Run redacted write-parity for CV22.DS4.TS1 (harness self-check).

Copies the source DB, applies a sample deterministic write via the Python side on
a copy under a frozen `now`, and emits a fixture the TS verifier replays on a
parallel copy of the same seed. Copy-only, redacted evidence by default; the
source database is never mutated.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_WORK_DIR = Path("tmp/parity/write")


def _js_iso(ms: int) -> str:
    """Format a millisecond epoch exactly like JavaScript's Date.toISOString()."""
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_copy_database(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    for candidate in (
        destination,
        destination.with_suffix(destination.suffix + "-wal"),
        destination.with_suffix(destination.suffix + "-shm"),
    ):
        if candidate.exists():
            candidate.unlink()
    with sqlite3.connect(str(source)) as src, sqlite3.connect(str(destination)) as dst:
        src.backup(dst)


def _build_fixture(*, source_db: Path, work_dir: Path, targets: int) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    seed_db = work_dir / "seed.db"
    python_copy = work_dir / "python-copy.db"
    ts_copy = work_dir / "ts-copy.db"
    fixture_path = work_dir / "write-parity-fixture.json"

    # Copy the source once into a pristine seed both sides start from, then a
    # working copy the Python oracle mutates. The source is never touched again.
    _safe_copy_database(source_db, seed_db)
    _safe_copy_database(seed_db, python_copy)

    frozen_now_ms = int(datetime.now(timezone.utc).timestamp()) * 1000
    iso = _js_iso(frozen_now_ms)

    conn = sqlite3.connect(str(python_copy))
    try:
        conn.row_factory = sqlite3.Row
        target_ids = [
            str(row[0])
            for row in conn.execute(
                "SELECT id FROM memories ORDER BY id LIMIT ?", (targets,)
            ).fetchall()
        ]
        if not target_ids:
            raise RuntimeError("source DB has no memories to target")
        for memory_id in target_ids:
            conn.execute(
                "UPDATE memories SET last_accessed_at = ? WHERE id = ?", (iso, memory_id)
            )
            conn.execute(
                "UPDATE memories SET use_count = use_count + 1 WHERE id = ?", (memory_id,)
            )
        conn.commit()
        python_state = [
            {
                "id": str(row["id"]),
                "cells": {
                    "last_accessed_at": row["last_accessed_at"],
                    "use_count": row["use_count"],
                },
            }
            for memory_id in target_ids
            for row in [
                conn.execute(
                    "SELECT id, last_accessed_at, use_count FROM memories WHERE id = ?",
                    (memory_id,),
                ).fetchone()
            ]
        ]
    finally:
        conn.close()

    fixture = {
        "source_label": source_db.name,
        "seed_db_path": str(seed_db.resolve()),
        "ts_copy_path": str(ts_copy.resolve()),
        "backup": {"path": str(seed_db.resolve()), "sha256": _sha256_file(seed_db)},
        "probes": [
            {
                "label": "log_access_demo",
                "probe_type": "log_access",
                "frozen_now_ms": frozen_now_ms,
                "table": "memories",
                "id_column": "id",
                "columns": ["last_accessed_at", "use_count"],
                "target_ids": target_ids,
                "python_state": python_state,
            }
        ],
    }
    fixture_path.write_text(json.dumps(fixture), encoding="utf-8")
    return fixture_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-db", required=True, type=Path)
    parser.add_argument("--work-dir", default=DEFAULT_WORK_DIR, type=Path)
    parser.add_argument("--targets", default=3, type=int)
    parser.add_argument("--debug-sensitive-output", action="store_true")
    args = parser.parse_args(argv)

    source_db = args.source_db.expanduser().resolve()
    if not source_db.exists():
        parser.error(f"source DB does not exist: {source_db}")

    fixture_path = _build_fixture(
        source_db=source_db, work_dir=args.work_dir, targets=args.targets
    )

    command = ["node", "ts/parity/write_parity_verify.ts", "--fixture", str(fixture_path)]
    if args.debug_sensitive_output:
        command.append("--debug-sensitive-output")
    completed = subprocess.run(command, check=False, text=True, cwd=Path.cwd())
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
