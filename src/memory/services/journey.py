"""JourneyService: journey, journey-path, and routing management."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import TYPE_CHECKING

from memory.models import Identity
from memory.storage.store import Store
from memory.utils import strip_accents

if TYPE_CHECKING:
    from memory.services.identity import IdentityService

JOURNEY_LAYER = "journey"
JOURNEY_PATH_LAYER = "journey_path"


class JourneyService:
    def __init__(
        self,
        store: Store,
        identity: IdentityService | None = None,
    ) -> None:
        self.store = store
        if identity is None:
            raise TypeError("JourneyService requires identity")
        self.identity: IdentityService = identity

    def get_journey_path(self, journey: str) -> str | None:
        """Return a journey path.

        If a sync_file is configured, reads from the external file. Falls back
        to the database if the file does not exist.
        """
        sync_file = self.get_sync_file(journey)
        if sync_file:
            from pathlib import Path

            path = Path(sync_file).expanduser()
            try:
                return path.read_text(encoding="utf-8")
            except (FileNotFoundError, PermissionError, OSError):
                pass  # Fall back to the database.
        return self.identity.get_identity(JOURNEY_PATH_LAYER, journey)

    def set_journey_path(self, journey: str, content: str) -> Identity:
        """Create or update a journey path."""
        return self.identity.set_identity(JOURNEY_PATH_LAYER, journey, content)

    def get_journey_status(self, journey: str | None = None) -> dict:
        """Gather full context for status synthesis.

        If journey is None, returns all journeys.
        """
        if journey:
            journeys = [journey]
        else:
            all_t = self._get_journey_identities()
            journeys = [t.key for t in all_t]

        result = {}
        for journey_id in journeys:
            journey_path = self.get_journey_path(journey_id)
            result[journey_id] = {
                "identity": self._get_journey_identity_content(journey_id),
                "journey_path": journey_path,
                "recent_memories": self.store.get_memories_by_journey(journey_id)[:10],
                "recent_conversations": self.store.get_recent_conversations_by_journey(
                    journey_id, limit=5
                ),
            }
        return result

    def list_active_journeys(self) -> list[dict]:
        """Return a compact list of active journeys for routing.

        Returns dicts with: id, name, description (first 150 chars).
        """
        journeys = self._get_journey_identities()
        result = []
        for journey in journeys:
            content = journey.content or ""
            first_line = content.split("\n")[0].strip().lstrip("# ").strip()
            status_match = re.search(r"\*\*Status:\*\*\s*(\w+)", content)
            status = status_match.group(1) if status_match else "unknown"
            if status != "active":
                continue
            desc_match = re.search(
                r"## (?:Description|Descrição)\s*\n+(.+?)(?:\n\n|\n##)",
                content,
                re.DOTALL,
            )
            description = desc_match.group(1).strip()[:150] if desc_match else ""
            result.append(
                {
                    "id": journey.key,
                    "name": first_line,
                    "description": description,
                }
            )
        return result

    def detect_journey(self, query: str, threshold: float = 0.35) -> list[tuple[str, float, str]]:
        """Detect relevant journeys from a user prompt.

        Uses two levels of matching:
          1. Direct text match: the journey ID appears in the text
          2. Semantic match: query embedding vs journey description

        Returns (journey_id, score, match_type) sorted by score. Only returns
        results above the threshold.
        """
        from memory.intelligence.embeddings import generate_embedding

        query_lower = strip_accents(query.lower())
        query_tokens = set(re.findall(r"\w+", query_lower))

        journeys = self._get_journey_identities()
        if not journeys:
            return []

        text_matches = []
        for journey in journeys:
            journey_id = journey.key
            journey_id_normalized = strip_accents(journey_id.replace("-", " ").lower())
            journey_id_tokens = set(journey_id_normalized.split())

            first_line = (journey.content or "").split("\n")[0].strip().lstrip("# ").strip()
            journey_name_normalized = strip_accents(first_line.lower())
            journey_name_tokens = set(re.findall(r"\w+", journey_name_normalized))

            id_overlap = journey_id_tokens & query_tokens
            name_overlap = journey_name_tokens & query_tokens

            stopwords = {
                "o",
                "a",
                "os",
                "as",
                "de",
                "do",
                "da",
                "dos",
                "das",
                "e",
                "em",
                "no",
                "na",
            }
            id_overlap -= stopwords
            name_overlap -= stopwords

            if id_overlap or name_overlap:
                all_journey_tokens = (journey_id_tokens | journey_name_tokens) - stopwords
                matched = id_overlap | name_overlap
                score = len(matched) / max(len(all_journey_tokens), 1)
                text_matches.append((journey_id, min(1.0, score + 0.5), "text"))

        if text_matches:
            text_matches.sort(key=lambda x: x[1], reverse=True)
            return text_matches

        try:
            query_emb = generate_embedding(query)
        except Exception:
            return []

        semantic_matches = []
        for journey in journeys:
            desc_text = journey.content[:1000] if journey.content else journey.key
            try:
                import numpy as np

                desc_emb = generate_embedding(desc_text)
                similarity = float(
                    np.dot(query_emb, desc_emb)
                    / (np.linalg.norm(query_emb) * np.linalg.norm(desc_emb))
                )
                if similarity >= threshold:
                    semantic_matches.append((journey.key, similarity, "semantic"))
            except Exception:
                continue

        semantic_matches.sort(key=lambda x: x[1], reverse=True)
        return semantic_matches

    def get_project_path(self, journey: str) -> str | None:
        """Return the project path configured for a journey."""
        ident = self._get_journey_identity(journey)
        if not ident or not ident.metadata:
            return None
        try:
            meta = json.loads(ident.metadata)
            project_path = meta.get("project_path")
            return project_path if isinstance(project_path, str) else None
        except (json.JSONDecodeError, TypeError):
            return None

    def set_project_path(self, journey: str, project_path: str) -> str:
        """Configure and return the resolved project path for a journey."""
        ident = self._get_journey_identity(journey)
        if not ident:
            raise ValueError(f"Journey '{journey}' not found.")
        try:
            meta = json.loads(ident.metadata) if ident.metadata else {}
        except (json.JSONDecodeError, TypeError):
            meta = {}
        resolved_path = str(Path(project_path).expanduser().resolve())
        meta["project_path"] = resolved_path
        self.store.update_identity_metadata(ident.layer, journey, json.dumps(meta))
        return resolved_path

    def get_sync_file(self, journey: str) -> str | None:
        """Return the sync file configured for a journey."""
        ident = self._get_journey_identity(journey)
        if not ident or not ident.metadata:
            return None
        try:
            meta = json.loads(ident.metadata)
            return meta.get("sync_file")
        except (json.JSONDecodeError, TypeError):
            return None

    def set_sync_file(self, journey: str, file_path: str) -> None:
        """Configure the sync file for a journey."""
        ident = self._get_journey_identity(journey)
        if not ident:
            raise ValueError(f"Journey '{journey}' not found.")
        try:
            meta = json.loads(ident.metadata) if ident.metadata else {}
        except (json.JSONDecodeError, TypeError):
            meta = {}
        meta["sync_file"] = file_path
        self.store.update_identity_metadata(ident.layer, journey, json.dumps(meta))

    def update_metadata_fields(self, journey: str, fields: dict[str, str]) -> dict:
        """Update selected safe metadata fields for a journey."""
        ident = self._get_journey_identity(journey)
        if not ident:
            raise ValueError(f"Journey '{journey}' not found.")
        allowed = {"project_path", "sync_file", "icon", "color"}
        unknown = set(fields) - allowed
        if unknown:
            raise ValueError(f"Unsupported journey metadata field: {sorted(unknown)[0]}")
        try:
            meta = json.loads(ident.metadata) if ident.metadata else {}
        except (json.JSONDecodeError, TypeError):
            meta = {}
        for key, value in fields.items():
            if not isinstance(value, str):
                raise ValueError(f"{key} must be a string")
            value = value.strip()
            if len(value) > 500:
                raise ValueError(f"{key} must be at most 500 characters")
            if value:
                meta[key] = value
            else:
                meta.pop(key, None)
        self.store.update_identity_metadata(ident.layer, journey, json.dumps(meta, sort_keys=True))
        return meta

    def _get_journey_identities(self) -> list[Identity]:
        return self.store.get_identity_by_layer(JOURNEY_LAYER)

    def _get_journey_identity(self, journey: str) -> Identity | None:
        return self.store.get_identity(JOURNEY_LAYER, journey)

    def _get_journey_identity_content(self, journey: str) -> str | None:
        ident = self._get_journey_identity(journey)
        return ident.content if ident else None
