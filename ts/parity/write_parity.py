"""Run redacted write-parity for CV22.DS4 deterministic writes.

Copies the source DB, applies the real Python core writes on a copy with the
clock(s) frozen, and emits a fixture the TS verifier replays on a parallel copy of
the same seed. Three probes: `reinforcement` (log_access/log_use), `journey`
(create_journey/set_project_path), and `identity` (set_identity /
update_identity_metadata across INSERT, UPDATE, metadata-None inheritance, and
metadata-only). Copy-only, backup-gated, redacted by default; the source database
is never mutated.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import memory.models as models_mod
import memory.storage.identity as identity_mod
import memory.storage.memories as memories_mod
from memory.db.connection import get_connection
from memory.services.attachment import AttachmentService
from memory.services.identity import IdentityService
from memory.services.journey import JourneyService
from memory.storage.store import Store

DEFAULT_WORK_DIR = Path("tmp/parity/write")
FROZEN_NOW = datetime(2026, 6, 23, 12, 0, 0, 123456, tzinfo=timezone.utc)
JOURNEY_SLUG = "parity-journey"
# Identity probe targets. INSERT is a fresh key; UPDATE / INHERIT / META-ONLY act on
# rows the portable demo DB already seeds (see generate_demo_memory_db.py), so the
# UPDATE paths prove created_at preservation against real pre-existing rows.
IDENTITY_INSERT_KEY = "demo-parity-probe"
IDENTITY_INSERT_CONTENT = "Synthetic parity-probe persona created by the write-parity harness."
IDENTITY_INSERT_VERSION = "1.2.3"
IDENTITY_INSERT_METADATA = json.dumps({"routing_keywords": ["mirror", "parity"], "enabled": True})
IDENTITY_UPDATE_KEY = "demo-code-reviewer"
IDENTITY_UPDATE_CONTENT = "Updated demo-code-reviewer content under the frozen parity clock."
IDENTITY_UPDATE_VERSION = "1.1.0"
IDENTITY_UPDATE_METADATA = json.dumps({"routing_keywords": ["review", "diff"]})
IDENTITY_INHERIT_KEY = "demo-finance-coach"
IDENTITY_INHERIT_CONTENT = "Updated demo-finance-coach content; metadata must be inherited."
IDENTITY_METAONLY_LAYER = "journey"
IDENTITY_METAONLY_KEY = "demo-child-beta"
IDENTITY_METAONLY_METADATA = json.dumps({"parent_journey": "demo-root-done"})
JOURNEY_CONTENT = (
    "# Parity Journey\n\n"
    "**Status:** active\n\n"
    "## Description\n\n"
    "A synthetic journey created by the write-parity harness to exercise "
    "create_journey and set_project_path deterministically under a frozen clock."
)
JOURNEY_PROJECT_PATH = "/tmp/parity/demo-project"


class _FrozenDateTime(datetime):
    """datetime whose now() is pinned, so stamped timestamps are deterministic."""

    @classmethod
    def now(cls, tz=None):
        return FROZEN_NOW if tz else FROZEN_NOW.replace(tzinfo=None)


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


def _reinforcement_probe(conn: sqlite3.Connection, store: Store, targets: int, context: str) -> dict:
    """Drive the real log_access/log_use and snapshot the two mutated tables."""
    original_datetime = memories_mod.datetime
    memories_mod.datetime = _FrozenDateTime
    try:
        target_ids = [
            str(row[0])
            for row in conn.execute(
                "SELECT id FROM memories ORDER BY id LIMIT ?", (targets,)
            ).fetchall()
        ]
        if not target_ids:
            raise RuntimeError("source DB has no memories to target")
        for memory_id in target_ids:
            store.log_access(memory_id, context)
            store.log_use(memory_id)
        now_iso = conn.execute(
            "SELECT last_accessed_at FROM memories WHERE id = ?", (target_ids[0],)
        ).fetchone()[0]
    finally:
        memories_mod.datetime = original_datetime

    state: list[dict] = []
    for memory_id in target_ids:
        row = conn.execute(
            "SELECT id, last_accessed_at, use_count FROM memories WHERE id = ?", (memory_id,)
        ).fetchone()
        state.append(
            {
                "id": f"memories:{row['id']}",
                "cells": {"last_accessed_at": row["last_accessed_at"], "use_count": row["use_count"]},
            }
        )
    for memory_id in target_ids:
        for row in conn.execute(
            "SELECT id, memory_id, accessed_at, access_context FROM memory_access_log "
            "WHERE memory_id = ? ORDER BY id",
            (memory_id,),
        ):
            state.append(
                {
                    "id": f"memory_access_log:{row['id']}",
                    "cells": {
                        "memory_id": row["memory_id"],
                        "accessed_at": row["accessed_at"],
                        "access_context": row["access_context"],
                    },
                }
            )
    return {
        "label": "reinforcement_demo",
        "probe_type": "reinforcement",
        "frozen_now_ms": int(FROZEN_NOW.timestamp() * 1000),
        "now_iso": now_iso,
        "access_context": context,
        "target_ids": target_ids,
        "python_state": state,
    }


def _journey_probe(conn: sqlite3.Connection, store: Store) -> dict:
    """Drive the real create_journey + set_project_path and snapshot the identity row."""
    journeys = JourneyService(store, IdentityService(store, AttachmentService(store)))
    original_identity_dt = identity_mod.datetime
    original_models_dt = models_mod.datetime
    identity_mod.datetime = _FrozenDateTime
    models_mod.datetime = _FrozenDateTime
    try:
        journeys.create_journey(slug=JOURNEY_SLUG, content=JOURNEY_CONTENT, icon="star", color="blue")
        resolved = journeys.set_project_path(JOURNEY_SLUG, JOURNEY_PROJECT_PATH)
        row = conn.execute(
            "SELECT id, layer, key, content, version, created_at, updated_at, metadata "
            "FROM identity WHERE layer = 'journey' AND key = ?",
            (JOURNEY_SLUG,),
        ).fetchone()
    finally:
        identity_mod.datetime = original_identity_dt
        models_mod.datetime = original_models_dt

    return {
        "label": "journey_demo",
        "probe_type": "journey",
        "frozen_now_ms": int(FROZEN_NOW.timestamp() * 1000),
        "now_iso": row["updated_at"],
        "target_ids": [],
        "journey": {
            "id": row["id"],
            "slug": JOURNEY_SLUG,
            "content": JOURNEY_CONTENT,
            "icon": "star",
            "color": "blue",
            "project_path_normalized": resolved,
        },
        "python_state": [
            {
                "id": f"identity:{row['id']}",
                "cells": {
                    "layer": row["layer"],
                    "key": row["key"],
                    "content": row["content"],
                    "version": row["version"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "metadata": row["metadata"],
                },
            }
        ],
    }


def _identity_probe(conn: sqlite3.Connection, store: Store) -> dict:
    """Drive real set_identity / update_identity_metadata and snapshot the identity rows.

    Covers four cases in one probe: INSERT a fresh identity, UPDATE an existing one
    with explicit metadata, UPDATE with ``metadata=None`` (inheritance of the stored
    metadata), and a standalone ``update_identity_metadata``. Both clocks are frozen
    so ``upsert_identity`` (uses ``datetime.now``) and ``update_identity_metadata``
    (uses ``models._now``) stamp the same instant.
    """
    identity = IdentityService(store, AttachmentService(store))
    existing_update = store.get_identity("persona", IDENTITY_UPDATE_KEY)
    existing_inherit = store.get_identity("persona", IDENTITY_INHERIT_KEY)
    existing_metaonly = store.get_identity(IDENTITY_METAONLY_LAYER, IDENTITY_METAONLY_KEY)
    if not (existing_update and existing_inherit and existing_metaonly):
        raise RuntimeError("demo DB is missing the identity rows the identity probe targets")

    original_identity_dt = identity_mod.datetime
    original_models_dt = models_mod.datetime
    identity_mod.datetime = _FrozenDateTime
    models_mod.datetime = _FrozenDateTime
    try:
        inserted = identity.set_identity(
            layer="persona",
            key=IDENTITY_INSERT_KEY,
            content=IDENTITY_INSERT_CONTENT,
            version=IDENTITY_INSERT_VERSION,
            metadata=IDENTITY_INSERT_METADATA,
        )
        identity.set_identity(
            layer="persona",
            key=IDENTITY_UPDATE_KEY,
            content=IDENTITY_UPDATE_CONTENT,
            version=IDENTITY_UPDATE_VERSION,
            metadata=IDENTITY_UPDATE_METADATA,
        )
        # No metadata argument => Python inherits the stored metadata (metadata is None).
        identity.set_identity(
            layer="persona",
            key=IDENTITY_INHERIT_KEY,
            content=IDENTITY_INHERIT_CONTENT,
        )
        store.update_identity_metadata(
            IDENTITY_METAONLY_LAYER, IDENTITY_METAONLY_KEY, IDENTITY_METAONLY_METADATA
        )
    finally:
        identity_mod.datetime = original_identity_dt
        models_mod.datetime = original_models_dt

    operations = [
        {
            "op": "set_identity",
            "id": inserted.id,
            "layer": "persona",
            "key": IDENTITY_INSERT_KEY,
            "content": IDENTITY_INSERT_CONTENT,
            "version": IDENTITY_INSERT_VERSION,
            "metadata": IDENTITY_INSERT_METADATA,
        },
        {
            "op": "set_identity",
            "id": existing_update.id,
            "layer": "persona",
            "key": IDENTITY_UPDATE_KEY,
            "content": IDENTITY_UPDATE_CONTENT,
            "version": IDENTITY_UPDATE_VERSION,
            "metadata": IDENTITY_UPDATE_METADATA,
        },
        {
            "op": "set_identity",
            "id": existing_inherit.id,
            "layer": "persona",
            "key": IDENTITY_INHERIT_KEY,
            "content": IDENTITY_INHERIT_CONTENT,
            "version": None,
            "metadata": None,
        },
        {
            "op": "update_metadata",
            "layer": IDENTITY_METAONLY_LAYER,
            "key": IDENTITY_METAONLY_KEY,
            "metadata": IDENTITY_METAONLY_METADATA,
        },
    ]

    target_ids = [inserted.id, existing_update.id, existing_inherit.id, existing_metaonly.id]
    state: list[dict] = []
    for target_id in target_ids:
        row = conn.execute(
            "SELECT id, layer, key, content, version, created_at, updated_at, metadata "
            "FROM identity WHERE id = ?",
            (target_id,),
        ).fetchone()
        state.append(
            {
                "id": f"identity:{row['id']}",
                "cells": {
                    "layer": row["layer"],
                    "key": row["key"],
                    "content": row["content"],
                    "version": row["version"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "metadata": row["metadata"],
                },
            }
        )

    return {
        "label": "identity_demo",
        "probe_type": "identity",
        "frozen_now_ms": int(FROZEN_NOW.timestamp() * 1000),
        "now_iso": inserted.updated_at,
        "target_ids": target_ids,
        "identity": {"operations": operations},
        "python_state": state,
    }


def _build_fixture(*, source_db: Path, work_dir: Path, probe: str, targets: int, context: str) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    seed_db = work_dir / "seed.db"
    python_copy = work_dir / "python-copy.db"
    ts_copy = work_dir / "ts-copy.db"
    fixture_path = work_dir / "write-parity-fixture.json"

    _safe_copy_database(source_db, seed_db)
    _safe_copy_database(seed_db, python_copy)

    conn = get_connection(python_copy)
    conn.row_factory = sqlite3.Row
    store = Store(conn)
    try:
        if probe == "reinforcement":
            probe_dict = _reinforcement_probe(conn, store, targets, context)
        elif probe == "journey":
            probe_dict = _journey_probe(conn, store)
        elif probe == "identity":
            probe_dict = _identity_probe(conn, store)
        else:
            raise ValueError(f"unknown probe: {probe}")
    finally:
        conn.close()

    fixture = {
        "source_label": source_db.name,
        "seed_db_path": str(seed_db.resolve()),
        "ts_copy_path": str(ts_copy.resolve()),
        "backup": {"path": str(seed_db.resolve()), "sha256": _sha256_file(seed_db)},
        "probes": [probe_dict],
    }
    fixture_path.write_text(json.dumps(fixture), encoding="utf-8")
    return fixture_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-db", required=True, type=Path)
    parser.add_argument("--work-dir", default=DEFAULT_WORK_DIR, type=Path)
    parser.add_argument(
        "--probe", default="reinforcement", choices=("reinforcement", "journey", "identity")
    )
    parser.add_argument("--targets", default=3, type=int)
    parser.add_argument("--context", default="retrieval")
    parser.add_argument("--debug-sensitive-output", action="store_true")
    args = parser.parse_args(argv)

    source_db = args.source_db.expanduser().resolve()
    if not source_db.exists():
        parser.error(f"source DB does not exist: {source_db}")

    fixture_path = _build_fixture(
        source_db=source_db,
        work_dir=args.work_dir,
        probe=args.probe,
        targets=args.targets,
        context=args.context,
    )

    command = ["node", "ts/parity/write_parity_verify.ts", "--fixture", str(fixture_path)]
    if args.debug_sensitive_output:
        command.append("--debug-sensitive-output")
    completed = subprocess.run(command, check=False, text=True, cwd=Path.cwd())
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
