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


def _normalize_project_path(value: str) -> str:
    """Return a canonical absolute project path (expands ~, resolves symlinks)."""
    return str(Path(value).expanduser().resolve())


def _metadata_dict(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _slugify(value: str) -> str:
    normalized = strip_accents(value).lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    normalized = re.sub(r"-+", "-", normalized)
    return normalized[:80].strip("-")


def _validate_slug(slug: str) -> str:
    clean = slug.strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,78}[a-z0-9]", clean):
        raise ValueError(
            "slug must be kebab-case, 3-80 chars, using lowercase letters, numbers, and hyphens"
        )
    return clean


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

    def draft_journey(
        self,
        *,
        description: str,
        name: str | None = None,
        slug: str | None = None,
        status: str = "active",
        stage: str | None = None,
        current_focus: str | None = None,
    ) -> dict:
        """Draft a journey identity markdown from user-provided raw material."""
        if not isinstance(description, str) or len(description.strip()) < 20:
            raise ValueError("description must be at least 20 characters")
        clean_name = (name or "").strip() or self._infer_name(description)
        clean_slug = _validate_slug(slug) if slug else _validate_slug(_slugify(clean_name))
        clean_status = self._validate_status(status)
        clean_stage = (stage or "").strip() or "Starting"
        clean_focus = (current_focus or "").strip() or "Clarify the next concrete movement."
        clean_description = description.strip()
        content = self._journey_markdown(
            name=clean_name,
            status=clean_status,
            stage=clean_stage,
            description=clean_description,
            current_focus=clean_focus,
        )
        return {
            "name": clean_name,
            "slug": clean_slug,
            "status": clean_status,
            "stage": clean_stage,
            "description": clean_description,
            "currentFocus": clean_focus,
            "content": content,
        }

    def create_journey(
        self,
        *,
        slug: str,
        content: str,
        project_path: str | None = None,
        sync_file: str | None = None,
        icon: str | None = None,
        color: str | None = None,
        parent_journey: str | None = None,
    ) -> Identity:
        """Create a journey identity with optional display/runtime metadata."""
        clean_slug = _validate_slug(slug)
        if self._get_journey_identity(clean_slug):
            raise ValueError(f"Journey '{clean_slug}' already exists")
        if not isinstance(content, str) or len(content.strip()) < 80:
            raise ValueError("content must be at least 80 characters")
        if not content.lstrip().startswith("# "):
            raise ValueError("content must start with a markdown H1 title")
        if "**Status:**" not in content:
            raise ValueError("content must include **Status:**")
        if "## Description" not in content and "## Descrição" not in content:
            raise ValueError("content must include a Description section")

        metadata = self._metadata_from_fields(
            project_path=project_path,
            sync_file=sync_file,
            icon=icon,
            color=color,
            parent_journey=parent_journey,
            journey=clean_slug,
        )
        return self.identity.set_identity(
            JOURNEY_LAYER,
            clean_slug,
            content.strip(),
            metadata=json.dumps(metadata, ensure_ascii=False, sort_keys=True) if metadata else None,
        )

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
        return [journey for journey in self.list_journeys() if journey["status"] == "active"]

    def list_journeys(self) -> list[dict]:
        """Return compact journey DTOs for display surfaces."""
        journeys = self._get_journey_identities()
        result = []
        for journey in journeys:
            content = journey.content or ""
            first_line = content.split("\n")[0].strip().lstrip("# ").strip()
            status_match = re.search(r"\*\*Status:\*\*\s*(\w+)", content)
            status = status_match.group(1) if status_match else "unknown"
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
                    "status": status,
                    "metadata": _metadata_dict(journey.metadata),
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

    def list_journey_options(self) -> list[dict[str, str]]:
        """Return all journeys as option DTOs with hierarchy metadata."""
        options: list[dict[str, str]] = []
        for identity in self._get_journey_identities():
            content = identity.content or ""
            first_line = content.split("\n")[0].strip().lstrip("# ").strip()
            status_match = re.search(r"\*\*Status:\*\*\s*([^\n]+)", content)
            status = status_match.group(1).strip() if status_match else "unknown"
            metadata = _metadata_dict(identity.metadata)
            parent = metadata.get("parent_journey")
            options.append(
                {
                    "id": identity.key,
                    "name": first_line or identity.key,
                    "status": status,
                    "parent_journey": parent if isinstance(parent, str) else "",
                }
            )
        return self._sort_journey_options(options)

    def _sort_journey_options(self, options: list[dict[str, str]]) -> list[dict[str, str]]:
        by_id = {option["id"]: option for option in options}
        children: dict[str, list[dict[str, str]]] = {}
        roots: list[dict[str, str]] = []
        for option in options:
            parent = option.get("parent_journey") or ""
            if parent and parent in by_id:
                children.setdefault(parent, []).append(option)
            else:
                roots.append(option)

        def sort_key(item: dict[str, str]) -> tuple[bool, str]:
            return (item.get("status") != "active", item.get("name", "").lower())

        ordered: list[dict[str, str]] = []
        for root in sorted(roots, key=sort_key):
            ordered.append(root)
            ordered.extend(sorted(children.get(root["id"], []), key=sort_key))
        return ordered

    def get_project_path(self, journey: str) -> str | None:
        """Return the project path configured for a journey."""
        ident = self._get_journey_identity(journey)
        if not ident or not ident.metadata:
            return None
        try:
            meta = json.loads(ident.metadata)
            project_path = meta.get("project_path")
            if not isinstance(project_path, str):
                return None
            # Defensively expand legacy values stored before write-side
            # normalization (e.g. "~/project"). No-op for canonical paths.
            return str(Path(project_path).expanduser())
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
        resolved_path = _normalize_project_path(project_path)
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

    def update_identity_fields(
        self,
        journey: str,
        *,
        title: str | None = None,
        status: str | None = None,
    ) -> Identity:
        """Update safe display fields inside the journey identity markdown."""
        ident = self._get_journey_identity(journey)
        if not ident:
            raise ValueError(f"Journey '{journey}' not found.")
        content = ident.content or ""
        if title is not None:
            clean_title = title.strip()
            if not clean_title:
                raise ValueError("title is required")
            if len(clean_title) > 160:
                raise ValueError("title must be at most 160 characters")
            content = self._replace_title(content, clean_title)
        if status is not None:
            clean_status = self._validate_status(status)
            content = self._replace_status(content, clean_status)
        return self.identity.set_identity(
            JOURNEY_LAYER,
            journey,
            content,
            version=ident.version,
            metadata=ident.metadata,
        )

    def update_metadata_fields(self, journey: str, fields: dict[str, str]) -> dict:
        """Update selected safe metadata fields for a journey."""
        ident = self._get_journey_identity(journey)
        if not ident:
            raise ValueError(f"Journey '{journey}' not found.")
        allowed = {"project_path", "sync_file", "icon", "color", "parent_journey"}
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
            if key == "parent_journey":
                self._validate_parent_journey(journey, value or None)
            if key == "project_path" and value:
                value = _normalize_project_path(value)
            if value:
                meta[key] = value
            else:
                meta.pop(key, None)
        self.store.update_identity_metadata(ident.layer, journey, json.dumps(meta, sort_keys=True))
        return meta

    def _replace_title(self, content: str, title: str) -> str:
        lines = content.splitlines()
        for index, line in enumerate(lines):
            if line.startswith("# "):
                lines[index] = f"# {title}"
                return "\n".join(lines).strip()
        return f"# {title}\n\n{content.strip()}".strip()

    def _replace_status(self, content: str, status: str) -> str:
        lines = content.splitlines()
        for index, line in enumerate(lines):
            if line.startswith("**Status:**"):
                lines[index] = f"**Status:** {status}"
                return "\n".join(lines).strip()
        if lines and lines[0].startswith("# "):
            return "\n".join([lines[0], f"**Status:** {status}", *lines[1:]]).strip()
        return f"**Status:** {status}\n\n{content.strip()}".strip()

    def _validate_status(self, status: str) -> str:
        allowed = {"active", "completed", "paused", "planned"}
        clean = (status or "active").strip().lower()
        if clean not in allowed:
            raise ValueError(f"status must be one of: {', '.join(sorted(allowed))}")
        return clean

    def _infer_name(self, description: str) -> str:
        first_line = description.strip().splitlines()[0].strip()
        first_line = re.sub(
            r"^(jornada|journey|projeto|project)\s*[:\-]\s*", "", first_line, flags=re.I
        )
        words = first_line.split()
        return " ".join(words[:8]).strip(" .,:;!?()[]{}") or "New Journey"

    def _journey_markdown(
        self,
        *,
        name: str,
        status: str,
        stage: str,
        description: str,
        current_focus: str,
    ) -> str:
        return "\n".join(
            [
                f"# {name}",
                f"**Status:** {status}",
                f"**Stage:** {stage}",
                "",
                "## Description",
                "",
                description,
                "",
                "## Current focus",
                "",
                current_focus,
                "",
                "## Scope",
                "",
                "Use this journey for conversations, memories, tasks, and decisions that belong to this field of work.",
                "",
                "## Done condition",
                "",
                "Define this when the journey becomes clear enough to know what completion means.",
            ]
        )

    def _metadata_from_fields(
        self,
        *,
        project_path: str | None,
        sync_file: str | None,
        icon: str | None,
        color: str | None,
        parent_journey: str | None = None,
        journey: str | None = None,
    ) -> dict:
        fields = {
            "project_path": project_path or "",
            "sync_file": sync_file or "",
            "icon": icon or "",
            "color": color or "",
            "parent_journey": parent_journey or "",
        }
        metadata: dict[str, str] = {}
        for key, value in fields.items():
            clean = value.strip() if isinstance(value, str) else ""
            if len(clean) > 500:
                raise ValueError(f"{key} must be at most 500 characters")
            if key == "parent_journey" and clean:
                self._validate_parent_journey(journey, clean)
            if key == "project_path" and clean:
                clean = _normalize_project_path(clean)
            if clean:
                metadata[key] = clean
        return metadata

    def _validate_parent_journey(self, journey: str | None, parent_journey: str | None) -> None:
        if not parent_journey:
            return
        if journey and parent_journey == journey:
            raise ValueError("parent_journey cannot be the journey itself")
        parent = self._get_journey_identity(parent_journey)
        if not parent:
            raise ValueError(f"Parent journey '{parent_journey}' not found")
        parent_meta = _metadata_dict(parent.metadata)
        if parent_meta.get("parent_journey"):
            raise ValueError("Only one hierarchy level is supported")
        if journey and self._journey_has_children(journey):
            raise ValueError("Journeys with child journeys cannot also have a parent")

    def _journey_has_children(self, journey: str) -> bool:
        for identity in self._get_journey_identities():
            if identity.key == journey:
                continue
            metadata = _metadata_dict(identity.metadata)
            if metadata.get("parent_journey") == journey:
                return True
        return False

    def _get_journey_identities(self) -> list[Identity]:
        return self.store.get_identity_by_layer(JOURNEY_LAYER)

    def _get_journey_identity(self, journey: str) -> Identity | None:
        return self.store.get_identity(JOURNEY_LAYER, journey)

    def _get_journey_identity_content(self, journey: str) -> str | None:
        ident = self._get_journey_identity(journey)
        return ident.content if ident else None
