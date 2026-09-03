"""Generate the committed metadata-lifecycle golden fixture (CV22.DS7.US10 slice C').

This is the Python side of the close-time metadata parity contract. The engine
in `src/memory/services/metadata_lifecycle.py` is the largest unported piece of
the extraction lifecycle: it decides, per field, whether a title/summary/tags
value is created, repaired, kept, deferred, preserved, or flagged as a
refinement candidate — and, through the execution profiles, whether the close
tail then *applies* or *regenerates* that decision.

The plan grades the port by its decisions rather than by code reading, so this
generator drives the REAL engine over a branch-covering synthetic corpus and
records what the oracle returned.

The engine is pure: no storage, no clock, no LLM, no embeddings. Nothing needs
to be frozen and no database is opened. The corpus is fully synthetic (no
personal data) and the output is committed, so CI can verify parity with no
network and no real DB.

Scenarios exercise every branch of the three field policies:

  title   - manual lock via title_status and via title_source (preserve),
            untitleable transcript (defer), missing title (create), the four
            `title_needs_improvement` repair triggers (provisional, ellipsis,
            >=55 chars, `<skill` prefix), summary-specificity refinement
            evidence at both confidence levels, coherence refinement for a
            generated title with >=6 messages, and the plain keep.
  summary - each of the five `summary_quality_issues` refine triggers, the
            clean keep, the >=4-substantive-message create, and the defer.
  tags    - stored tags keep, the "[]"/"null" sentinels that read as absent,
            the create paths (message substance and summary presence), and
            the defer.

Every scenario is additionally evaluated through all five execution profiles,
so `metadata_profile_action` — the function the close tail actually consults —
is graded as a full matrix rather than only on the close_time path.

Run:  uv run python ts/parity/generate_metadata_lifecycle_golden.py
"""

from __future__ import annotations

import json
from pathlib import Path

from memory.models import Conversation, Message
from memory.services.metadata_lifecycle import (
    METADATA_EXECUTION_PROFILES,
    dry_run_metadata_lifecycle,
    metadata_execution_profile,
    metadata_profile_action,
)

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "metadata-lifecycle.golden.json"

CONVERSATION_ID = "conv-fixture"
PROFILE_NAMES = tuple(sorted(METADATA_EXECUTION_PROFILES))


def _title_needs_improvement(conversation: Conversation) -> bool:
    """Mirror of `ConversationService.title_needs_improvement`.

    Reproduced here rather than imported because the service method requires a
    Store; the engine only ever receives it as an injected predicate. Any drift
    between the two is caught by the oracle-drift tripwire on
    `services/conversation.py`.
    """
    try:
        metadata = json.loads(conversation.metadata or "{}")
    except json.JSONDecodeError:
        metadata = {}
    if not isinstance(metadata, dict):
        metadata = {}
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


def _messages(*roles_and_contents: tuple[str, str]) -> list[Message]:
    return [
        Message(
            id=f"msg-{index:03d}",
            conversation_id=CONVERSATION_ID,
            role=role,
            content=content,
            created_at=f"2026-09-03T12:00:{index:02d}.000000Z",
        )
        for index, (role, content) in enumerate(roles_and_contents)
    ]


EXCHANGE_2 = _messages(("user", "How does the port work?"), ("assistant", "Through a DB seam."))
EXCHANGE_4 = _messages(
    ("user", "How does the port work?"),
    ("assistant", "Through a database seam."),
    ("user", "And the oracle?"),
    ("assistant", "Python stays the oracle."),
)
EXCHANGE_3 = _messages(
    ("user", "How does the port work?"),
    ("assistant", "Through a database seam."),
    ("user", "And the oracle?"),
)
EXCHANGE_5 = _messages(
    ("user", "How does the port work?"),
    ("assistant", "Through a database seam."),
    ("user", "And the oracle?"),
    ("assistant", "Python stays the oracle."),
    ("user", "When does it flip?"),
)
EXCHANGE_6 = _messages(
    ("user", "How does the port work?"),
    ("assistant", "Through a database seam."),
    ("user", "And the oracle?"),
    ("assistant", "Python stays the oracle."),
    ("user", "When does it flip?"),
    ("assistant", "After parity is proven."),
)
USER_ONLY = _messages(("user", "Just me talking."))
BLANK_ASSISTANT = _messages(("user", "Hello there."), ("assistant", "   "))

SPECIFIC_SUMMARY = (
    "The conversation examined database seam strangler migration, oracle drift "
    "tripwires, replay transport fixtures, deterministic golden corpora, "
    "idempotency comparison semantics, quarantine counters and routing flips."
)

# Boundary fixtures for `title_refinement_evidence`. Distinct 4+ character
# tokens, none of them stop words, so the term arithmetic is exact and the
# thresholds (title_terms >= 2, summary_terms >= 8, additional >= 6, and the
# medium/low split at 10) are each pinned from both sides.
EVIDENCE_TITLE_2 = "Alpha Bravo"
EVIDENCE_TITLE_3 = "Alpha Bravo Charlie"
EXTRA_TERMS = (
    "delta",
    "echo",
    "golf",
    "hotel",
    "india",
    "juliet",
    "kilo",
    "lima",
    "mike",
    "oscar",
)


def _evidence_summary(title_words: str, extra_count: int) -> str:
    """Summary repeating the title terms plus `extra_count` distinct new terms."""
    return f"{title_words} {' '.join(EXTRA_TERMS[:extra_count])}."

# label -> (conversation kwargs, messages). Fully synthetic; no personal data.
SCENARIOS: tuple[tuple[str, dict, list[Message]], ...] = (
    (
        "title_manual_locked_by_status",
        {
            "title": "Manual title",
            "summary": "A stored summary.",
            "metadata": json.dumps({"title_status": "manual"}),
        },
        EXCHANGE_4,
    ),
    (
        "title_manual_locked_by_source",
        {
            "title": "Manual title",
            "summary": "A stored summary.",
            "metadata": json.dumps({"title_source": "manual"}),
        },
        EXCHANGE_4,
    ),
    ("title_defer_not_titleable_user_only", {"title": "Some title"}, USER_ONLY),
    ("title_defer_blank_assistant", {"title": "Some title"}, BLANK_ASSISTANT),
    ("title_create_missing", {"title": None}, EXCHANGE_4),
    ("title_create_whitespace_only", {"title": "   "}, EXCHANGE_4),
    (
        "title_repair_provisional",
        {"title": "First user line", "metadata": json.dumps({"title_status": "provisional"})},
        EXCHANGE_4,
    ),
    ("title_repair_ellipsis_suffix", {"title": "Truncated thought..."}, EXCHANGE_4),
    ("title_repair_ellipsis_inside", {"title": "Truncated ... thought"}, EXCHANGE_4),
    (
        "title_repair_too_long",
        {"title": "A title that is deliberately at least fifty-five characters long"},
        EXCHANGE_4,
    ),
    ("title_repair_skill_prefix", {"title": "<skill>mm-build</skill>"}, EXCHANGE_4),
    (
        "title_refine_evidence_medium_confidence",
        {"title": "Database seam", "summary": SPECIFIC_SUMMARY},
        EXCHANGE_4,
    ),
    (
        # Seven summary-specific terms: over the >=6 evidence floor, under the
        # >=10 medium-confidence threshold, so this is the `low` branch.
        "title_refine_evidence_low_confidence",
        {
            "title": "Database seam",
            "summary": (
                "The database seam included migration, replay fixtures, corpora, "
                "idempotency and counters."
            ),
        },
        EXCHANGE_4,
    ),
    (
        "title_refine_coherence_generated_six_messages",
        {"title": "Port status", "metadata": json.dumps({"title_status": "generated"})},
        EXCHANGE_6,
    ),
    (
        "title_keep_generated_under_six_messages",
        {"title": "Port status", "metadata": json.dumps({"title_status": "generated"})},
        EXCHANGE_4,
    ),
    ("title_keep_plain", {"title": "Port status"}, EXCHANGE_4),
    ("summary_refine_too_long", {"title": "Port status", "summary": "word " * 200}, EXCHANGE_4),
    (
        "summary_refine_bullets_dash",
        {"title": "Port status", "summary": "Intro line.\n- a bullet point here"},
        EXCHANGE_4,
    ),
    (
        "summary_refine_bullets_numbered",
        {"title": "Port status", "summary": "Intro line.\n1. a numbered point"},
        EXCHANGE_4,
    ),
    (
        "summary_refine_markdown",
        {"title": "Port status", "summary": "A summary with **bold** emphasis."},
        EXCHANGE_4,
    ),
    (
        "summary_refine_paths",
        {"title": "Port status", "summary": "Work happened in /Users/example/project today."},
        EXCHANGE_4,
    ),
    (
        "summary_refine_transcript_shape",
        {"title": "Port status", "summary": "user: asked a question. assistant: replied."},
        EXCHANGE_4,
    ),
    (
        "summary_keep_clean",
        {"title": "Port status", "summary": "A clean stored summary of the exchange."},
        EXCHANGE_4,
    ),
    ("summary_create_enough_substance", {"title": "Port status"}, EXCHANGE_4),
    ("summary_defer_thin_conversation", {"title": "Port status"}, EXCHANGE_2),
    (
        "tags_keep_stored",
        {"title": "Port status", "tags": json.dumps(["port", "parity"])},
        EXCHANGE_4,
    ),
    ("tags_absent_empty_array_sentinel", {"title": "Port status", "tags": "[]"}, EXCHANGE_4),
    ("tags_absent_null_sentinel", {"title": "Port status", "tags": "null"}, EXCHANGE_4),
    (
        "tags_create_from_summary_on_thin_conversation",
        {"title": "Port status", "summary": "A stored summary."},
        EXCHANGE_2,
    ),
    ("tags_defer_thin_conversation", {"title": "Port status"}, EXCHANGE_2),
    (
        "all_fields_defer_minimal",
        {"title": None},
        _messages(("user", "hi")),
    ),
    (
        # Pins the summary/tags substance threshold from below: three
        # substantive messages must still defer, four must create.
        "summary_tags_boundary_three_substantive",
        {"title": "Port status"},
        EXCHANGE_3,
    ),
    (
        # Pins the coherence-refinement message threshold from below.
        "title_coherence_boundary_five_messages",
        {"title": "Port status", "metadata": json.dumps({"title_status": "generated"})},
        EXCHANGE_5,
    ),
    (
        "title_boundary_54_chars_keeps",
        {"title": "A" * 54},
        EXCHANGE_4,
    ),
    (
        "title_boundary_55_chars_repairs",
        {"title": "A" * 55},
        EXCHANGE_4,
    ),
    (
        "summary_boundary_900_chars_keeps",
        {"title": "Port status", "summary": "a" * 900},
        EXCHANGE_4,
    ),
    (
        "summary_boundary_901_chars_refines",
        {"title": "Port status", "summary": "a" * 901},
        EXCHANGE_4,
    ),
    (
        # title_terms == 1 is below the >= 2 floor: no evidence.
        "title_evidence_boundary_single_title_term",
        {"title": "Alpha", "summary": _evidence_summary("Alpha", 10)},
        EXCHANGE_4,
    ),
    (
        # summary_terms == 7 is below the >= 8 floor: no evidence.
        "title_evidence_boundary_seven_summary_terms",
        {"title": EVIDENCE_TITLE_2, "summary": _evidence_summary(EVIDENCE_TITLE_2, 5)},
        EXCHANGE_4,
    ),
    (
        # summary_terms == 8 but additional == 5: below the >= 6 floor.
        "title_evidence_boundary_five_additional",
        {"title": EVIDENCE_TITLE_3, "summary": _evidence_summary(EVIDENCE_TITLE_3, 5)},
        EXCHANGE_4,
    ),
    (
        # additional == 6: the evidence floor exactly, low confidence.
        "title_evidence_boundary_six_additional",
        {"title": EVIDENCE_TITLE_3, "summary": _evidence_summary(EVIDENCE_TITLE_3, 6)},
        EXCHANGE_4,
    ),
    (
        # additional == 9: still low, one under the medium threshold.
        "title_evidence_boundary_nine_additional",
        {"title": EVIDENCE_TITLE_2, "summary": _evidence_summary(EVIDENCE_TITLE_2, 9)},
        EXCHANGE_4,
    ),
    (
        # additional == 10: the medium threshold exactly.
        "title_evidence_boundary_ten_additional",
        {"title": EVIDENCE_TITLE_2, "summary": _evidence_summary(EVIDENCE_TITLE_2, 10)},
        EXCHANGE_4,
    ),
    (
        "close_time_typical_ended_conversation",
        {"title": "how does extraction work?", "metadata": json.dumps({"title_status": "provisional"})},
        EXCHANGE_6,
    ),
)


def main() -> None:
    scenarios: list[dict] = []
    for label, conversation_kwargs, messages in SCENARIOS:
        conversation = Conversation(
            id=CONVERSATION_ID,
            interface="pi",
            **conversation_kwargs,
        )
        try:
            metadata = json.loads(conversation.metadata or "{}")
        except json.JSONDecodeError:
            metadata = {}
        if not isinstance(metadata, dict):
            metadata = {}

        report = dry_run_metadata_lifecycle(
            conversation,
            messages,
            metadata,
            title_needs_improvement=_title_needs_improvement,
        )
        actions_by_profile = {
            profile_name: {
                field: metadata_profile_action(
                    metadata_execution_profile(profile_name), field, field_report
                )
                for field, field_report in report["fields"].items()
            }
            for profile_name in PROFILE_NAMES
        }
        scenarios.append(
            {
                "label": label,
                "conversation": {
                    "id": conversation.id,
                    "title": conversation.title,
                    "summary": conversation.summary,
                    "tags": conversation.tags,
                    "metadata": conversation.metadata,
                },
                "messages": [
                    {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at}
                    for m in messages
                ],
                "report": report,
                "actions_by_profile": actions_by_profile,
            }
        )

    profiles = {
        name: {
            "name": profile.name,
            "title_apply_decisions": sorted(profile.title_apply_decisions),
            "summary_apply_decisions": sorted(profile.summary_apply_decisions),
            "tags_apply_decisions": sorted(profile.tags_apply_decisions),
            "force_regenerate": profile.force_regenerate,
            "preserve_manual": profile.preserve_manual,
        }
        for name, profile in (
            (name, metadata_execution_profile(name)) for name in PROFILE_NAMES
        )
    }

    golden = {
        "meta": {
            "metadata_lifecycle_version": 1,
            "profiles": PROFILE_NAMES,
        },
        "profiles": profiles,
        "scenarios": scenarios,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    for scenario in scenarios:
        fields = scenario["report"]["fields"]
        rendered = " ".join(f"{field}={fields[field]['decision']}" for field in sorted(fields))
        close_time = scenario["actions_by_profile"]["close_time"]
        close_rendered = ",".join(f"{f}:{close_time[f]}" for f in sorted(close_time))
        print(f"  {scenario['label']}: {rendered} | close_time[{close_rendered}]")
    print(f"scenarios: {len(scenarios)}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
