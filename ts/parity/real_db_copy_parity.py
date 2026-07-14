"""Run redacted real-DB-copy parity for CV22.DS2.

The harness validates TS replay against the Python oracle over a copied SQLite
file. It never reads from the live source after the copy step, writes generated
real-data fixtures only under ignored local storage, and prints redacted evidence
by default.
"""

from __future__ import annotations

import argparse
import base64
import contextlib
import json
import os
import shutil
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import memory.intelligence.search as search_mod
from memory.db.connection import get_connection
from memory.intelligence.embeddings import bytes_to_embedding
from memory.intelligence.search import MemorySearch, _parse_datetime_utc
from memory.services.attachment import AttachmentService
from memory.services.identity import IdentityService
from memory.services.journey import JourneyService
from memory.storage.store import Store

DEFAULT_WORK_DIR = Path("tmp/parity/real-db-copy")
PERSONA_THRESHOLD = 1.0
PERSONA_NO_MATCH_QUERY = "zzzz nonexistent routing token qqqq"
DEFAULT_PROBES: tuple[tuple[str, str], ...] = (
    ("search_demo_1", "mirror journey"),
    ("search_demo_2", "builder memory"),
    ("search_demo_3", "identity context"),
    ("search_demo_4", "runtime mode"),
    ("search_demo_5", "conversation search"),
)


class _FrozenDateTime(datetime):
    frozen_now: datetime

    @classmethod
    def now(cls, tz=None):
        return cls.frozen_now if tz else cls.frozen_now.replace(tzinfo=None)


def _to_ms(value: str | None) -> int | None:
    parsed = _parse_datetime_utc(value) if value else None
    return int(parsed.timestamp() * 1000) if parsed else None


def _safe_copy_database(source: Path, destination: Path) -> None:
    # The copy and fixture are database-equivalent artifacts (raw memory and
    # identity content): keep the work dir owner-only (see REFERENCE, Data at
    # rest). Best-effort on non-POSIX platforms.
    destination.parent.mkdir(parents=True, exist_ok=True)
    with contextlib.suppress(OSError):
        os.chmod(destination.parent, 0o700)
    if destination.exists():
        destination.unlink()
    # `backup()` is used so validation reads a stable copy. We open the source
    # normally because Python's sqlite backup API can fail against read-only URI
    # handles on some local builds; the harness never executes writes on this
    # connection.
    with sqlite3.connect(str(source)) as src, sqlite3.connect(destination) as dst:
        src.backup(dst)


def _memory_entry(store: Store, mem, lexical_scores: dict[str, float]) -> dict:
    if mem.embedding is None:
        raise ValueError(f"memory {mem.id} has no embedding")
    decoded = bytes_to_embedding(mem.embedding)
    return {
        "id": mem.id,
        "content": mem.content,
        "created_at": mem.created_at,
        "created_at_ms": _to_ms(mem.created_at),
        "last_accessed_at": mem.last_accessed_at,
        "last_accessed_at_ms": _to_ms(mem.last_accessed_at),
        "use_count": mem.use_count,
        "relevance_score": mem.relevance_score,
        "access_count": store.get_access_count(mem.id),
        "lexical_score": lexical_scores.get(mem.id, 0.0),
        "embedding_b64": base64.b64encode(mem.embedding).decode("ascii"),
        "embedding": [float(x) for x in decoded],
    }


def _persona_rows(store: Store) -> list[dict]:
    """The copied DB's persona routing table, parsed exactly as the oracle reads it."""
    rows: list[dict] = []
    for ident in store.get_identity_by_layer("persona"):
        if not ident.metadata:
            continue
        try:
            metadata = json.loads(ident.metadata)
        except (json.JSONDecodeError, TypeError):
            continue
        keywords = metadata.get("routing_keywords") or []
        if not isinstance(keywords, list):
            continue
        rows.append(
            {
                "key": ident.key,
                "routing_keywords": [kw for kw in keywords if isinstance(kw, str)],
            }
        )
    return rows


def _persona_probes(store: Store, persona_rows: list[dict]) -> list[dict]:
    """Derive probes from each persona's own routing keywords (guaranteed real hits),
    plus a deliberate no-match probe, and record the oracle's ordered persona keys."""
    identity = IdentityService(store, AttachmentService(store))
    probes: list[dict] = []
    for index, row in enumerate(persona_rows):
        query = " ".join(row["routing_keywords"][:3]) or row["key"]
        matches = identity.detect_persona(query, threshold=PERSONA_THRESHOLD)
        probes.append(
            {
                "label": f"persona_derived_{index + 1}",
                "query": query,
                "expected_order": [key for key, _score, _match_type in matches],
            }
        )
    no_match = identity.detect_persona(PERSONA_NO_MATCH_QUERY, threshold=PERSONA_THRESHOLD)
    probes.append(
        {
            "label": "persona_no_match",
            "query": PERSONA_NO_MATCH_QUERY,
            "expected_order": [key for key, _score, _match_type in no_match],
        }
    )
    return probes


def _journey_probes(store: Store) -> tuple[list[dict], list[dict]]:
    """Journey routing rows and the oracle's ordered options (pure JSON replay)."""
    rows = [
        {"key": ident.key, "content": ident.content or "", "metadata": ident.metadata}
        for ident in store.get_identity_by_layer("journey")
    ]
    journeys = JourneyService(store, IdentityService(store, AttachmentService(store)))
    options = journeys.list_journey_options()
    probes = [{"label": "journeys_all", "expected_order": [option["id"] for option in options]}]
    return rows, probes


def _listing_probes(store: Store, limit: int) -> list[dict]:
    """Filter/limit probes; expected order comes from the Python read model."""
    corpus = store.list_recent_memory_summaries(limit=100000)

    def order(**kwargs) -> list[str]:
        return [summary.id for summary in store.list_recent_memory_summaries(**kwargs)]

    probes = [
        {
            "label": "listing_recent_all",
            "memory_type": None,
            "layer": None,
            "journey": None,
            "limit": limit,
            "expected_order": order(limit=limit),
        },
        {
            "label": "listing_small_limit",
            "memory_type": None,
            "layer": None,
            "journey": None,
            "limit": 3,
            "expected_order": order(limit=3),
        },
    ]
    first_type = next((s.memory_type for s in corpus if s.memory_type), None)
    if first_type:
        probes.append(
            {
                "label": "listing_by_type",
                "memory_type": first_type,
                "layer": None,
                "journey": None,
                "limit": limit,
                "expected_order": order(limit=limit, memory_type=first_type),
            }
        )
    first_layer = next((s.layer for s in corpus if s.layer), None)
    if first_layer:
        probes.append(
            {
                "label": "listing_by_layer",
                "memory_type": None,
                "layer": first_layer,
                "journey": None,
                "limit": limit,
                "expected_order": order(limit=limit, layer=first_layer),
            }
        )
    first_journey = next((s.journey for s in corpus if s.journey), None)
    if first_journey:
        probes.append(
            {
                "label": "listing_by_journey",
                "memory_type": None,
                "layer": None,
                "journey": first_journey,
                "limit": limit,
                "expected_order": order(limit=limit, journey=first_journey),
            }
        )
    return probes


def _build_fixture(*, source_db: Path, work_dir: Path, limit: int) -> Path:
    copied_db = work_dir / "memory.real-db-copy-parity.db"
    fixture_path = work_dir / "real-db-copy-fixture.json"
    _safe_copy_database(source_db, copied_db)

    conn = get_connection(copied_db)
    store = Store(conn)
    store.log_access = lambda *a, **k: None  # type: ignore[assignment]

    frozen_now = datetime.now(timezone.utc)
    _FrozenDateTime.frozen_now = frozen_now
    original_datetime = search_mod.datetime
    original_generate_embedding = search_mod.generate_embedding
    search_mod.datetime = _FrozenDateTime

    try:
        all_memories = [
            mem for mem in store.get_all_memories_with_embeddings() if mem.embedding is not None
        ]
        if not all_memories:
            raise RuntimeError("copied database has no memories with embeddings")

        probes: list[dict] = []
        for index, (label, query) in enumerate(DEFAULT_PROBES):
            lexical_scores = dict(store.fts_search(query))
            seed_id = next(iter(lexical_scores), None)
            fallback_memory = all_memories[index % len(all_memories)]
            seed_memory = next((mem for mem in all_memories if mem.id == seed_id), fallback_memory)
            query_embedding = bytes_to_embedding(seed_memory.embedding)
            search_mod.generate_embedding = lambda _q, vec=query_embedding: vec
            results = MemorySearch(store).search(query, limit=limit)
            probes.append(
                {
                    "label": label,
                    "query_embedding": [
                        float(x) for x in np.asarray(query_embedding, dtype=np.float32)
                    ],
                    "expected_order": [result.memory.id for result in results],
                    "memories": [_memory_entry(store, mem, lexical_scores) for mem in all_memories],
                }
            )
        persona_rows = _persona_rows(store)
        persona_probes = _persona_probes(store, persona_rows)
        journey_rows, journey_probes = _journey_probes(store)
        listing_probes = _listing_probes(store, limit)
        count_by_type_expected = sorted(
            f"{memory_type}={count}" for memory_type, count in store.count_memories_by_type()
        )
    finally:
        search_mod.datetime = original_datetime
        search_mod.generate_embedding = original_generate_embedding
        conn.close()

    fixture = {
        "source_label": source_db.name,
        "frozen_now_ms": int(frozen_now.timestamp() * 1000),
        "limit": limit,
        "weights": dict(search_mod.SEARCH_WEIGHTS),
        "mmr_threshold": search_mod.MMR_DEDUP_THRESHOLD,
        "recency_half_life_days": search_mod.RECENCY_HALF_LIFE_DAYS,
        "reinforcement_decay_days": search_mod.REINFORCEMENT_DECAY_DAYS,
        "reinforcement_use_weight": search_mod.REINFORCEMENT_USE_WEIGHT,
        "reinforcement_retrieval_weight": search_mod.REINFORCEMENT_RETRIEVAL_WEIGHT,
        "probes": probes,
        "persona_threshold": PERSONA_THRESHOLD,
        "persona_rows": persona_rows,
        "persona_probes": persona_probes,
        "journey_rows": journey_rows,
        "journey_probes": journey_probes,
        "copied_db_path": str(copied_db.resolve()),
        "listing_probes": listing_probes,
        "count_by_type_expected": count_by_type_expected,
    }
    fixture_path.write_text(json.dumps(fixture), encoding="utf-8")
    return fixture_path


def _cleanup_work_dir(work_dir: Path, *, keep: bool, passed: bool) -> None:
    """Remove the work dir on a passing run; retain it (stated) otherwise.

    The copied database and the fixture are equivalent to the live memory
    database, so they are not left lying around by default.
    """
    if keep:
        print(f"retained work dir (--keep): {work_dir}")
        return
    if not passed:
        print(f"parity failed; retained work dir for debugging: {work_dir}")
        return
    shutil.rmtree(work_dir, ignore_errors=True)
    print(f"cleaned up work dir (use --keep to retain): {work_dir}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog=(
            "The copied database and generated fixture are equivalent to your live "
            "memory database (raw memory and identity content). They are written under "
            "the work dir with owner-only permissions and removed on a passing run; "
            "pass --keep to retain them for debugging."
        ),
    )
    parser.add_argument("--source-db", required=True, type=Path)
    parser.add_argument("--work-dir", default=DEFAULT_WORK_DIR, type=Path)
    parser.add_argument("--limit", default=5, type=int)
    parser.add_argument(
        "--keep", action="store_true", help="retain the work dir (copy + fixture) after the run"
    )
    parser.add_argument("--debug-sensitive-output", action="store_true")
    args = parser.parse_args(argv)

    source_db = args.source_db.expanduser().resolve()
    if not source_db.exists():
        parser.error(f"source DB does not exist: {source_db}")

    work_dir = args.work_dir
    fixture_path = _build_fixture(source_db=source_db, work_dir=work_dir, limit=args.limit)

    command = [
        "node",
        "ts/parity/real_db_copy_verify.ts",
        "--fixture",
        str(fixture_path),
    ]
    if args.debug_sensitive_output:
        command.append("--debug-sensitive-output")
    completed = subprocess.run(command, check=False, text=True, cwd=Path.cwd())
    _cleanup_work_dir(work_dir, keep=args.keep, passed=completed.returncode == 0)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
