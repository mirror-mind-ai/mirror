"""Conversation metadata lifecycle decision policy.

This module owns pure lifecycle decisions for conversation metadata. It does not
read from or write to storage; callers provide the conversation, messages, and
metadata context and decide what to do with the report.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from memory.models import Conversation, Message


TitleNeedsImprovement = Callable[[Conversation], bool]


@dataclass(frozen=True)
class MetadataExecutionProfile:
    """Execution posture for applying metadata lifecycle decisions."""

    name: str
    title_apply_decisions: frozenset[str]
    summary_apply_decisions: frozenset[str]
    tags_apply_decisions: frozenset[str]
    force_regenerate: bool = False
    preserve_manual: bool = True


METADATA_EXECUTION_PROFILES: dict[str, MetadataExecutionProfile] = {
    "manual_safe": MetadataExecutionProfile(
        name="manual_safe",
        title_apply_decisions=frozenset({"create", "repair"}),
        summary_apply_decisions=frozenset({"create"}),
        tags_apply_decisions=frozenset({"create"}),
    ),
    "backfill_safe": MetadataExecutionProfile(
        name="backfill_safe",
        title_apply_decisions=frozenset({"create", "repair"}),
        summary_apply_decisions=frozenset({"create"}),
        tags_apply_decisions=frozenset({"create"}),
    ),
    "backfill_force": MetadataExecutionProfile(
        name="backfill_force",
        title_apply_decisions=frozenset({"create", "repair", "keep", "refine_candidate"}),
        summary_apply_decisions=frozenset({"create", "keep", "refine_candidate"}),
        tags_apply_decisions=frozenset({"create", "keep"}),
        force_regenerate=True,
    ),
    "close_time": MetadataExecutionProfile(
        name="close_time",
        title_apply_decisions=frozenset({"create", "repair", "keep", "refine_candidate"}),
        summary_apply_decisions=frozenset({"create", "keep", "refine_candidate"}),
        tags_apply_decisions=frozenset({"create", "keep"}),
        force_regenerate=True,
    ),
    "active_runtime": MetadataExecutionProfile(
        name="active_runtime",
        title_apply_decisions=frozenset({"create"}),
        summary_apply_decisions=frozenset(),
        tags_apply_decisions=frozenset(),
    ),
}


def metadata_execution_profile(name: str) -> MetadataExecutionProfile:
    """Return a named metadata execution profile."""
    try:
        return METADATA_EXECUTION_PROFILES[name]
    except KeyError as exc:
        raise ValueError(f"Unknown metadata execution profile: {name}") from exc


def metadata_profile_action(profile: MetadataExecutionProfile, field: str, report: dict) -> str:
    """Return the profile action for one field report."""
    decision = report.get("decision")
    if field == "title" and report.get("lock_state") == "manual_locked" and profile.preserve_manual:
        return "preserve_manual"
    if decision == "defer":
        return "defer"
    if decision == "preserve":
        return "preserve_manual"
    if field == "title" and decision in profile.title_apply_decisions:
        return "regenerate" if profile.force_regenerate else "apply"
    if field == "summary" and decision in profile.summary_apply_decisions:
        return "regenerate" if profile.force_regenerate else "apply"
    if field == "tags" and decision in profile.tags_apply_decisions:
        return "regenerate" if profile.force_regenerate else "apply"
    if decision == "refine_candidate":
        return "review"
    return "skip"


def dry_run_metadata_lifecycle(
    conversation: Conversation,
    messages: list[Message],
    metadata: dict,
    *,
    title_needs_improvement: TitleNeedsImprovement,
) -> dict:
    """Return metadata lifecycle decisions without mutating conversation state."""
    title_report = dry_run_title_lifecycle(
        conversation,
        messages,
        metadata,
        title_needs_improvement=title_needs_improvement,
    )
    summary_report = dry_run_summary_lifecycle(conversation, messages)
    tags_report = dry_run_tags_lifecycle(conversation, messages, summary_report)
    return {
        "conversation_id": conversation.id,
        "mode": "dry_run",
        "mutated": False,
        "metadata_lifecycle_version": 1,
        "fields": {
            "title": title_report,
            "summary": summary_report,
            "tags": tags_report,
        },
    }


def dry_run_title_lifecycle(
    conversation: Conversation,
    messages: list[Message],
    metadata: dict,
    *,
    title_needs_improvement: TitleNeedsImprovement,
) -> dict:
    """Return title lifecycle decision for a conversation."""
    title = (conversation.title or "").strip()
    lock_state = "manual_locked" if title_is_manual(metadata) else "unlocked"
    if lock_state == "manual_locked":
        return {
            "decision": "preserve",
            "reason": "manual title lock is preserved",
            "current_value": title or None,
            "readiness": "locked",
            "provenance": metadata.get("title_source") or "manual",
            "lock_state": lock_state,
        }
    if not messages_are_titleable(messages):
        return {
            "decision": "defer",
            "reason": "conversation needs at least one user and one assistant message",
            "current_value": title or None,
            "readiness": "not_ready",
            "provenance": metadata.get("title_source"),
            "lock_state": lock_state,
        }
    confidence = None
    if not title:
        decision = "create"
        reason = "conversation has no title"
    elif title_needs_improvement(conversation):
        decision = "repair"
        reason = "current title is provisional or weak"
    else:
        refinement_evidence = title_refinement_evidence(conversation)
        if refinement_evidence:
            return {
                "decision": "refine_candidate",
                "reason": "later evidence is more specific than the current unlocked title",
                "current_value": title or None,
                "readiness": "ready",
                "provenance": metadata.get("title_source"),
                "lock_state": lock_state,
                "confidence": refinement_evidence["confidence"],
                "evidence": refinement_evidence,
            }
        if title_may_need_coherence_refinement(conversation, messages, metadata):
            decision = "refine_candidate"
            reason = "conversation has enough later context for coherence refinement"
            confidence = "low"
        else:
            decision = "keep"
            reason = "current title appears usable"
            confidence = None
    report = {
        "decision": decision,
        "reason": reason,
        "current_value": title or None,
        "readiness": "ready",
        "provenance": metadata.get("title_source"),
        "lock_state": lock_state,
    }
    if confidence:
        report["confidence"] = confidence
    return report


def dry_run_summary_lifecycle(conversation: Conversation, messages: list[Message]) -> dict:
    """Return summary lifecycle decision for a conversation."""
    summary = (conversation.summary or "").strip()
    if summary:
        quality_issues = summary_quality_issues(summary)
        if quality_issues:
            return {
                "decision": "refine_candidate",
                "reason": "stored summary needs editorial refinement",
                "current_value": conversation.summary,
                "readiness": "ready",
                "provenance": "stored",
                "evidence": {"quality_issues": quality_issues},
            }
        return {
            "decision": "keep",
            "reason": "summary already exists",
            "current_value": conversation.summary,
            "readiness": "ready",
            "provenance": "stored",
        }
    substantive_messages = [
        msg for msg in messages if msg.role in ("user", "assistant") and msg.content.strip()
    ]
    if len(substantive_messages) >= 4:
        return {
            "decision": "create",
            "reason": "conversation has enough substance for a summary",
            "current_value": None,
            "readiness": "ready",
            "provenance": None,
        }
    return {
        "decision": "defer",
        "reason": "summary needs more conversation substance",
        "current_value": None,
        "readiness": "not_ready",
        "provenance": None,
    }


def summary_quality_issues(summary: str) -> list[str]:
    """Return user-facing quality issues for stored conversation summaries."""
    issues: list[str] = []
    if len(summary) > 900:
        issues.append("too_long")
    if re.search(r"(^|\n)\s*(?:[-*]|\d+[.)])\s+", summary):
        issues.append("contains_bullets")
    if re.search(r"\*\*|__|`", summary):
        issues.append("contains_markdown")
    if re.search(r"(?:/Users/|~/|[A-Za-z]:\\|/[\w .~:-]+/[\w .~:-]+)", summary):
        issues.append("contains_paths")
    if re.search(r"\b(user|assistant|mirror|você|eu):", summary, flags=re.IGNORECASE):
        issues.append("looks_like_transcript")
    return issues


def dry_run_tags_lifecycle(
    conversation: Conversation, messages: list[Message], summary_report: dict
) -> dict:
    """Return tags lifecycle decision for a conversation."""
    current_tags = conversation.tags
    if current_tags and current_tags.strip() not in {"[]", "null"}:
        return {
            "decision": "keep",
            "reason": "tags already exist",
            "current_value": current_tags,
            "readiness": "ready",
            "provenance": "stored",
        }
    substantive_messages = [
        msg for msg in messages if msg.role in ("user", "assistant") and msg.content.strip()
    ]
    if len(substantive_messages) >= 4 or (conversation.summary or "").strip():
        return {
            "decision": "create",
            "reason": "conversation has enough substance for tags",
            "current_value": None,
            "readiness": "ready",
            "provenance": None,
        }
    return {
        "decision": "defer",
        "reason": "tags need more conversation substance",
        "current_value": None,
        "readiness": "not_ready",
        "provenance": None,
    }


def messages_are_titleable(messages: list[Message]) -> bool:
    """Return True when messages contain enough exchange context for title work."""
    has_user = any(msg.role == "user" and msg.content.strip() for msg in messages)
    has_assistant = any(msg.role == "assistant" and msg.content.strip() for msg in messages)
    return has_user and has_assistant


def title_is_manual(metadata: dict) -> bool:
    """Return True when title metadata records a manual lock/source."""
    return metadata.get("title_status") == "manual" or metadata.get("title_source") == "manual"


def title_may_need_coherence_refinement(
    conversation: Conversation, messages: list[Message], metadata: dict
) -> bool:
    """Return True for generated titles with enough later context to revisit."""
    if metadata.get("title_status") != "generated":
        return False
    return len([msg for msg in messages if msg.role in ("user", "assistant")]) >= 6


def title_refinement_evidence(conversation: Conversation) -> dict | None:
    """Return evidence when summary carries substantially more specificity."""
    title_terms = meaningful_terms(conversation.title or "")
    summary_terms = meaningful_terms(conversation.summary or "")
    if len(title_terms) < 2 or len(summary_terms) < 8:
        return None
    additional_terms = sorted(summary_terms - title_terms)
    if len(additional_terms) < 6:
        return None
    overlap = sorted(title_terms & summary_terms)
    confidence = "medium" if len(additional_terms) >= 10 else "low"
    return {
        "confidence": confidence,
        "title_terms": sorted(title_terms),
        "summary_specific_terms": additional_terms[:12],
        "overlap_terms": overlap[:8],
    }


def meaningful_terms(text: str) -> set[str]:
    """Return coarse meaningful terms for structural title-vs-summary comparison."""
    stop_words = {
        "about",
        "after",
        "also",
        "antes",
        "com",
        "como",
        "das",
        "dos",
        "for",
        "from",
        "into",
        "mais",
        "não",
        "para",
        "pela",
        "pelo",
        "por",
        "que",
        "the",
        "uma",
        "vamos",
        "with",
        "work",
        "working",
    }
    terms = {
        token.lower()
        for token in re.findall(r"[\wÀ-ÿ]{4,}", text, flags=re.UNICODE)
    }
    return {term for term in terms if term not in stop_words}
