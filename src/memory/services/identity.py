"""IdentityService: identity prompts and mirror context management."""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, overload

from memory.models import VALID_IDENTITY_UPDATE_LAYERS, Identity
from memory.storage.store import Store

if TYPE_CHECKING:
    from memory.services.attachment import AttachmentService


def _normalize_routing_text(text: str) -> str:
    lowered = text.lower().replace("-", " ").replace("_", " ")
    normalized = re.sub(r"[^a-z0-9\s]+", " ", lowered)
    return re.sub(r"\s+", " ", normalized).strip()


class IdentityService:
    def __init__(
        self,
        store: Store,
        attachments: AttachmentService | None = None,
    ) -> None:
        self.store = store
        if attachments is None:
            raise TypeError("IdentityService requires attachments")
        self.attachments: AttachmentService = attachments

    def set_identity(
        self,
        layer: str,
        key: str,
        content: str,
        version: str = "1.0.0",
        metadata: str | None = None,
    ) -> Identity:
        """Create or update an identity prompt."""
        if metadata is None:
            existing = self.store.get_identity(layer, key)
            metadata = existing.metadata if existing else None

        identity = Identity(
            layer=layer,
            key=key,
            content=content,
            version=version,
            metadata=metadata,
        )
        return self.store.upsert_identity(identity)

    def apply_consolidation_identity_update(
        self,
        *,
        target_layer: str,
        target_key: str,
        content: str,
    ) -> Identity:
        """Apply a consolidation-proposed identity_update, gated by layer (AI-23).

        Unlike set_identity (general-purpose, unconditional write used for
        seeding, Soul Mode integration, etc.), this is narrowly for the
        propose_consolidation() -> mm-consolidate accept flow: target_layer is
        model-chosen and untrusted, so it is checked against
        VALID_IDENTITY_UPDATE_LAYERS before anything is written. A rejected
        layer raises -- it never silently no-ops or redirects, and it never
        writes a partial row.

        Preserves the accept flow's existing append semantics for an allowed
        write: new content is appended after a blank line, never replaces
        existing content outright.
        """
        if target_layer not in VALID_IDENTITY_UPDATE_LAYERS:
            raise ValueError(
                f"Refusing identity_update to layer {target_layer!r}: not in "
                f"the consolidation allowlist {sorted(VALID_IDENTITY_UPDATE_LAYERS)}."
            )
        existing = self.store.get_identity(target_layer, target_key)
        updated_content = f"{existing.content.rstrip()}\n\n{content}" if existing else content
        identity = Identity(layer=target_layer, key=target_key, content=updated_content)
        return self.store.upsert_identity(identity)

    @overload
    def get_identity(self, layer: str, key: str) -> str | None: ...

    @overload
    def get_identity(self, layer: str, key: None = None) -> list[Identity]: ...

    @overload
    def get_identity(self, layer: None = None, key: None = None) -> list[Identity]: ...

    def get_identity(
        self,
        layer: str | None = None,
        key: str | None = None,
    ) -> str | list[Identity] | None:
        """Retrieve identity content or identity rows."""
        if layer and key:
            ident = self.store.get_identity(layer, key)
            return ident.content if ident else None
        if layer:
            return self.store.get_identity_by_layer(layer)
        return self.store.get_all_identity()

    def detect_persona(
        self,
        query: str,
        threshold: float = 1.0,
    ) -> list[tuple[str, float, str]]:
        """Detect likely personas from DB-backed routing metadata."""
        normalized_query = _normalize_routing_text(query)
        if not normalized_query:
            return []

        query_tokens = set(normalized_query.split())
        matches: list[tuple[str, float, str]] = []

        for ident in self.store.get_identity_by_layer("persona"):
            if not ident.metadata:
                continue
            try:
                metadata = json.loads(ident.metadata)
            except (json.JSONDecodeError, TypeError):
                continue

            keywords = metadata.get("routing_keywords") or []
            if not isinstance(keywords, list):
                continue

            hit_count = 0
            for keyword in keywords:
                if not isinstance(keyword, str):
                    continue
                normalized_keyword = _normalize_routing_text(keyword)
                if not normalized_keyword:
                    continue
                if " " in normalized_keyword:
                    if normalized_keyword in normalized_query:
                        hit_count += 1
                elif normalized_keyword in query_tokens:
                    hit_count += 1

            if hit_count >= threshold:
                matches.append((ident.key, float(hit_count), "keyword"))

        matches.sort(key=lambda item: (-item[1], item[0]))
        return matches

    def load_mirror_context(
        self,
        persona: str | None = None,
        journey: str | None = None,
        org: bool = False,
        query: str | None = None,
        touches_identity: bool = True,
        touches_shadow: bool = False,
    ) -> str:
        """Load formatted identity context for prompt injection.

        Returns text with === layer/key === sections.

        Args:
            touches_identity: When False, the deep identity layers (self/soul and
                ego/identity) are omitted. Set by the reception classifier for
                operational/technical turns that do not require full self context.
                Defaults to True to preserve behaviour for callers that do not
                use reception.
            touches_shadow: When True AND the structural shadow layer has content,
                include shadow/profile with provenance framing. Conservative by
                default (False) — shadow surfaces only when reception confirms it.
        """
        constraints = self.get_identity("ego", "constraints")

        sections = [
            ("ego/behavior", self.get_identity("ego", "behavior")),
            ("user/identity", self.get_identity("user", "identity")),
        ]

        if touches_identity:
            sections = [
                ("self/soul", self.get_identity("self", "soul")),
                *sections,
                ("ego/identity", self.get_identity("ego", "identity")),
            ]

        if org:
            sections.append(
                ("organization/identity", self.get_identity("organization", "identity"))
            )
            sections.append(
                ("organization/principles", self.get_identity("organization", "principles"))
            )

        if persona:
            content = self.get_identity("persona", persona)
            if content:
                sections.append((f"persona/{persona}", content))

        # Load relevant reusable knowledge entries.
        knowledge_entries = self.store.get_identity_by_layer("knowledge")
        for entry in knowledge_entries:
            sections.append((f"knowledge/{entry.key}", entry.content))

        if journey:
            content = self.get_identity("journey", journey)
            if content:
                sections.append((f"journey/{journey}", content))

        # Shadow layer — asymmetric activation.
        # Surfaces only when reception confirms the turn touches shadow material
        # AND the structural shadow layer has confirmed content.
        # Format includes provenance framing, not bare claims.
        if touches_shadow:
            shadow_entries = self.store.get_identity_by_layer("shadow")
            if shadow_entries:
                shadow_parts = [
                    "[Confirmed shadow patterns — grounded in evidence across multiple conversations]"
                ]
                for entry in shadow_entries:
                    shadow_parts.append(entry.content)
                sections.append(("shadow/profile", "\n\n".join(shadow_parts)))

        parts = []
        if constraints:
            parts.append(f"=== ⛔ HARD CONSTRAINTS ===\n{constraints}")
        for label, content in sections:
            if content:
                parts.append(f"=== {label} ===\n{content}")

        # Relevant attachments.
        if query:
            if journey:
                results = self.attachments.search_attachments(journey, query, limit=5)
            else:
                results = self.attachments.search_all_attachments(query, limit=8)
            relevant = [(att, score) for att, score in results if score > 0.4]
            if relevant:
                att_parts = ["=== relevant attachments ==="]
                for att, score in relevant:
                    source = f" [{att.journey_id}]" if not journey else ""
                    att_parts.append(f"--- {att.name}{source} (score: {score:.3f}) ---")
                    if att.description:
                        att_parts.append(f"Description: {att.description}")
                    att_parts.append(att.content)
                parts.append("\n".join(att_parts))

        # Extension Mirror Mode hook.
        # After all core sections are assembled, ask the extension
        # subsystem whether any installed extension has a context
        # provider bound to the active persona or journey. Each matching
        # provider returns a string that is appended to the prompt under
        # its own '=== extension/<id>/<capability> ===' header. Failures
        # in extensions never propagate — the helper logs and skips.
        extension_text = self._collect_extension_context(
            persona_id=persona, journey_id=journey, query=query
        )
        if extension_text:
            parts.append(extension_text)

        return "\n\n".join(parts)

    def _collect_extension_context(
        self,
        *,
        persona_id: str | None,
        journey_id: str | None,
        query: str | None,
    ) -> str:
        """Resolve installed-extension context for the current Mirror Mode turn.

        Failures are isolated by the dispatcher itself; this wrapper
        additionally guards against the home not being resolvable (e.g.
        running under a test that did not configure MIRROR_HOME).
        """
        if persona_id is None and journey_id is None:
            return ""
        try:
            from memory.config import resolve_mirror_home
            from memory.extensions.context import (
                collect_extension_context,
                render_sections,
            )
        except Exception:
            return ""
        try:
            mirror_home = resolve_mirror_home()
        except Exception:
            return ""
        try:
            sections = collect_extension_context(
                self.store.conn,
                mirror_home=mirror_home,
                persona_id=persona_id,
                journey_id=journey_id,
                user=mirror_home.name,
                query=query,
            )
        except Exception:
            return ""
        return render_sections(sections)

    def load_full_identity(self) -> str:
        """Load all identity rows as formatted text for prompt injection."""
        all_ids = self.store.get_all_identity()
        if not all_ids:
            return ""

        sections = {}
        for ident in all_ids:
            label = f"{ident.layer}/{ident.key}"
            sections[label] = ident.content

        parts = []
        for label, content in sections.items():
            parts.append(f"--- {label} ---\n{content}")
        return "\n\n".join(parts)
