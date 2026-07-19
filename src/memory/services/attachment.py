"""AttachmentService: journey knowledge-base attachment management."""

import json
import re

from memory.intelligence.embeddings import (
    add_embedding_provenance,
    bytes_to_embedding,
    embedding_to_bytes,
    generate_embedding,
)
from memory.models import Attachment
from memory.services.observability import build_llm_logger
from memory.storage.store import Store
from memory.utils import strip_accents


class AttachmentService:
    def __init__(self, store: Store) -> None:
        self.store = store

    def add_attachment(
        self,
        journey_id: str | None = None,
        name: str | None = None,
        content: str | None = None,
        description: str | None = None,
        content_type: str = "markdown",
        tags: list[str] | None = None,
    ) -> Attachment:
        """Add an attachment to a journey, generating an embedding for its content."""
        if journey_id is None:
            raise TypeError("add_attachment() missing required argument: 'journey_id'")
        if name is None:
            raise TypeError("add_attachment() missing required argument: 'name'")
        if content is None:
            raise TypeError("add_attachment() missing required argument: 'content'")
        emb = generate_embedding(
            content[:8000], on_llm_call=build_llm_logger(self.store, role="embedding")
        )

        att = Attachment(
            journey_id=journey_id,
            name=name,
            content=content,
            description=description,
            content_type=content_type,
            tags=json.dumps(tags) if tags else None,
            embedding=embedding_to_bytes(emb),
            metadata=add_embedding_provenance(None),
        )
        return self.store.create_attachment(att)

    def get_attachments(self, journey_id: str) -> list[Attachment]:
        """List all attachments for a journey."""
        return self.store.get_attachments_by_journey(journey_id)

    def get_attachment(self, journey_id: str, name: str) -> Attachment | None:
        """Return an attachment by name within a journey."""
        return self.store.get_attachment_by_name(journey_id, name)

    def remove_attachment(self, journey_id: str, name: str) -> bool:
        """Remove an attachment by name."""
        att = self.store.get_attachment_by_name(journey_id, name)
        if not att:
            return False
        return self.store.delete_attachment(att.id)

    def search_attachments(
        self,
        journey_id: str,
        query: str,
        limit: int = 3,
    ) -> list[tuple[Attachment, float]]:
        """Run semantic search within one journey's attachments."""
        import numpy as np

        attachments = self.store.get_all_attachments_with_embeddings(journey_id)

        if not attachments:
            return []

        query_emb = generate_embedding(query)

        scored = []
        for att in attachments:
            if att.embedding is None:
                continue
            att_emb = bytes_to_embedding(att.embedding)
            similarity = float(
                np.dot(query_emb, att_emb) / (np.linalg.norm(query_emb) * np.linalg.norm(att_emb))
            )
            scored.append((att, similarity))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:limit]

    def search_all_attachments(
        self,
        query: str,
        limit: int = 5,
    ) -> list[tuple[Attachment, float]]:
        """Run semantic search across all journey attachments.

        Applies a boost when query terms appear in the attachment name or
        description, so direct matches are not lost in the ranking.
        """
        import numpy as np

        attachments = self.store.get_all_attachments_with_embeddings_global()

        if not attachments:
            return []

        query_emb = generate_embedding(query)

        # Extract query tokens, including short numeric references like "6".
        query_tokens = [
            strip_accents(t.lower())
            for t in re.findall(r"\w+", query)
            if len(t) >= 2 or t.isdigit()
        ]

        scored = []
        for att in attachments:
            if att.embedding is None:
                continue
            att_emb = bytes_to_embedding(att.embedding)
            similarity = float(
                np.dot(query_emb, att_emb) / (np.linalg.norm(query_emb) * np.linalg.norm(att_emb))
            )

            # Boost direct matches in name, description, or journey id.
            raw_searchable = f"{att.journey_id} {att.name} {att.description or ''}".lower()
            searchable = strip_accents(raw_searchable)
            searchable = re.sub(r"(\D)(\d)", r"\1 \2", searchable)
            searchable = re.sub(r"(\d)(\D)", r"\1 \2", searchable)
            matches = sum(1 for t in query_tokens if t in searchable)
            if query_tokens and matches:
                ratio = matches / len(query_tokens)
                boost = ratio * 0.15
                similarity += boost

            scored.append((att, similarity))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:limit]
