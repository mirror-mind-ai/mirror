"""Mirror MCP tool registry.

Read + on-demand-context tools, each a thin wrapper over the ``MemoryClient``
façade. Handlers receive a shared client and the call arguments and return text
content. No writes/mutations live here (a later story owns those);
``search_memories`` does not reinforce retrieval (``log_access=False``).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from memory import MemoryClient


@dataclass(frozen=True)
class Tool:
    """An MCP tool: its name, description, JSON Schema, and handler."""

    name: str
    description: str
    input_schema: dict[str, Any]
    handler: Callable[[MemoryClient, dict[str, Any]], str]


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)


def _memory_to_dict(memory: Any) -> dict[str, Any]:
    return {
        "id": getattr(memory, "id", None),
        "title": getattr(memory, "title", None),
        "memory_type": getattr(memory, "memory_type", None),
        "layer": getattr(memory, "layer", None),
        "journey": getattr(memory, "journey", None),
        "tags": getattr(memory, "tags", None),
        "content": getattr(memory, "content", None),
    }


# --- handlers --------------------------------------------------------------


def _mirror_context(client: MemoryClient, args: dict[str, Any]) -> str:
    # Side-effect-free context builder. Deliberately NOT skills.mirror.load,
    # which would activate Mirror Mode and mutate sticky defaults / mode state.
    return client.load_mirror_context(
        persona=args.get("persona"),
        journey=args.get("journey"),
        query=args.get("query"),
    )


def _list_journeys(client: MemoryClient, args: dict[str, Any]) -> str:
    return _json(client.list_active_journeys())


def _journey_status(client: MemoryClient, args: dict[str, Any]) -> str:
    return _json(client.get_journey_status(args.get("slug")))


def _search_memories(client: MemoryClient, args: dict[str, Any]) -> str:
    query = args.get("query")
    limit = int(args.get("limit", 5))
    memory_type = args.get("type")
    layer = args.get("layer")
    journey = args.get("journey")
    if query:
        results = client.search(
            query,
            limit=limit,
            memory_type=memory_type,
            layer=layer,
            journey=journey,
            log_access=False,
        )
        return _json([_memory_to_dict(r.memory) | {"score": r.score} for r in results])
    if journey:
        memories = client.get_by_journey(journey)
    elif layer:
        memories = client.get_by_layer(layer)
    elif memory_type:
        memories = client.get_by_type(memory_type)
    else:
        raise ValueError("provide 'query' or one of 'type' / 'layer' / 'journey'")
    return _json([_memory_to_dict(m) for m in memories[:limit]])


def _list_conversations(client: MemoryClient, args: dict[str, Any]) -> str:
    summaries = client.conversations.list_recent(
        limit=int(args.get("limit", 20)),
        journey=args.get("journey"),
        persona=args.get("persona"),
    )
    return _json(
        [
            {
                "id": s.id,
                "title": s.title,
                "started_at": s.started_at,
                "persona": s.persona,
                "journey": s.journey,
                "message_count": s.message_count,
            }
            for s in summaries
        ]
    )


def _recall_conversation(client: MemoryClient, args: dict[str, Any]) -> str:
    conv_id = args.get("conversation_id")
    if not conv_id:
        raise ValueError("'conversation_id' is required")
    conv = client.conversations.find_by_id_prefix(conv_id)
    if conv is None:
        raise ValueError(f"no conversation matching '{conv_id}'")
    limit = int(args.get("limit", 50))
    messages = client.store.get_messages(conv.id)[-limit:]
    return _json(
        {
            "conversation_id": conv.id,
            "messages": [
                {"role": m.role, "content": m.content, "created_at": m.created_at} for m in messages
            ],
        }
    )


def _detect_persona(client: MemoryClient, args: dict[str, Any]) -> str:
    query = args.get("query")
    if not query:
        raise ValueError("'query' is required")
    matches = client.identity.detect_persona(query)
    return _json(
        [{"persona": name, "score": score, "descriptor": desc} for name, score, desc in matches]
    )


# --- registry --------------------------------------------------------------

TOOLS: list[Tool] = [
    Tool(
        "mirror_context",
        "Load Mirror identity context on demand (side-effect-free). Optionally "
        "scope by persona and journey; pass the user query for attachment search.",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "User query for attachment search."},
                "persona": {"type": "string", "description": "Persona id to scope context."},
                "journey": {"type": "string", "description": "Journey slug to scope context."},
            },
        },
        _mirror_context,
    ),
    Tool(
        "list_journeys",
        "List active journeys with status, stage, and description.",
        {"type": "object", "properties": {}},
        _list_journeys,
    ),
    Tool(
        "journey_status",
        "Get status for one journey, or overall status when no slug is given.",
        {
            "type": "object",
            "properties": {"slug": {"type": "string", "description": "Journey slug."}},
        },
        _journey_status,
    ),
    Tool(
        "search_memories",
        "Search memories by query, or list by type/layer/journey filter.",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "type": {"type": "string", "description": "Memory type filter."},
                "layer": {"type": "string", "description": "Jungian layer filter."},
                "journey": {"type": "string", "description": "Journey slug filter."},
                "limit": {"type": "integer", "default": 5},
            },
        },
        _search_memories,
    ),
    Tool(
        "list_conversations",
        "List recent conversations with optional journey/persona filters.",
        {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 20},
                "journey": {"type": "string"},
                "persona": {"type": "string"},
            },
        },
        _list_conversations,
    ),
    Tool(
        "recall_conversation",
        "Load messages from a previous conversation by id (prefix accepted).",
        {
            "type": "object",
            "properties": {
                "conversation_id": {"type": "string"},
                "limit": {"type": "integer", "default": 50},
            },
            "required": ["conversation_id"],
        },
        _recall_conversation,
    ),
    Tool(
        "detect_persona",
        "Show persona routing matches for a query.",
        {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
        _detect_persona,
    ),
]

TOOLS_BY_NAME: dict[str, Tool] = {tool.name: tool for tool in TOOLS}
