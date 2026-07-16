"""ConversationService: conversation lifecycle and automatic extraction."""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING

from memory.config import (
    EXTRACTION_MAX_ATTEMPTS,
    LOG_LLM_CALLS,
    SUMMARIZE_ENABLED,
    TWO_PASS_ENABLED,
)
from memory.intelligence.embeddings import embedding_to_bytes, generate_embedding
from memory.intelligence.extraction import (
    curate_against_existing,
    extract_memories,
    extract_tasks,
    generate_conversation_summary,
    generate_conversation_tags,
    generate_conversation_title,
)
from memory.intelligence.llm_router import LLMResponse
from memory.models import Conversation, ConversationSummary, Memory, Message
from memory.services.memory import memory_embed_text
from memory.services.metadata_lifecycle import (
    dry_run_metadata_lifecycle as dry_run_metadata_lifecycle_policy,
)
from memory.services.metadata_lifecycle import (
    messages_are_titleable,
    metadata_execution_profile,
    metadata_profile_action,
)
from memory.storage.store import Store

if TYPE_CHECKING:
    from memory.services.memory import MemoryService
    from memory.services.tasks import TaskService


def _naive_summary(messages: list[Message]) -> str:
    """Fallback summary: first 2000 chars of joined message content."""
    parts = [msg.content[:500] for msg in messages if msg.role in ("user", "assistant")]
    return " ".join(parts)[:2000]


class ConversationService:
    def __init__(
        self,
        store: Store,
        memories: MemoryService,
        tasks: TaskService | None = None,
    ) -> None:
        self.store = store
        self.memories = memories
        if tasks is None:
            raise TypeError("ConversationService requires tasks")
        self.tasks: TaskService = tasks

    def start_conversation(
        self,
        interface: str,
        persona: str | None = None,
        journey: str | None = None,
        title: str | None = None,
    ) -> Conversation:
        """Start a new conversation."""
        conv = Conversation(
            interface=interface,
            persona=persona,
            journey=journey,
            title=title,
        )
        return self.store.create_conversation(conv)

    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        token_count: int | None = None,
    ) -> Message:
        """Add a message to an existing conversation."""
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            token_count=token_count,
        )
        return self.store.add_message(msg)

    def find_by_id_prefix(self, prefix: str) -> Conversation | None:
        """Return the latest conversation whose id starts with prefix."""
        return self.store.find_conversation_by_id_prefix(prefix)

    def suggest_title(self, conversation_id: str) -> str:
        """Suggest a title for one conversation without saving it."""
        conversation = self._get_conversation_for_title_operation(conversation_id)
        messages = self.store.get_messages(conversation.id)
        if not messages:
            raise ValueError("Conversation has no messages to title")

        suggestion = generate_conversation_title(
            messages,
            on_llm_call=self._make_logger("conversation_title", conversation.id),
        )
        if not suggestion:
            raise ValueError("No title suggestion was generated")
        return self._clean_title(suggestion)

    def suggest_summary(self, conversation_id: str) -> str:
        """Suggest a conversation summary without saving it."""
        conversation = self._get_conversation_for_title_operation(conversation_id)
        messages = self.store.get_messages(conversation.id)
        if not messages:
            raise ValueError("Conversation has no messages to summarize")
        suggestion = generate_conversation_summary(
            messages,
            on_llm_call=self._make_logger("conversation_summary", conversation.id),
        )
        clean_summary = self._clean_summary(suggestion)
        if not clean_summary:
            raise ValueError("No summary suggestion was generated")
        return clean_summary

    def dry_run_metadata_lifecycle(self, conversation_id: str) -> dict:
        """Report conversation metadata lifecycle decisions without saving changes."""
        conversation = self._get_conversation_for_title_operation(conversation_id)
        messages = self.store.get_messages(conversation.id)
        metadata = self._metadata_dict(conversation)
        return dry_run_metadata_lifecycle_policy(
            conversation,
            messages,
            metadata,
            title_needs_improvement=self.title_needs_improvement,
        )

    def dry_run_metadata_lifecycle_at_message(self, message_id: str) -> dict:
        """Debug-preview lifecycle decisions using transcript messages up to one message."""
        if not isinstance(message_id, str) or not message_id.strip():
            raise ValueError("messageId is required")
        row = self.store.conn.execute(
            "SELECT * FROM messages WHERE id = ? OR id LIKE ? ORDER BY created_at DESC LIMIT 1",
            (message_id, f"{message_id}%"),
        ).fetchone()
        if row is None:
            raise ValueError(f"Message '{message_id}' not found")
        boundary_message = Message(**dict(row))
        conversation = self._get_conversation_for_title_operation(boundary_message.conversation_id)
        all_messages = self.store.get_messages(conversation.id)
        selected_messages: list[Message] = []
        found_boundary = False
        for message in all_messages:
            selected_messages.append(message)
            if message.id == boundary_message.id:
                found_boundary = True
                break
        if not found_boundary:
            raise ValueError(f"Message '{message_id}' not found in conversation")
        metadata = self._metadata_dict(conversation)
        dry_run = dry_run_metadata_lifecycle_policy(
            conversation,
            selected_messages,
            metadata,
            title_needs_improvement=self.title_needs_improvement,
        )
        return {
            "conversation_id": conversation.id,
            "message_id": boundary_message.id,
            "mode": "debug_preview_at_message",
            "mutated": False,
            "included_message_count": len(selected_messages),
            "excluded_message_count": max(0, len(all_messages) - len(selected_messages)),
            "dry_run": dry_run,
        }

    def apply_metadata_backfill(
        self,
        *,
        mode: str = "safe",
        limit: int = 20,
        journey: str | None = None,
    ) -> dict:
        """Apply historical metadata backfill to a bounded candidate set."""
        preview = self.preview_metadata_backfill(mode=mode, limit=limit, journey=journey)
        profile_name = preview["profile"]
        results: list[dict] = []
        for candidate in preview["candidates"]:
            result = self.apply_generated_metadata_lifecycle(
                candidate["conversation_id"],
                source="metadata_backfill_apply",
                profile_name=profile_name,
            )
            results.append(result)
        return {
            "mode": "metadata_backfill_apply",
            "backfill_mode": mode,
            "profile": profile_name,
            "mutated": any(result["mutated"] for result in results),
            "limit": limit,
            "journey": journey,
            "candidate_count": preview["candidate_count"],
            "changed_count": sum(1 for result in results if result["mutated"]),
            "results": results,
        }

    def preview_metadata_backfill(
        self,
        *,
        mode: str = "safe",
        limit: int = 20,
        journey: str | None = None,
    ) -> dict:
        """Preview historical metadata backfill candidates without mutation."""
        profile_name = "backfill_force" if mode == "force" else "backfill_safe"
        profile = metadata_execution_profile(profile_name)
        summaries = self.list_recent(limit=limit, journey=journey)
        candidates: list[dict] = []
        for summary in summaries:
            report = self.dry_run_metadata_lifecycle(summary.id)
            actions = {
                field: metadata_profile_action(profile, field, field_report)
                for field, field_report in report["fields"].items()
            }
            if mode == "force" or any(
                action in {"apply", "regenerate"} for action in actions.values()
            ):
                candidates.append(
                    {
                        "conversation_id": report["conversation_id"],
                        "title": summary.title,
                        "message_count": summary.message_count,
                        "actions": actions,
                        "fields": report["fields"],
                    }
                )
        return {
            "mode": "metadata_backfill_preview",
            "backfill_mode": mode,
            "profile": profile.name,
            "mutated": False,
            "limit": limit,
            "journey": journey,
            "candidate_count": len(candidates),
            "candidates": candidates,
        }

    def apply_generated_metadata_lifecycle(
        self,
        conversation_id: str,
        *,
        source: str = "metadata_lifecycle_apply",
        profile_name: str = "manual_safe",
    ) -> dict:
        """Generate and apply the safe updates currently exposed by the lifecycle report."""
        conversation = self._get_conversation_for_title_operation(conversation_id)
        dry_run = self.dry_run_metadata_lifecycle(conversation.id)
        fields = dry_run["fields"]
        profile = metadata_execution_profile(profile_name)
        actions = {
            field: metadata_profile_action(profile, field, field_report)
            for field, field_report in fields.items()
        }
        generated_title: str | None = None
        generated_summary: str | None = None
        generated_tags: list[str] | None = None

        if actions["title"] in {"apply", "regenerate"}:
            try:
                generated_title = self.suggest_title(conversation.id)
            except ValueError:
                generated_title = None

        if actions["summary"] in {"apply", "regenerate"}:
            try:
                generated_summary = self.suggest_summary(conversation.id)
            except ValueError:
                generated_summary = None

        if actions["tags"] in {"apply", "regenerate"}:
            tag_source_summary = generated_summary
            if tag_source_summary is None and fields["summary"]["decision"] == "refine_candidate":
                try:
                    tag_source_summary = self.suggest_summary(conversation.id)
                except ValueError:
                    tag_source_summary = None
            generated_tags = self._suggest_tags(conversation.id, tag_source_summary)

        if profile.force_regenerate:
            report = self._apply_force_generated_metadata_lifecycle(
                conversation,
                dry_run=dry_run,
                actions=actions,
                title=generated_title,
                summary=generated_summary,
                tags=generated_tags,
                source=source,
            )
            report["profile"] = profile.name
            report["actions"] = actions
            return report

        report = self.apply_metadata_lifecycle(
            conversation.id,
            title=generated_title,
            summary=generated_summary,
            tags=generated_tags or None,
            source=source,
        )
        report["profile"] = profile.name
        report["actions"] = actions
        return report

    def _apply_force_generated_metadata_lifecycle(
        self,
        conversation: Conversation,
        *,
        dry_run: dict,
        actions: dict[str, str],
        title: str | None,
        summary: str | None,
        tags: list[str] | None,
        source: str,
    ) -> dict:
        """Apply generated values for a force profile while preserving manual locks."""
        metadata = self._metadata_dict(conversation)
        updates: dict[str, object] = {}
        changed: dict[str, object] = {}
        skipped: dict[str, str] = {}

        if actions["title"] == "preserve_manual":
            skipped["title"] = "manual_lock_preserved"
        elif actions["title"] == "regenerate" and title:
            clean_title = self._clean_title(title)
            updates["title"] = clean_title
            metadata = self._title_metadata(
                conversation,
                source=source,
                status="generated",
                previous_title=conversation.title,
            )
            changed["title"] = clean_title
        elif actions["title"] == "regenerate":
            skipped["title"] = "generation_failed"
        else:
            skipped["title"] = actions["title"]

        if actions["summary"] == "regenerate" and metadata.get("summary_source") == "manual":
            skipped["summary"] = "manual_summary_preserved"
        elif actions["summary"] == "regenerate" and summary:
            clean_summary = self._clean_summary(summary)
            if clean_summary:
                updates["summary"] = clean_summary
                metadata["summary_status"] = "generated"
                metadata["summary_source"] = source
                changed["summary"] = clean_summary
            else:
                skipped["summary"] = "blank_value"
        elif actions["summary"] == "regenerate":
            skipped["summary"] = "generation_failed"
        else:
            skipped["summary"] = actions["summary"]

        if actions["tags"] == "regenerate" and metadata.get("tags_source") == "manual":
            skipped["tags"] = "manual_tags_preserved"
        elif actions["tags"] == "regenerate" and tags:
            updates["tags"] = json.dumps(tags, ensure_ascii=False)
            metadata["tags_status"] = "generated"
            metadata["tags_source"] = source
            changed["tags"] = tags
        elif actions["tags"] == "regenerate":
            skipped["tags"] = "generation_failed"
        else:
            skipped["tags"] = actions["tags"]

        if changed:
            metadata["metadata_lifecycle_version"] = 1
            metadata["last_metadata_update_source"] = source
            updates["metadata"] = json.dumps(metadata, ensure_ascii=False)
            self.store.update_conversation(conversation.id, **updates)

        return {
            "conversation_id": conversation.id,
            "mode": "apply",
            "mutated": bool(changed),
            "changed": changed,
            "skipped": skipped,
            "dry_run": dry_run,
        }

    def apply_metadata_lifecycle(
        self,
        conversation_id: str,
        *,
        title: str | None = None,
        summary: str | None = None,
        tags: list[str] | str | None = None,
        source: str = "metadata_lifecycle_apply",
    ) -> dict:
        """Apply safe metadata lifecycle updates through an explicit bounded path."""
        conversation = self._get_conversation_for_title_operation(conversation_id)
        dry_run = self.dry_run_metadata_lifecycle(conversation.id)
        metadata = self._metadata_dict(conversation)
        updates: dict[str, str] = {}
        changed: dict[str, object] = {}
        skipped: dict[str, str] = {}

        title_decision = dry_run["fields"]["title"]["decision"]
        if title_decision == "preserve":
            skipped["title"] = "manual_lock_preserved"
        elif title_decision == "refine_candidate":
            skipped["title"] = "candidate_decision_requires_explicit_review"
        elif title_decision in {"create", "repair"} and title is not None:
            clean_title = self._clean_title(title)
            updates["title"] = clean_title
            metadata = self._title_metadata(
                conversation,
                source=source,
                status="generated",
                previous_title=conversation.title,
            )
            changed["title"] = clean_title
        elif title is not None:
            skipped["title"] = f"decision_{title_decision}_not_applied"
        else:
            skipped["title"] = "no_value_provided"

        summary_decision = dry_run["fields"]["summary"]["decision"]
        if summary_decision == "create" and summary is not None:
            clean_summary = summary.strip()
            if clean_summary:
                updates["summary"] = clean_summary[:1000]
                metadata["summary_status"] = "generated"
                changed["summary"] = updates["summary"]
            else:
                skipped["summary"] = "blank_value"
        elif summary is not None:
            skipped["summary"] = f"decision_{summary_decision}_not_applied"
        else:
            skipped["summary"] = "no_value_provided"

        tags_decision = dry_run["fields"]["tags"]["decision"]
        tags_ready_after_summary = tags_decision == "defer" and "summary" in changed
        if (tags_decision == "create" and tags is not None) or (
            tags_ready_after_summary and tags is not None
        ):
            encoded_tags = tags if isinstance(tags, str) else json.dumps(tags, ensure_ascii=False)
            updates["tags"] = encoded_tags
            metadata["tags_status"] = "generated"
            changed["tags"] = tags
        elif tags is not None:
            skipped["tags"] = f"decision_{tags_decision}_not_applied"
        else:
            skipped["tags"] = "no_value_provided"

        if changed:
            metadata["metadata_lifecycle_version"] = 1
            metadata["last_metadata_update_source"] = source
            updates["metadata"] = json.dumps(metadata, ensure_ascii=False)
            self.store.update_conversation(conversation.id, **updates)

        return {
            "conversation_id": conversation.id,
            "mode": "apply",
            "mutated": bool(changed),
            "changed": changed,
            "skipped": skipped,
            "dry_run": dry_run,
        }

    def delete_turn(self, conversation_id: str, user_message_id: str) -> list[str]:
        """Delete one user+assistant turn from a conversation."""
        conversation = self.store.get_conversation(conversation_id)
        if conversation is None:
            raise ValueError("conversation not found")
        messages = self.store.get_messages(conversation_id)
        for index, message in enumerate(messages):
            if message.id != user_message_id:
                continue
            if message.role != "user":
                raise ValueError("turn deletion must start from a user message")
            if index + 1 >= len(messages) or messages[index + 1].role != "assistant":
                raise ValueError("turn deletion requires a following assistant response")
            deleted_ids = [message.id, messages[index + 1].id]
            self.store.conn.executemany(
                "DELETE FROM messages WHERE id = ? AND conversation_id = ?",
                [(message_id, conversation_id) for message_id in deleted_ids],
            )
            self.store.conn.commit()
            return deleted_ids
        raise ValueError("user message not found in conversation")

    def delete_conversations(self, conversation_ids: list[str]) -> list[str]:
        """Delete selected conversations while preserving extracted memories."""
        if not isinstance(conversation_ids, list) or not conversation_ids:
            raise ValueError("conversation_ids must be a non-empty list")
        resolved_ids: list[str] = []
        for conversation_id in conversation_ids:
            if not isinstance(conversation_id, str) or not conversation_id.strip():
                raise ValueError("conversation_ids must contain conversation ids")
            conversation = self.store.get_conversation(conversation_id)
            if conversation is None:
                conversation = self.find_by_id_prefix(conversation_id)
            if conversation is None:
                raise ValueError(f"Conversation '{conversation_id}' not found")
            if conversation.id not in resolved_ids:
                resolved_ids.append(conversation.id)

        for conversation_id in resolved_ids:
            self.store.conn.execute(
                "DELETE FROM messages WHERE conversation_id = ?", (conversation_id,)
            )
            self.store.conn.execute(
                "DELETE FROM conversation_embeddings WHERE conversation_id = ?", (conversation_id,)
            )
            self.store.conn.execute(
                "UPDATE memories SET conversation_id = NULL WHERE conversation_id = ?",
                (conversation_id,),
            )
            self.store.conn.execute(
                "UPDATE llm_calls SET conversation_id = NULL WHERE conversation_id = ?",
                (conversation_id,),
            )
            self.store.conn.execute(
                "UPDATE runtime_sessions SET conversation_id = NULL WHERE conversation_id = ?",
                (conversation_id,),
            )
            self.store.conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        self.store.conn.commit()
        return resolved_ids

    def update_title(self, conversation_id: str, title: str) -> Conversation:
        """Update a conversation title through a bounded manual-edit path."""
        if not isinstance(title, str):
            raise ValueError("title must be a string")
        clean_title = self._clean_title(title)
        conversation = self._get_conversation_for_title_operation(conversation_id)
        metadata = self._title_metadata(
            conversation,
            source="manual",
            status="manual",
            previous_title=conversation.title,
        )
        self.store.update_conversation(
            conversation.id,
            title=clean_title,
            metadata=json.dumps(metadata, ensure_ascii=False),
        )
        updated = self.store.get_conversation(conversation.id)
        if updated is None:
            raise ValueError(f"Conversation '{conversation_id}' not found")
        return updated

    def update_tags(self, conversation_id: str, tags: list[str] | str) -> Conversation:
        """Update conversation tags through an explicit manual-edit path."""
        if isinstance(tags, str):
            parsed_tags = [tag.strip() for tag in tags.split(",") if tag.strip()]
        elif isinstance(tags, list):
            parsed_tags = [str(tag).strip() for tag in tags if str(tag).strip()]
        else:
            raise ValueError("tags must be a list or comma-separated string")
        parsed_tags = parsed_tags[:12]
        conversation = self._get_conversation_for_title_operation(conversation_id)
        metadata = self._metadata_dict(conversation)
        metadata["tags_status"] = "manual" if parsed_tags else "cleared"
        metadata["tags_source"] = "manual"
        metadata["metadata_lifecycle_version"] = 1
        self.store.update_conversation(
            conversation.id,
            tags=json.dumps(parsed_tags, ensure_ascii=False) if parsed_tags else None,
            metadata=json.dumps(metadata, ensure_ascii=False),
        )
        updated = self.store.get_conversation(conversation.id)
        if updated is None:
            raise ValueError(f"Conversation '{conversation_id}' not found")
        return updated

    def update_summary(self, conversation_id: str, summary: str) -> Conversation:
        """Update a conversation summary through an explicit manual-edit path."""
        if not isinstance(summary, str):
            raise ValueError("summary must be a string")
        clean_summary = self._clean_summary(summary)
        if not clean_summary:
            raise ValueError("summary is required")
        conversation = self._get_conversation_for_title_operation(conversation_id)
        metadata = self._metadata_dict(conversation)
        metadata["summary_status"] = "manual"
        metadata["summary_source"] = "manual"
        metadata["metadata_lifecycle_version"] = 1
        self.store.update_conversation(
            conversation.id,
            summary=clean_summary,
            metadata=json.dumps(metadata, ensure_ascii=False),
        )
        updated = self.store.get_conversation(conversation.id)
        if updated is None:
            raise ValueError(f"Conversation '{conversation_id}' not found")
        return updated

    def set_provisional_title(self, conversation_id: str, title: str) -> Conversation:
        """Set a first-message title that may later be improved automatically."""
        clean_title = self._clean_title(title)
        conversation = self._get_conversation_for_title_operation(conversation_id)
        metadata = self._title_metadata(
            conversation,
            source="first_user",
            status="provisional",
            previous_title=conversation.title,
        )
        self.store.update_conversation(
            conversation.id,
            title=clean_title,
            metadata=json.dumps(metadata, ensure_ascii=False),
        )
        updated = self.store.get_conversation(conversation.id)
        if updated is None:
            raise ValueError(f"Conversation '{conversation_id}' not found")
        return updated

    def _get_conversation_for_title_operation(self, conversation_id: str) -> Conversation:
        if not isinstance(conversation_id, str) or not conversation_id.strip():
            raise ValueError("conversationId is required")
        conversation = self.store.get_conversation(conversation_id)
        if conversation is None:
            conversation = self.store.find_conversation_by_id_prefix(conversation_id)
        if conversation is None:
            raise ValueError(f"Conversation '{conversation_id}' not found")
        return conversation

    def _clean_title(self, title: str) -> str:
        clean_title = " ".join(title.strip().split())
        if not clean_title:
            raise ValueError("title is required")
        if len(clean_title) > 160:
            raise ValueError("title must be at most 160 characters")
        return clean_title

    def _clean_summary(self, summary: str) -> str:
        clean_summary = "\n\n".join(
            " ".join(part.split()) for part in summary.strip().split("\n\n") if part.strip()
        )
        if len(clean_summary) > 1000:
            clean_summary = clean_summary[:1000].rstrip()
        return clean_summary

    def _suggest_tags(
        self, conversation_id: str, generated_summary: str | None = None
    ) -> list[str]:
        conversation = self._get_conversation_for_title_operation(conversation_id)
        messages = self.store.get_messages(conversation.id)
        tags = generate_conversation_tags(
            messages,
            on_llm_call=self._make_logger("conversation_tags", conversation.id),
        )
        return [tag for tag in tags if not self._looks_like_artifact(tag)]

    def _looks_like_artifact(self, term: str) -> bool:
        return bool(
            term.isdigit()
            or re.fullmatch(r"[0-9a-f]{7,}", term)
            or re.fullmatch(r"\d+px", term)
            or re.search(r"\d", term)
        )

    def list_recent(
        self,
        *,
        limit: int = 20,
        journey: str | None = None,
        persona: str | None = None,
    ) -> list[ConversationSummary]:
        """Return recent conversation summaries with optional filters."""
        return self.store.list_recent_conversation_summaries(
            limit=limit,
            journey=journey,
            persona=persona,
        )

    def end_conversation(
        self,
        conversation_id: str,
        extract: bool = True,
    ) -> list[Memory]:
        """End a conversation, extract memories/tasks, generate embeddings, and store them."""
        from memory.models import _now

        self.store.update_conversation(conversation_id, ended_at=_now())
        memories: list[Memory] = []
        try:
            if extract:
                memories = self._run_extraction(conversation_id)
        finally:
            # The orphan is closed regardless of extraction outcome (ended_at is
            # set above), and non-manual metadata is finalized even when
            # extraction fails — today's code skips finalize on failure.
            self.finalize_metadata_on_close(conversation_id)
        return memories

    def finalize_metadata_on_close(self, conversation_id: str) -> dict:
        """Finalize non-manual metadata from the full conversation at close time."""
        return self.apply_generated_metadata_lifecycle(
            conversation_id,
            source="close_time_metadata_finalization",
            profile_name="close_time",
        )

    def maybe_generate_title(
        self, conversation_id: str, *, source: str = "llm_auto"
    ) -> Conversation | None:
        """Generate and persist a better title when the current title is safe to replace."""
        conversation = self.store.get_conversation(conversation_id)
        if conversation is None or not self.title_needs_improvement(conversation):
            return conversation
        messages = self.store.get_messages(conversation.id)
        if not self._messages_are_titleable(messages):
            return conversation
        try:
            suggestion = generate_conversation_title(
                messages,
                on_llm_call=self._make_logger("conversation_title", conversation.id),
            )
            if not suggestion:
                return conversation
            clean_title = self._clean_title(suggestion)
            metadata = self._title_metadata(
                conversation,
                source=source,
                status="generated",
                previous_title=conversation.title,
            )
            self.store.update_conversation(
                conversation.id,
                title=clean_title,
                metadata=json.dumps(metadata, ensure_ascii=False),
            )
            return self.store.get_conversation(conversation.id)
        except Exception:
            return conversation

    def extract_conversation(self, conversation_id: str) -> list[Memory]:
        """Extract memories from an already-ended conversation."""
        return self._run_extraction(conversation_id)

    def _make_logger(self, role: str, conversation_id: str):
        if not LOG_LLM_CALLS:
            return None

        def _log(response: LLMResponse) -> None:
            self.store.log_llm_call(
                role=role,
                model=response.model,
                prompt=response.prompt or "",
                response_text=response.content,
                prompt_tokens=response.prompt_tokens,
                completion_tokens=response.completion_tokens,
                latency_ms=response.latency_ms,
                conversation_id=conversation_id,
            )

        return _log

    def _run_extraction(self, conversation_id: str) -> list[Memory]:
        """Run memory/task extraction, isolating and recording repeated failures.

        Marks metadata.extracted=True on success. On failure it records an
        extraction attempt (quarantining after EXTRACTION_MAX_ATTEMPTS) and
        re-raises, so the caller's per-conversation loop can isolate the failure
        instead of letting one poison-pill conversation crash the batch.
        """
        conv = self.store.get_conversation(conversation_id)
        messages = self.store.get_messages(conversation_id)

        # Extraction requires a journey and at least 4 messages.
        if not messages or not conv or not conv.journey or len(messages) < 4:
            return []

        try:
            return self._extract_and_persist(conv, messages, conversation_id)
        except Exception:
            self._record_failed_extraction_attempt(conversation_id)
            raise

    def _extract_and_persist(
        self, conv: Conversation, messages: list[Message], conversation_id: str
    ) -> list[Memory]:
        """Run the extraction pipeline and persist memories. Raises on LLM failure."""
        # Load the user's first name for the transcript when available.
        user_name = "User"
        try:
            import re

            user_identity = self.store.get_identity("user", "identity")
            if user_identity and user_identity.content:
                match = re.search(
                    r"(?:You are talking to|Você está falando com) ([A-Z][a-zA-Záéíóúãõ]+)",
                    user_identity.content,
                )
                if match:
                    user_name = match.group(1)
        except Exception:
            pass

        # Extract memories through the LLM (candidate pass).
        extracted = extract_memories(
            messages,
            persona=conv.persona if conv else None,
            journey=conv.journey if conv else None,
            user_name=user_name,
            on_llm_call=self._make_logger("extraction", conversation_id),
        )

        # Curation pass: deduplicate candidates against existing memories.
        if TWO_PASS_ENABLED and extracted:
            similar: list[Memory] = []
            seen_ids: set[str] = set()
            for candidate in extracted:
                query = f"{candidate.title} {candidate.content[:60]}"
                results = self.memories.search(query, limit=3, journey=conv.journey)
                for sr in results:
                    if sr.memory.id not in seen_ids:
                        similar.append(sr.memory)
                        seen_ids.add(sr.memory.id)
            similar = similar[:15]  # Cap context size.
            extracted = curate_against_existing(
                extracted,
                similar,
                on_llm_call=self._make_logger("curation", conversation_id),
            )

        # Extract tasks through the LLM.
        try:
            extracted_tasks = extract_tasks(
                messages,
                journey=conv.journey if conv else None,
                user_name=user_name,
                on_llm_call=self._make_logger("task_extraction", conversation_id),
            )
            for et in extracted_tasks:
                existing = self.tasks.find_tasks(et.title, et.journey)
                if not existing:
                    self.tasks.add_task(
                        title=et.title,
                        journey=et.journey,
                        due_date=et.due_date,
                        stage=et.stage,
                        context=et.context,
                        source="conversation",
                    )
        except Exception:
            pass  # Task extraction failure should not block memory extraction.

        # Generate a conversation summary for embedding and storage.
        if SUMMARIZE_ENABLED:
            summary_text = generate_conversation_summary(
                messages,
                user_name=user_name,
                on_llm_call=self._make_logger("summary", conversation_id),
            )
            if not summary_text:
                summary_text = _naive_summary(messages)
        else:
            summary_text = _naive_summary(messages)

        # Stage every network embedding first — the summary and each memory — so
        # a failure leaves nothing persisted. The S7 retry then starts clean and
        # does not duplicate rows or re-spend on embeddings (AI-03 / CV9.E2.S9).
        summary_bytes: bytes | None = None
        if summary_text:
            summary_bytes = embedding_to_bytes(generate_embedding(summary_text))

        staged_memories = [
            (ext, generate_embedding(memory_embed_text(ext.title, ext.content, ext.context)))
            for ext in extracted
        ]

        # All embeddings succeeded — only local writes remain.
        if summary_bytes is not None:
            self.store.store_conversation_embedding(conversation_id, summary_bytes)
            self.store.update_conversation(conversation_id, summary=summary_text[:1000])

        stored_memories = []
        for ext, emb in staged_memories:
            stored = self.memories.add_memory(
                title=ext.title,
                content=ext.content,
                memory_type=ext.memory_type,
                layer=ext.layer,
                context=ext.context,
                journey=ext.journey,
                persona=ext.persona,
                tags=ext.tags,
                conversation_id=conversation_id,
                embedding=emb,
            )
            stored_memories.append(stored)

        # Mark as extracted so extract_pending skips this conversation.
        meta = self._metadata_dict(conv)
        meta["extracted"] = True
        self.store.update_conversation(
            conversation_id, metadata=json.dumps(meta, ensure_ascii=False)
        )

        return stored_memories

    def _record_failed_extraction_attempt(self, conversation_id: str) -> int:
        """Increment the extraction attempt counter; quarantine after the max.

        The counter lives in the conversation metadata JSON (no schema change,
        like `extracted`). Once attempts reach EXTRACTION_MAX_ATTEMPTS the
        conversation is flagged `extraction_quarantined`, which drops it out of
        get_unextracted_conversations() so it stops being retried.
        """
        conv = self.store.get_conversation(conversation_id)
        if conv is None:
            return 0
        meta = self._metadata_dict(conv)
        attempts = int(meta.get("extraction_attempts", 0)) + 1
        meta["extraction_attempts"] = attempts
        if attempts >= EXTRACTION_MAX_ATTEMPTS:
            meta["extraction_quarantined"] = True
        self.store.update_conversation(
            conversation_id, metadata=json.dumps(meta, ensure_ascii=False)
        )
        return attempts

    def title_needs_improvement(self, conversation: Conversation) -> bool:
        """Return True when the title is missing or known to be low quality."""
        metadata = self._metadata_dict(conversation)
        if metadata.get("title_status") == "manual" or metadata.get("title_source") == "manual":
            return False
        title = (conversation.title or "").strip()
        if not title:
            return True
        if metadata.get("title_status") == "provisional":
            return True
        if title.endswith("...") or "..." in title:
            return True
        if len(title) >= 55:
            return True
        if title.lower().startswith("<skill"):
            return True
        return False

    def _messages_are_titleable(self, messages: list[Message]) -> bool:
        return messages_are_titleable(messages)

    def _metadata_dict(self, conversation: Conversation) -> dict:
        try:
            value = json.loads(conversation.metadata or "{}")
        except json.JSONDecodeError:
            return {}
        return value if isinstance(value, dict) else {}

    def _title_metadata(
        self,
        conversation: Conversation,
        *,
        source: str,
        status: str,
        previous_title: str | None,
    ) -> dict:
        metadata = self._metadata_dict(conversation)
        if previous_title and previous_title != metadata.get("previous_title"):
            metadata["previous_title"] = previous_title
        metadata["title_source"] = source
        metadata["title_status"] = status
        return metadata
