"""Generate the committed MCP tool-payload golden (CV22.DS9.US2).

Drives the seven REAL handlers in ``memory.mcp.tools`` over a fixture database
and records each payload string byte for byte. What is graded is the *text* a
tool returns -- ``json.dumps(value, ensure_ascii=False, indent=2, default=str)``
-- because that text is what the model reads.

**One ordered seed, two engines** (plan D9). Neither Python read carries a
tie-break beyond ``created_at DESC`` / ``started_at DESC``, so rows with equal
timestamps come back in rowid order -- insertion order. Two independently seeded
databases would therefore disagree on ties. The seed below is emitted INTO the
golden as an ordered list, and the TypeScript test inserts exactly these rows in
exactly this order into its own fresh database. Ties are in the seed on purpose,
so the tie-break is graded rather than assumed.

Seeding is raw SQL on both sides, not service calls: the services generate ids
and timestamps, and this fixture needs byte-identical rows in both engines.

**Determinism.** Ids, timestamps, and embeddings are literals. The query path of
``search_memories`` and the attachment search inside ``mirror_context`` are
provider-crossing, so ``generate_embedding`` is monkeypatched to a deterministic
vector derived from the query text; the TypeScript test injects a replay provider
computing the same vector. Ranking parity itself is DS1/DS2's property and is not
re-proven here -- this golden grades the payload rendered over that ranking.

Run:  uv run python ts/parity/generate_mcp_tools_golden.py
"""

from __future__ import annotations

import json
import sqlite3
import struct
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from memory import MemoryClient
from memory.mcp import tools

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
OUT_PATH = HERE.parent / "test" / "goldens" / "mcp-tools.golden.json"

EMBEDDING_DIM = 8

# identity rows carry NOT NULL created_at/updated_at with no default; fixing them
# to a literal keeps the fixture reproducible on both engines.
SEED_NOW = "2026-01-01T00:00:00Z"

# The hybrid ranker's recency and reinforcement terms read `datetime.now()`, so
# `search_memories`' scores drift between runs -- measured at the seventh decimal,
# enough to make the determinism gate fail on an unchanged port. The DS2 search
# golden froze the clock for exactly this reason; the same fix applies here, and
# the frozen value travels in the golden so the TypeScript side ranks against it.
FROZEN_NOW = datetime(2026, 2, 1, 12, 0, 0, tzinfo=timezone.utc)


class _FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):  # type: ignore[override]
        return FROZEN_NOW if tz else FROZEN_NOW.replace(tzinfo=None)


# --- the ordered seed -------------------------------------------------------
# Order is contract (see module docstring). Timestamp ties are deliberate.

SEED_JOURNEYS: tuple[dict[str, Any], ...] = (
    {
        "key": "alpha-journey",
        "content": (
            "# Alpha Journey\n**Status:** active\n\n## Description\n"
            "The first seeded journey. Its description runs past the one-hundred-and-fifty "
            "character boundary that list_journeys truncates on, so the cut is graded rather "
            "than assumed by either engine.\n\n## Scope\nA trailing section, because the "
            "description regex needs a blank line or a following heading to terminate on."
        ),
        "metadata": '{"icon": "\\u26a1", "parent_journey": ""}',
    },
    {
        "key": "beta-journey",
        "content": "# Beta Journey\n**Status:** paused\n\n## Description\nA paused journey.\n\n## Scope\nEnds here.",
        "metadata": '{"icon": "\\u25c7"}',
    },
    {
        "key": "gamma-journey",
        "content": "# Gamma Journey\n**Status:** completed\n\n## Description\nA finished journey.\n\n## Scope\nEnds here.",
        "metadata": None,
    },
    {
        # Non-ASCII name and description: ensure_ascii=False must let them through.
        "key": "delta-journey",
        "content": "# Delta Jornada ✳\n**Status:** active\n\n## Description\nDescrição com acentuação ✳.\n\n## Escopo\nTermina aqui.",
        "metadata": '{"icon": "\\u2733"}',
    },
)

SEED_MEMORIES: tuple[dict[str, Any], ...] = (
    {
        "id": "mem-0001",
        "title": "First alpha insight",
        "content": "Content of the first alpha insight.",
        "memory_type": "insight",
        "layer": "ego",
        "journey": "alpha-journey",
        "tags": '["one", "two"]',
        "created_at": "2026-01-01T10:00:00Z",
        "embedding_seed": 1,
    },
    {
        # Same created_at as the row above: the tie-break is insertion order.
        "id": "mem-0002",
        "title": "Second alpha insight (timestamp tie)",
        "content": "Content of the second alpha insight.",
        "memory_type": "insight",
        "layer": "ego",
        "journey": "alpha-journey",
        "tags": None,
        "created_at": "2026-01-01T10:00:00Z",
        "embedding_seed": 2,
    },
    {
        "id": "mem-0003",
        "title": "Uma decisão importante ✳",
        "content": "Conteúdo com acentuação e um emoji ✳.",
        "memory_type": "decision",
        "layer": "shadow",
        "journey": "delta-journey",
        "tags": '["decisão"]',
        "created_at": "2026-01-02T11:30:00Z",
        "embedding_seed": 3,
    },
    {
        "id": "mem-0004",
        "title": "Beta pattern",
        "content": "A pattern observed in the beta journey.",
        "memory_type": "pattern",
        "layer": "self",
        "journey": "beta-journey",
        "tags": "[]",
        "created_at": "2026-01-03T09:15:00Z",
        "embedding_seed": 4,
    },
    {
        # Later than the alpha pair above, so DESC and ASC differ: without this
        # row the sort DIRECTION is ungraded, because alpha's other two memories
        # share a timestamp and resolve by rowid either way. (Found by mutating
        # the ORDER BY and watching every test still pass.)
        "id": "mem-0006",
        "title": "Newest alpha insight",
        "content": "The most recent alpha memory.",
        "memory_type": "insight",
        "layer": "ego",
        "journey": "alpha-journey",
        "tags": '["recent"]',
        "created_at": "2026-01-07T16:45:00Z",
        "embedding_seed": 6,
    },
    {
        # No journey, no embedding: exercises null fields and the non-embedded path.
        "id": "mem-0005",
        "title": "Unassigned reflection",
        "content": "A reflection with no journey and no embedding.",
        "memory_type": "reflection",
        "layer": "ego",
        "journey": None,
        "tags": None,
        "created_at": "2026-01-04T08:00:00Z",
        "embedding_seed": None,
    },
)

SEED_CONVERSATIONS: tuple[dict[str, Any], ...] = (
    {
        "id": "conv-0001",
        "title": "Alpha planning",
        "started_at": "2026-01-05T09:00:00Z",
        "ended_at": "2026-01-05T09:45:00Z",
        "interface": "cli",
        "persona": "engineer",
        "journey": "alpha-journey",
        "summary": "Planned the alpha work.",
    },
    {
        # started_at tie with the row above.
        "id": "conv-0002",
        "title": None,
        "started_at": "2026-01-05T09:00:00Z",
        "ended_at": None,
        "interface": "pi",
        "persona": None,
        "journey": "alpha-journey",
        "summary": None,
    },
    {
        # Later than the alpha pair, so the per-journey conversation sort
        # direction is graded too, not just the tie-break.
        "id": "conv-0004",
        "title": "Newest alpha session",
        "started_at": "2026-01-08T11:00:00Z",
        "ended_at": None,
        "interface": "cli",
        "persona": "engineer",
        "journey": "alpha-journey",
        "summary": None,
    },
    {
        "id": "conv-0003",
        "title": "Delta conversa ✳",
        "started_at": "2026-01-06T14:20:00Z",
        "ended_at": "2026-01-06T15:00:00Z",
        "interface": "cli",
        "persona": "therapist",
        "journey": "delta-journey",
        "summary": "Conversa em português.",
    },
)

SEED_MESSAGES: tuple[dict[str, Any], ...] = (
    {
        "id": "msg-0001",
        "conversation_id": "conv-0001",
        "role": "user",
        "content": "First user line.",
        "created_at": "2026-01-05T09:00:10Z",
    },
    {
        "id": "msg-0002",
        "conversation_id": "conv-0001",
        "role": "assistant",
        "content": "First assistant line.",
        "created_at": "2026-01-05T09:00:20Z",
    },
    {
        "id": "msg-0003",
        "conversation_id": "conv-0001",
        "role": "user",
        "content": "Second user line with ✳.",
        "created_at": "2026-01-05T09:00:30Z",
    },
    {
        "id": "msg-0004",
        "conversation_id": "conv-0003",
        "role": "user",
        "content": "Linha em português.",
        "created_at": "2026-01-06T14:20:10Z",
    },
)

SEED_PERSONAS: tuple[dict[str, Any], ...] = (
    {
        "key": "engineer",
        "content": "# Engineer\nThe engineering lens.",
        "metadata": '{"routing_keywords": ["code", "bug", "database schema"], "routing_descriptor": "engineering"}',
    },
    {
        "key": "therapist",
        "content": "# Therapist\nThe reflective lens.",
        "metadata": '{"routing_keywords": ["feeling", "fear"], "routing_descriptor": "reflection"}',
    },
)

SEED_IDENTITY: tuple[dict[str, Any], ...] = (
    {"layer": "self", "key": "soul", "content": "# Soul\nThe seeded soul layer."},
    {"layer": "ego", "key": "behavior", "content": "# Behavior\nThe seeded behavior layer."},
    {"layer": "ego", "key": "identity", "content": "# Identity\nThe seeded ego identity."},
    {"layer": "user", "key": "identity", "content": "# User\nThe seeded user identity."},
)

# --- the case list ----------------------------------------------------------

CASES: tuple[dict[str, Any], ...] = (
    {"name": "list_journeys_active_only", "tool": "list_journeys", "arguments": {}},
    {
        "name": "journey_status_one_slug",
        "tool": "journey_status",
        "arguments": {"slug": "alpha-journey"},
    },
    {"name": "journey_status_no_slug_every_journey", "tool": "journey_status", "arguments": {}},
    {
        "name": "journey_status_unknown_slug",
        "tool": "journey_status",
        "arguments": {"slug": "does-not-exist"},
    },
    {"name": "list_conversations_default_limit", "tool": "list_conversations", "arguments": {}},
    {
        "name": "list_conversations_by_journey",
        "tool": "list_conversations",
        "arguments": {"journey": "alpha-journey"},
    },
    {
        "name": "list_conversations_by_persona",
        "tool": "list_conversations",
        "arguments": {"persona": "engineer"},
    },
    {
        "name": "list_conversations_limit_one",
        "tool": "list_conversations",
        "arguments": {"limit": 1},
    },
    {
        "name": "recall_conversation_by_full_id",
        "tool": "recall_conversation",
        "arguments": {"conversation_id": "conv-0001"},
    },
    {
        "name": "recall_conversation_by_prefix",
        "tool": "recall_conversation",
        "arguments": {"conversation_id": "conv-000"},
    },
    {
        "name": "recall_conversation_limit_two",
        "tool": "recall_conversation",
        "arguments": {"conversation_id": "conv-0001", "limit": 2},
    },
    # limit=0 returns the WHOLE transcript (messages[-0:]). Recorded, not fixed:
    # US1's threat model owns the finding and DS9.TS1 caps it. The golden keeps
    # the divergence visible when TS1 changes it.
    {
        "name": "recall_conversation_limit_zero_returns_all",
        "tool": "recall_conversation",
        "arguments": {"conversation_id": "conv-0001", "limit": 0},
    },
    {
        "name": "recall_conversation_unknown_prefix_raises",
        "tool": "recall_conversation",
        "arguments": {"conversation_id": "zzzz"},
    },
    {
        "name": "recall_conversation_missing_id_raises",
        "tool": "recall_conversation",
        "arguments": {},
    },
    # Whole-number float scores: Python renders 2.0, JavaScript renders 2.
    {
        "name": "detect_persona_whole_float_scores",
        "tool": "detect_persona",
        "arguments": {"query": "there is a bug in the database schema"},
    },
    {
        "name": "detect_persona_no_match",
        "tool": "detect_persona",
        "arguments": {"query": "completely unrelated wording"},
    },
    {"name": "detect_persona_missing_query_raises", "tool": "detect_persona", "arguments": {}},
    {
        "name": "search_memories_by_journey_filter",
        "tool": "search_memories",
        "arguments": {"journey": "alpha-journey"},
    },
    {
        "name": "search_memories_by_layer_filter",
        "tool": "search_memories",
        "arguments": {"layer": "ego"},
    },
    {
        "name": "search_memories_by_type_filter",
        "tool": "search_memories",
        "arguments": {"type": "insight"},
    },
    {
        "name": "search_memories_filter_limit_one",
        "tool": "search_memories",
        "arguments": {"type": "insight", "limit": 1},
    },
    {
        "name": "search_memories_filter_limit_zero",
        "tool": "search_memories",
        "arguments": {"type": "insight", "limit": 0},
    },
    {
        "name": "search_memories_no_query_no_filter_raises",
        "tool": "search_memories",
        "arguments": {},
    },
    {
        "name": "search_memories_query_replayed",
        "tool": "search_memories",
        "arguments": {"query": "alpha insight", "limit": 3},
    },
    {
        "name": "search_memories_query_non_ascii",
        "tool": "search_memories",
        "arguments": {"query": "decisão", "limit": 3},
    },
    {"name": "mirror_context_no_query", "tool": "mirror_context", "arguments": {}},
    {
        "name": "mirror_context_with_journey",
        "tool": "mirror_context",
        "arguments": {"journey": "alpha-journey"},
    },
    {
        "name": "mirror_context_with_query_replayed",
        "tool": "mirror_context",
        "arguments": {"query": "alpha insight"},
    },
)


def deterministic_embedding(seed: int) -> list[float]:
    """A fixed unit-ish vector per seed. Both engines compute this identically."""
    return [round(((seed * 7 + index * 3) % 11) / 10.0, 4) for index in range(EMBEDDING_DIM)]


def query_embedding(text: str) -> list[float]:
    """The replayed query vector: a pure function of the query text.

    The TypeScript test injects a provider computing exactly this, so the
    embedding seam is deterministic on both sides without a provider call.
    """
    total = sum(ord(character) for character in text)
    return [round(((total + index * 13) % 11) / 10.0, 4) for index in range(EMBEDDING_DIM)]


def _embedding_blob(vector: list[float]) -> bytes:
    return struct.pack(f"<{len(vector)}f", *vector)


def _seed(db_path: Path) -> None:
    """Insert the ordered seed with raw SQL, so both engines hold equal rows."""
    connection = sqlite3.connect(db_path)
    try:
        for journey in SEED_JOURNEYS:
            connection.execute(
                "INSERT INTO identity (id, layer, key, content, metadata, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    f"id-journey-{journey['key']}",
                    "journey",
                    journey["key"],
                    journey["content"],
                    journey["metadata"],
                    SEED_NOW,
                    SEED_NOW,
                ),
            )
        for persona in SEED_PERSONAS:
            connection.execute(
                "INSERT INTO identity (id, layer, key, content, metadata, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    f"id-persona-{persona['key']}",
                    "persona",
                    persona["key"],
                    persona["content"],
                    persona["metadata"],
                    SEED_NOW,
                    SEED_NOW,
                ),
            )
        for row in SEED_IDENTITY:
            connection.execute(
                "INSERT INTO identity (id, layer, key, content, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    f"id-{row['layer']}-{row['key']}",
                    row["layer"],
                    row["key"],
                    row["content"],
                    SEED_NOW,
                    SEED_NOW,
                ),
            )
        for memory in SEED_MEMORIES:
            blob = (
                _embedding_blob(deterministic_embedding(memory["embedding_seed"]))
                if memory["embedding_seed"] is not None
                else None
            )
            connection.execute(
                "INSERT INTO memories (id, title, content, memory_type, layer, journey, tags, "
                "created_at, embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    memory["id"],
                    memory["title"],
                    memory["content"],
                    memory["memory_type"],
                    memory["layer"],
                    memory["journey"],
                    memory["tags"],
                    memory["created_at"],
                    blob,
                ),
            )
        for conversation in SEED_CONVERSATIONS:
            connection.execute(
                "INSERT INTO conversations (id, title, started_at, ended_at, interface, persona, "
                "journey, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    conversation["id"],
                    conversation["title"],
                    conversation["started_at"],
                    conversation["ended_at"],
                    conversation["interface"],
                    conversation["persona"],
                    conversation["journey"],
                    conversation["summary"],
                ),
            )
        for message in SEED_MESSAGES:
            connection.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    message["id"],
                    message["conversation_id"],
                    message["role"],
                    message["content"],
                    message["created_at"],
                ),
            )
        connection.commit()
    finally:
        connection.close()


def _run_cases(client: MemoryClient) -> list[dict[str, Any]]:
    recorded: list[dict[str, Any]] = []
    for case in CASES:
        tool = tools.TOOLS_BY_NAME[case["tool"]]
        try:
            payload = tool.handler(client, case["arguments"])
            recorded.append({**case, "payload": payload, "raises": None})
        except Exception as exc:  # the dispatcher renders these as isError results
            recorded.append({**case, "payload": None, "raises": str(exc)})
    return recorded


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "memory.db"
        # MemoryClient bootstraps the schema; the seed then writes rows directly.
        client = MemoryClient(db_path=db_path)
        _seed(db_path)
        client = MemoryClient(db_path=db_path)

        # Every module that imported `generate_embedding` by name holds its own
        # reference, so patching the definition site alone would miss them.
        import memory.intelligence.embeddings as embeddings_module
        import memory.intelligence.search as intelligence_search_module
        import memory.services.attachment as attachment_module
        import memory.services.memory as memory_service_module

        def replay(text: str, **kwargs: Any) -> Any:
            return np.array(query_embedding(text), dtype=np.float32)

        import memory.intelligence.search as ranking_module

        original_datetime = ranking_module.datetime
        ranking_module.datetime = _FrozenDateTime  # type: ignore[assignment]

        originals = []
        for module in (
            embeddings_module,
            intelligence_search_module,
            attachment_module,
            memory_service_module,
        ):
            if hasattr(module, "generate_embedding"):
                originals.append((module, module.generate_embedding))
                module.generate_embedding = replay  # type: ignore[assignment]
        try:
            cases = _run_cases(client)
        finally:
            ranking_module.datetime = original_datetime  # type: ignore[assignment]
            for module, original in originals:
                module.generate_embedding = original  # type: ignore[assignment]

    golden = {
        "_comment": (
            "MCP tool payload parity golden (CV22.DS9.US2). Generated from the real "
            "memory.mcp.tools handlers by ts/parity/generate_mcp_tools_golden.py. The seed "
            "below is ORDERED and both engines must insert it in this order: neither Python "
            "read has a tie-break beyond its timestamp, so equal timestamps resolve by rowid."
        ),
        "embedding_dim": EMBEDDING_DIM,
        "frozen_now": FROZEN_NOW.isoformat().replace("+00:00", "Z"),
        "frozen_now_ms": int(FROZEN_NOW.timestamp() * 1000),
        "seed": {
            "journeys": list(SEED_JOURNEYS),
            "personas": list(SEED_PERSONAS),
            "identity": list(SEED_IDENTITY),
            "memories": [
                {
                    **memory,
                    "embedding": (
                        deterministic_embedding(memory["embedding_seed"])
                        if memory["embedding_seed"] is not None
                        else None
                    ),
                }
                for memory in SEED_MEMORIES
            ],
            "conversations": list(SEED_CONVERSATIONS),
            "messages": list(SEED_MESSAGES),
        },
        "cases": cases,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    raised = sum(1 for case in cases if case["raises"])
    print(f"wrote {OUT_PATH.relative_to(REPO_ROOT)} ({len(cases)} cases, {raised} raising)")


if __name__ == "__main__":
    main()
