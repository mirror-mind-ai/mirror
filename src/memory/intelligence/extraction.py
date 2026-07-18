"""Automatic memory and task extraction through an LLM."""

import json
import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any

from memory.config import EXTRACTION_MODEL
from memory.intelligence.llm_router import LLMResponse, send_to_model
from memory.intelligence.prompts import (
    CONVERSATION_SUMMARY_PROMPT,
    CONVERSATION_TAGS_PROMPT,
    CONVERSATION_TITLE_PROMPT,
    CURATION_PROMPT,
    DESCRIPTOR_PROMPT,
    EXTRACTION_PROMPT,
    JOURNAL_CLASSIFICATION_PROMPT,
    TASK_EXTRACTION_PROMPT,
    WEEK_PLAN_PROMPT,
    fence_untrusted,
)
from memory.models import (
    VALID_MEMORY_LAYERS,
    VALID_MEMORY_TYPES,
    ExtractedMemory,
    ExtractedTask,
    ExtractedWeekItem,
    Memory,
    Message,
)

logger = logging.getLogger(__name__)

# Extraction boundary caps (AI-15) — hard limits on what one conversation may
# write, so a degenerate or prompt-injected response cannot flood the store.
MAX_MEMORIES_PER_CONVERSATION = 8
MAX_TASKS_PER_CONVERSATION = 5


def _fence_transcript(body: str) -> str:
    """Wrap transcript text so the model reads it as fenced, untrusted data (AI-16).

    Thin wrapper over the shared fence_untrusted (CV9.E2.S22) — kept as a named
    function so call sites read `_fence_transcript(...)` rather than a bare tag
    string, and so this file's own fence test stays behaviour-anchored.
    """
    return fence_untrusted("transcript", body)


def _sanitize_extracted(
    memories: list[ExtractedMemory], *, max_count: int
) -> tuple[list[ExtractedMemory], dict[str, int]]:
    """Drop memories with an invalid layer or type and cap the count (AI-15).

    Returns the kept memories and counts of what was dropped, so callers can log
    it instead of silently swallowing garbage or an over-large response.
    """
    kept: list[ExtractedMemory] = []
    dropped = {"invalid_layer": 0, "invalid_type": 0, "over_cap": 0}
    for mem in memories:
        if mem.layer not in VALID_MEMORY_LAYERS:
            dropped["invalid_layer"] += 1
            continue
        if mem.memory_type not in VALID_MEMORY_TYPES:
            dropped["invalid_type"] += 1
            continue
        if len(kept) >= max_count:
            dropped["over_cap"] += 1
            continue
        kept.append(mem)
    return kept, dropped


def format_transcript(messages: list[Message], user_name: str = "User") -> str:
    """Format messages as a readable transcript."""
    lines = []
    for msg in messages:
        role = user_name if msg.role == "user" else "Mirror"
        lines.append(f"**{role}:** {msg.content}")
    return "\n\n".join(lines)


def _parse_json_response(raw: str) -> Any | None:
    """Strip optional markdown fencing and parse JSON.

    Returns the parsed value, or None if the input is empty or not valid JSON.
    """
    raw = raw.strip()
    if not raw:
        return None
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def extract_memories(
    messages: list[Message],
    persona: str | None = None,
    journey: str | None = None,
    user_name: str = "User",
    on_llm_call: Callable[[LLMResponse], None] | None = None,
    status: dict | None = None,
) -> list[ExtractedMemory]:
    """Extract memories from a conversation using an LLM.

    When ``status`` is provided it is populated with ``extraction_status``
    (``parse_failed`` | ``no_signal`` | ``ok``) and a ``dropped`` count map, so the
    caller can distinguish unreadable model output from a genuinely empty result
    (AI-10). The list return is unchanged.
    """
    if not messages:
        return []

    prompt = EXTRACTION_PROMPT + _fence_transcript(format_transcript(messages, user_name=user_name))
    response = send_to_model(
        EXTRACTION_MODEL,
        [{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    if on_llm_call:
        on_llm_call(response)

    data = _parse_json_response(response.content)
    if not isinstance(data, list):
        if status is not None:
            status["extraction_status"] = "parse_failed"
        return []

    memories = []
    for item in data:
        try:
            mem = ExtractedMemory(**item)
            if not mem.persona and persona:
                mem.persona = persona
            if not mem.journey and journey:
                mem.journey = journey
            memories.append(mem)
        except Exception:
            continue

    kept, dropped = _sanitize_extracted(memories, max_count=MAX_MEMORIES_PER_CONVERSATION)
    if any(dropped.values()):
        logger.warning("extraction dropped memory items: %s", dropped)
    if status is not None:
        status["extraction_status"] = "ok" if kept else "no_signal"
        status["dropped"] = dropped
    return kept


def generate_descriptor(
    content: str,
    layer: str,
    key: str,
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> str:
    """Generate a routing-optimized 1-2 sentence descriptor for a persona or journey.

    Returns plain text stripped of whitespace.
    Returns '' on empty content or any LLM failure.
    """
    if not content.strip():
        return ""

    prompt = DESCRIPTOR_PROMPT.format(layer=layer, key=key) + content

    try:
        response = send_to_model(
            EXTRACTION_MODEL,
            [{"role": "user", "content": prompt}],
            temperature=0.2,
        )
    except Exception:
        return ""

    if on_llm_call:
        on_llm_call(response)

    return response.content.strip()


def generate_conversation_title(
    messages: list[Message],
    user_name: str = "User",
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> str:
    """Generate a concise title suggestion for a conversation.

    Returns an empty string on empty messages, LLM failure, or trivial conversation.
    Plain text output — not JSON.
    """
    if not messages:
        return ""

    prompt = CONVERSATION_TITLE_PROMPT + format_transcript(messages, user_name=user_name)

    try:
        response = send_to_model(
            EXTRACTION_MODEL,
            [{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=40,
        )
    except Exception:
        return ""

    if on_llm_call:
        on_llm_call(response)

    return _clean_title_suggestion(response.content)


def _clean_title_suggestion(value: str) -> str:
    title = " ".join(value.strip().strip('"“”').split())
    return title[:160]


def generate_conversation_tags(
    messages: list[Message],
    user_name: str = "User",
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> list[str]:
    """Generate durable thematic tags for a conversation.

    Returns [] on empty messages, LLM failure, or invalid output.
    """
    if not messages:
        return []

    prompt = CONVERSATION_TAGS_PROMPT + format_transcript(messages, user_name=user_name)
    try:
        response = send_to_model(
            EXTRACTION_MODEL,
            [{"role": "user", "content": prompt}],
            temperature=0.2,
        )
    except Exception:
        return []

    if on_llm_call:
        on_llm_call(response)

    data = _parse_json_response(response.content)
    if not isinstance(data, list):
        return []
    tags: list[str] = []
    for item in data:
        tag = " ".join(str(item).strip().split())
        if tag and tag not in tags:
            tags.append(tag[:40])
    return tags[:6]


def generate_conversation_summary(
    messages: list[Message],
    user_name: str = "User",
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> str:
    """Generate a 3-4 sentence LLM summary of a conversation.

    Returns an empty string on empty messages, LLM failure, or trivial conversation.
    Plain text output — not JSON.
    """
    if not messages:
        return ""

    prompt = CONVERSATION_SUMMARY_PROMPT + format_transcript(messages, user_name=user_name)

    try:
        response = send_to_model(
            EXTRACTION_MODEL,
            [{"role": "user", "content": prompt}],
            temperature=0.3,
        )
    except Exception:
        return ""

    if on_llm_call:
        on_llm_call(response)

    return response.content.strip()


def _format_candidates(candidates: list[ExtractedMemory]) -> str:
    """Format candidate memories for the curation prompt."""
    lines = []
    for i, c in enumerate(candidates, 1):
        lines.append(f"{i}. **{c.title}** ({c.memory_type}/{c.layer})")
        lines.append(f"   Content: {c.content}")
        if c.context:
            lines.append(f"   Context: {c.context}")
        lines.append("")
    return "\n".join(lines)


def _format_existing(existing: list[Memory]) -> str:
    """Format existing memories as compact descriptors for the curation prompt."""
    lines = []
    for m in existing:
        lines.append(f"- **{m.title}** ({m.memory_type}/{m.layer})")
        lines.append(f"  {m.content[:200]}")
        lines.append("")
    return "\n".join(lines)


def curate_against_existing(
    candidates: list[ExtractedMemory],
    existing: list[Memory],
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> list[ExtractedMemory]:
    """Filter and deduplicate candidate memories against the existing memory pool.

    Storage-free: caller provides both candidates and pre-fetched existing memories.

    Returns:
        A filtered/revised list of ExtractedMemory to store.
        Returns candidates unchanged when existing is empty (no LLM call).
        Returns candidates unchanged on any LLM or parse error (fail open).
    """
    if not candidates:
        return []
    if not existing:
        return candidates  # Nothing to deduplicate against; skip LLM call.

    prompt = (
        CURATION_PROMPT
        + "## Candidate memories (from this conversation)\n\n"
        + _format_candidates(candidates)
        + "\n## Existing similar memories (already stored)\n\n"
        + _format_existing(existing)
    )

    try:
        response = send_to_model(
            EXTRACTION_MODEL,
            [{"role": "user", "content": prompt}],
            temperature=0.2,
        )
    except Exception:
        return candidates  # Fail open: return all candidates on error.

    if on_llm_call:
        on_llm_call(response)

    data = _parse_json_response(response.content)
    if not isinstance(data, list):
        return candidates  # Fail open: malformed response.

    curated = []
    for item in data:
        try:
            curated.append(ExtractedMemory(**item))
        except Exception:
            continue

    kept, dropped = _sanitize_extracted(curated, max_count=MAX_MEMORIES_PER_CONVERSATION)
    if any(dropped.values()):
        logger.warning("curation dropped memory items: %s", dropped)
    return kept


def extract_tasks(
    messages: list[Message],
    journey: str | None = None,
    user_name: str = "User",
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> list[ExtractedTask]:
    """Extract tasks from a conversation using an LLM."""
    if not messages:
        return []

    prompt = TASK_EXTRACTION_PROMPT + _fence_transcript(
        format_transcript(messages, user_name=user_name)
    )
    response = send_to_model(
        EXTRACTION_MODEL,
        [{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    if on_llm_call:
        on_llm_call(response)

    data = _parse_json_response(response.content)
    if not isinstance(data, list):
        return []

    tasks = []
    for item in data:
        try:
            task = ExtractedTask(
                title=item["title"],
                due_date=item.get("due_date"),
                journey=item.get("journey") or journey,
                stage=item.get("stage"),
                context=item.get("context"),
            )
            tasks.append(task)
        except (KeyError, TypeError):
            continue

    if len(tasks) > MAX_TASKS_PER_CONVERSATION:
        logger.warning("extraction capped tasks: %d -> %d", len(tasks), MAX_TASKS_PER_CONVERSATION)
        tasks = tasks[:MAX_TASKS_PER_CONVERSATION]
    return tasks


def extract_week_plan(
    text: str,
    journey_context: list[dict],
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> list[ExtractedWeekItem]:
    """Extract temporal items from a natural-language weekly plan."""
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    weekday = weekdays[now.weekday()]

    journeys_text = (
        "\n".join(f"- **{t['slug']}**: {t['description'][:100]}" for t in journey_context)
        if journey_context
        else "(no active journeys)"
    )

    prompt = WEEK_PLAN_PROMPT.format(today=today, weekday=weekday, journeys=journeys_text) + text
    response = send_to_model(
        EXTRACTION_MODEL,
        [{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    if on_llm_call:
        on_llm_call(response)

    data = _parse_json_response(response.content)
    if not isinstance(data, list):
        return []

    items = []
    for item_data in data:
        try:
            items.append(ExtractedWeekItem(**item_data))
        except Exception:
            continue

    return items


def classify_journal_entry(
    content: str,
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> dict:
    """Classify a journal entry through an LLM: title, layer, and tags.

    AI-24 (CV9.E2.S25): coerces model-chosen layer to 'ego' when not in
    VALID_MEMORY_LAYERS, so the journal path inherits the same domain constraint
    extraction already enforces.
    """
    from memory.models import VALID_MEMORY_LAYERS

    prompt = JOURNAL_CLASSIFICATION_PROMPT + content
    response = send_to_model(
        EXTRACTION_MODEL,
        [{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    if on_llm_call:
        on_llm_call(response)

    data = _parse_json_response(response.content)
    if not isinstance(data, dict):
        return {"title": content[:60], "layer": "ego", "tags": []}

    # Coerce invalid layer to 'ego' (the existing fallback) rather than
    # letting it flow to add_memory unchecked.
    layer = data.get("layer", "ego")
    if layer not in VALID_MEMORY_LAYERS:
        layer = "ego"

    return {
        "title": data.get("title", content[:60]),
        "layer": layer,
        "tags": data.get("tags", []),
    }
