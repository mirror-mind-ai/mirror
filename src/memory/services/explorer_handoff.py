"""Explorer to Builder handoff artifact writer."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from memory.services.explorer_story import (
    ExplorerBuilderHandoff,
    ExplorerSourceConversation,
    ExplorerStory,
)


@dataclass(frozen=True)
class HandoffSourceMessage:
    role: str
    content: str


@dataclass(frozen=True)
class HandoffConversationSource:
    conversation_id: str
    title: str | None
    role: str
    messages: tuple[HandoffSourceMessage, ...] = ()


def write_builder_handoff_artifacts(
    project_path: Path,
    story: ExplorerStory,
    *,
    title: str,
    summary: str | None = None,
    editorial_synthesis: str | None = None,
    source_conversations: tuple[HandoffConversationSource, ...] = (),
    include_full_conversation: bool = False,
) -> ExplorerBuilderHandoff:
    """Write Explorer handoff docs under a project's exploration folder."""
    project_path = project_path.expanduser()
    es_id = _slugify(title or story.current_exploratory_story or story.journey)
    base = project_path / "docs" / "project" / "explorations" / es_id
    suffix = 2
    while base.exists():
        base = project_path / "docs" / "project" / "explorations" / f"{es_id}-{suffix}"
        suffix += 1
    base.mkdir(parents=True, exist_ok=False)

    index_path = base / "index.md"
    exploratory_story_path = base / "exploratory-story.md"
    handoff_info_path = base / "handoff-info.md"
    product_design_path = base / "product-design-proposal.md"
    full_conversation_path = base / "full-conversation.md"
    full_conversation_written = include_full_conversation and bool(source_conversations)

    index_path.write_text(
        _render_index_doc(
            story,
            title=title,
            summary=summary,
            editorial_synthesis=editorial_synthesis,
            source_conversations=source_conversations,
            includes_full_conversation=full_conversation_written,
        ),
        encoding="utf-8",
    )
    exploratory_story_path.write_text(
        _render_exploratory_story_doc(
            story,
            title=title,
            editorial_synthesis=editorial_synthesis,
        ),
        encoding="utf-8",
    )
    handoff_info_path.write_text(
        _render_handoff_info_doc(
            story,
            title=title,
            summary=summary,
            source_conversations=source_conversations,
            includes_full_conversation=full_conversation_written,
        ),
        encoding="utf-8",
    )
    product_design_path.write_text(
        _render_product_design_doc(story, title=title, summary=summary),
        encoding="utf-8",
    )
    if full_conversation_written:
        full_conversation_path.write_text(
            _render_full_conversation_doc(source_conversations),
            encoding="utf-8",
        )

    return ExplorerBuilderHandoff(
        title=title,
        summary=summary,
        readiness="proposed",
        artifact_dir=base.as_posix(),
        index_path=index_path.as_posix(),
        exploratory_story_path=exploratory_story_path.as_posix(),
        handoff_info_path=handoff_info_path.as_posix(),
        product_design_proposal_path=product_design_path.as_posix(),
        full_conversation_path=full_conversation_path.as_posix()
        if full_conversation_written
        else None,
    )


def _render_index_doc(
    story: ExplorerStory,
    *,
    title: str,
    summary: str | None,
    editorial_synthesis: str | None,
    source_conversations: tuple[HandoffConversationSource, ...],
    includes_full_conversation: bool,
) -> str:
    full_conversation_line = (
        "- [Full Conversation Evidence](full-conversation.md): privacy-reviewed raw source material."
        if includes_full_conversation
        else "- Full conversation evidence was not included in this handoff."
    )
    return f"""# Exploration Handoff: {title}

## Editorial Synthesis

{editorial_synthesis or summary or story.narrative_field_summary or "_No editorial synthesis recorded._"}

## Durable Story

- Story id: `{story.id or "not recorded"}`
- Journey: `{story.journey}`
- Status: `{story.status}`

## Source Evidence

{_render_source_evidence(source_conversations)}

## What Was Decided

{_render_decided_product_direction(story)}

## Transfer Documents

- [Exploratory Story](exploratory-story.md): discovery narrative and continuous thickening.
- [Handoff Info](handoff-info.md): risks, open questions, boundaries, and non-assumptions for Builder.
- [Product Design Proposal](product-design-proposal.md): user-facing product behavior, without implementation detail.
{full_conversation_line}

## Current Attractors

{_render_attractors(story)}

## Current Experiment Proposal

{_render_experiment(story)}

## Builder Reading Order

Read this `index.md` first, then `exploratory-story.md`, then `handoff-info.md`, then `product-design-proposal.md`. If `full-conversation.md` exists, read it as source evidence, not as a delivery plan. Treat the set as exploration output, not as a completed delivery plan.
"""


def _render_exploratory_story_doc(
    story: ExplorerStory,
    *,
    title: str,
    editorial_synthesis: str | None,
) -> str:
    return f"""# Exploratory Story: {title}

## Source

- Journey: `{story.journey}`
- Story id: `{story.id or "not recorded"}`
- Mode: Explorer Mode

## Continuous Thickening Narrative

{editorial_synthesis or story.narrative_field_summary or "_No continuous thickening narrative recorded._"}

## Current Exploratory Story

{story.current_exploratory_story or "_No story text recorded._"}

## Narrative Summary

{story.narrative_field_summary or "_No narrative summary recorded._"}

## Last Story Card

{story.last_story_card or "_No last story card recorded._"}

## Attractors

{_render_attractors(story)}

## Experiment Proposal

{_render_experiment(story)}

## What Changed Through Exploration

This section should preserve the evolution of the exploration: the original question, the meaningful pivots, the corrections that changed the story, and the current point of promotion. If this document was generated from a short runtime summary, Builder should ask the Navigator whether more conversation evidence must be folded in before roadmap work starts.
"""


def _render_handoff_info_doc(
    story: ExplorerStory,
    *,
    title: str,
    summary: str | None,
    source_conversations: tuple[HandoffConversationSource, ...],
    includes_full_conversation: bool,
) -> str:
    return f"""# Handoff Info: {title}

## Handoff Summary

{summary or story.narrative_field_summary or "_No handoff summary recorded._"}

## Handoff Completeness Checklist

{_render_completeness_checklist(story, source_conversations, includes_full_conversation)}

## What Builder Should Preserve

- The exploration is not only a feature request. It carries discovery context and product judgment.
- The attractor and experiment proposal should guide Builder's first roadmap framing.
- The product design proposal should be translated into roadmap/story docs only after Builder reads the project.

## Risks

- Builder may over-treat exploratory material as settled delivery scope.
- Builder may flatten open questions into implementation assumptions.
- Builder may focus on mechanism before preserving the user-facing product shape.

## Open Questions

- Which parts of this exploration should become roadmap stories?
- What validation route proves the product behavior externally?
- What should remain outside the first delivery slice?

## Boundaries

- This handoff is not a delivery plan.
- Builder must still read the project, create or update roadmap/story docs, and validate with the Navigator.
- Explorer preserved uncertainty; Builder should not erase it prematurely.

## Non-Assumptions

- Do not assume implementation architecture from this handoff.
- Do not assume all open questions are in scope.
- Do not assume the experiment proposal has already been validated.

## Attractors

{_render_attractors(story)}

## Experiment Status

{_render_experiment(story)}

## Promotion Boundary

Builder executes only after explicit confirmation from the Navigator.
"""


def _render_product_design_doc(story: ExplorerStory, *, title: str, summary: str | None) -> str:
    return f"""# Product Design Proposal: {title}

## Product Intent

{summary or story.narrative_field_summary or "_No product intent summary recorded._"}

## User-Facing Behavior

{story.current_exploratory_story or "_No current story recorded._"}

## What The Product Should Feel Like

The product should preserve the exploratory shape discovered by Explorer Mode. It should show the user what is happening at the product level, not expose implementation mechanics first.

## Interaction Flow

- User works in Explorer Mode while uncertainty is still alive.
- Explorer surfaces story changes visibly.
- Explorer names attractors and proposes small experiments.
- Explorer proposes Builder handoff only when the user asks or confirms readiness.
- Builder begins only after explicit confirmation.

## Product-Level States

- Exploratory Story active.
- Attractor proposed or accepted.
- Experiment proposal proposed or accepted.
- Builder handoff proposed.

## Acceptance Behavior

- The user can understand what is being proposed without reading implementation details.
- The proposal preserves uncertainty and open questions.
- The proposal gives Builder enough product shape to create roadmap or story plans.

## Explicit Non-Goals

- This document does not define implementation architecture.
- This document does not create delivery tasks by itself.
- This document does not replace Builder planning.

## Open Product Questions

- Which behavior is necessary for the first delivery slice?
- What should remain exploratory after Builder starts?
- What user validation will prove the product behavior works?
"""


def _render_full_conversation_doc(sources: tuple[HandoffConversationSource, ...]) -> str:
    sections = [
        "# Full Conversation Evidence",
        "",
        "This document is source evidence for a Builder handoff. Sensitive personal or local details may have been obfuscated before writing.",
    ]
    for source in sources:
        sections.extend(
            [
                "",
                f"## Conversation {source.conversation_id}",
                "",
                f"- Title: {source.title or 'Untitled conversation'}",
                f"- Evidence role: {source.role}",
            ]
        )
        for message in source.messages:
            sections.extend(
                [
                    "",
                    f"### {message.role}",
                    "",
                    _obfuscate_sensitive_text(message.content),
                ]
            )
    return "\n".join(sections) + "\n"


def _render_source_evidence(sources: tuple[HandoffConversationSource, ...]) -> str:
    if not sources:
        return "_No source conversations were attached to this handoff._"
    lines = []
    for source in sources:
        title = source.title or "Untitled conversation"
        lines.append(f"- `{source.conversation_id}` — {title} ({source.role})")
    return "\n".join(lines)


def _render_completeness_checklist(
    story: ExplorerStory,
    sources: tuple[HandoffConversationSource, ...],
    includes_full_conversation: bool,
) -> str:
    checks = [
        (
            "continuous exploratory thickening",
            bool(story.narrative_field_summary or story.last_story_card),
        ),
        ("source evidence list", bool(sources)),
        ("surfaces and story state", bool(story.current_exploratory_story)),
        ("phases or evolution narrative", bool(story.narrative_field_summary)),
        ("examples or simulations", includes_full_conversation),
        ("product decisions", bool(story.current_exploratory_story)),
        ("user conversation flows", includes_full_conversation),
        ("transition rules", True),
        ("risks", True),
        ("boundaries", True),
        ("open questions", True),
        ("what Builder should preserve", True),
        ("what Builder should not assume", True),
    ]
    lines = [f"- [{'x' if present else ' '}] {label}" for label, present in checks]
    missing = [label for label, present in checks if not present]
    if missing:
        lines.extend(["", "Missing or weak evidence before Builder should treat this as complete:"])
        lines.extend(f"- {label}" for label in missing)
    return "\n".join(lines)


def _obfuscate_sensitive_text(text: str) -> str:
    redacted = text
    redacted = re.sub(r"/Users/[^\s)\]]+", "[LOCAL_PATH]", redacted)
    redacted = re.sub(
        r"(?i)(api[_-]?key|token|secret|password)\s*=\s*[^\s]+", r"\1=[SECRET]", redacted
    )
    redacted = re.sub(r"sk-[A-Za-z0-9_-]{12,}", "[SECRET]", redacted)
    redacted = re.sub(
        r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[PRIVATE_EMAIL]", redacted
    )
    redacted = re.sub(r"\b(?:\+?\d[\d .()-]{8,}\d)\b", "[PRIVATE_PHONE]", redacted)
    return redacted


def _render_decided_product_direction(story: ExplorerStory) -> str:
    parts = []
    if story.current_exploratory_story:
        parts.append(story.current_exploratory_story)
    if story.narrative_field_summary:
        parts.append(story.narrative_field_summary)
    return "\n\n".join(parts) or "_No decided product direction recorded._"


def _render_attractors(story: ExplorerStory) -> str:
    if not story.attractors:
        return "_No attractors recorded._"
    lines: list[str] = []
    for attractor in story.attractors:
        lines.append(f"- **{attractor.label}** (`{attractor.status}`)")
        if attractor.description:
            lines.append(f"  - {attractor.description}")
    return "\n".join(lines)


def _render_experiment(story: ExplorerStory) -> str:
    proposal = story.experiment_proposal
    if not proposal:
        return "_No experiment proposal recorded._"
    lines = [f"**{proposal.title}** (`{proposal.status}`)"]
    if proposal.description:
        lines.append("")
        lines.append(proposal.description)
    return "\n".join(lines)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "exploration"


def source_conversations_from_story(
    story: ExplorerStory,
) -> tuple[ExplorerSourceConversation, ...]:
    return story.source_conversations
