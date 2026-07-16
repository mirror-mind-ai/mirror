"""MemoryService: storage and search for memories and journal entries."""

import json
from collections.abc import Callable

import numpy as np

from memory.config import LOG_LLM_CALLS
from memory.intelligence.embeddings import embedding_to_bytes, generate_embedding
from memory.intelligence.llm_router import LLMResponse
from memory.intelligence.search import MemorySearch
from memory.models import Memory, MemorySummary, SearchResult
from memory.storage.store import Store


def memory_embed_text(title: str, content: str, context: str | None = None) -> str:
    """The text embedded for a memory: title, content, and optional context."""
    text = f"{title}. {content}"
    if context:
        text += f" Context: {context}"
    return text


class MemoryService:
    def __init__(self, store: Store, search_engine: MemorySearch) -> None:
        self.store = store
        self.search_engine = search_engine

    def add_memory(
        self,
        title: str,
        content: str,
        memory_type: str,
        layer: str = "ego",
        context: str | None = None,
        journey: str | None = None,
        persona: str | None = None,
        tags: list[str] | None = None,
        conversation_id: str | None = None,
        metadata: str | None = None,
        embedding: np.ndarray | None = None,
    ) -> Memory:
        """Add a manual memory without automatic extraction.

        ``embedding`` may be a precomputed vector — staged up front by the
        extraction pipeline so a partial failure persists nothing (CV9.E2.S9).
        When omitted, the embedding is generated here.
        """
        if embedding is None:
            embedding = generate_embedding(memory_embed_text(title, content, context))

        mem = Memory(
            conversation_id=conversation_id,
            memory_type=memory_type,
            layer=layer,
            title=title,
            content=content,
            context=context,
            journey=journey,
            persona=persona,
            tags=json.dumps(tags) if tags else None,
            embedding=embedding_to_bytes(embedding),
            metadata=metadata,
        )
        return self.store.create_memory(mem)

    def search(
        self,
        query: str,
        limit: int = 5,
        memory_type: str | None = None,
        layer: str | None = None,
        journey: str | None = None,
    ) -> list[SearchResult]:
        """Search memories by hybrid similarity."""
        return self.search_engine.search(
            query,
            limit=limit,
            memory_type=memory_type,
            layer=layer,
            journey=journey,
        )

    def list_recent(
        self,
        *,
        limit: int = 20,
        memory_type: str | None = None,
        layer: str | None = None,
        journey: str | None = None,
    ) -> list[MemorySummary]:
        """Return recent memory summaries with optional filters."""
        return self.store.list_recent_memory_summaries(
            limit=limit,
            memory_type=memory_type,
            layer=layer,
            journey=journey,
        )

    def count_by_type(self) -> list[tuple[str, int]]:
        """Return memory counts grouped by type."""
        return self.store.count_memories_by_type()

    def get_by_type(self, memory_type: str) -> list[Memory]:
        """Return all memories of one type."""
        return self.store.get_memories_by_type(memory_type)

    def get_by_layer(self, layer: str) -> list[Memory]:
        """Return all memories for one layer."""
        return self.store.get_memories_by_layer(layer)

    def get_by_journey(self, journey: str) -> list[Memory]:
        """Return all memories for one journey."""
        return self.store.get_memories_by_journey(journey)

    def get_timeline(self, start: str, end: str) -> list[Memory]:
        """Return memories in a time range."""
        return self.store.get_memories_timeline(start, end)

    def add_journal(
        self,
        content: str,
        title: str | None = None,
        layer: str | None = None,
        tags: list[str] | None = None,
        conversation_id: str | None = None,
        journey: str | None = None,
        metadata: str | None = None,
    ) -> Memory:
        """Add a journal entry, classifying it with an LLM when needed."""
        from memory.intelligence.extraction import classify_journal_entry

        if not title or not layer or not tags:
            llm_logger: Callable[[LLMResponse], None] | None = None
            if LOG_LLM_CALLS:

                def _log_llm_call(response: LLMResponse) -> None:
                    self.store.log_llm_call(
                        role="journal_classification",
                        model=response.model,
                        prompt=response.prompt or "",
                        response_text=response.content,
                        prompt_tokens=response.prompt_tokens,
                        completion_tokens=response.completion_tokens,
                        latency_ms=response.latency_ms,
                    )

                llm_logger = _log_llm_call

            classification = classify_journal_entry(content, on_llm_call=llm_logger)
            title = title or classification["title"]
            layer = layer or classification["layer"]
            tags = tags or classification["tags"]

        return self.add_memory(
            title=title,
            content=content,
            memory_type="journal",
            layer=layer,
            tags=tags,
            conversation_id=conversation_id,
            journey=journey,
            metadata=metadata,
        )
