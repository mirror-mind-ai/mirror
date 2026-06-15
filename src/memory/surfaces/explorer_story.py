"""Plain-text Explorer Story surfaces."""

from __future__ import annotations

from pathlib import PurePath

from memory.services.explorer_story import ExplorerStory

WIDTH = 56


def render_exploratory_story_opened(story: ExplorerStory) -> str:
    return _box(
        "△  EXPLORATORY STORY OPENED",
        _story_rows(story, include_last_card=True),
    )


def render_exploratory_story_resumed(story: ExplorerStory) -> str:
    rows = _story_rows(story, include_last_card=True, include_lifecycle=True)
    return _box("△  EXPLORATORY STORY RESUMED", rows)


def render_explorer_story_archived(story: ExplorerStory | None, *, journey: str) -> str:
    if story is None:
        return _box(
            "△  NO ACTIVE EXPLORATORY STORY",
            [
                ("journey", journey),
                ("state", "No active Exploratory Story exists to archive."),
            ],
        )
    return _box(
        "△  EXPLORATORY STORY ARCHIVED",
        _story_rows(story, include_last_card=True, include_lifecycle=True),
    )


def render_explorer_story_list(journey: str, stories: list[ExplorerStory]) -> str:
    rows: list[tuple[str, str]] = [("journey", journey)]
    if not stories:
        rows.append(("explorations", "No Exploratory Stories have been recorded yet."))
    for index, story in enumerate(stories, start=1):
        title = story.title or story.current_exploratory_story or "Untitled exploration"
        rows.append((f"story {index}", f"{title} [{story.status}]"))
        if story.id:
            rows.append(("id", story.id))
        if story.updated_at:
            rows.append(("updated", story.updated_at))
    return _box("△  EXPLORATORY STORIES", rows)


def render_story_thickened(story: ExplorerStory, *, changed: str | None = None) -> str:
    rows: list[tuple[str, str]] = []
    if changed and changed.strip():
        rows.append(("what changed", changed.strip()))
    rows.extend(_story_rows(story, include_last_card=True))
    return _box("△  STORY THICKENED", rows)


def render_narrative_field_snapshot(story: ExplorerStory) -> str:
    return _box(
        "△  NARRATIVE FIELD SNAPSHOT",
        _story_rows(story, include_last_card=True, include_direction=True),
    )


def render_attractors_emerging(story: ExplorerStory) -> str:
    rows = [("journey", story.journey)]
    if story.attractors:
        for index, attractor in enumerate(story.attractors, start=1):
            label = "possible attractor" if index == 1 else "possible attractor " + str(index)
            rows.append((label, attractor.label))
            if attractor.description:
                rows.append(("description", attractor.description))
            rows.append(("status", attractor.status))
    else:
        rows.append(("possible attractor", "No attractor has been surfaced yet."))
    return _box("△  ATTRACTORS EMERGING", rows)


def render_experiment_proposal(story: ExplorerStory) -> str:
    rows = [("journey", story.journey)]
    if story.experiment_proposal:
        rows.append(("small experiment", story.experiment_proposal.title))
        if story.experiment_proposal.description:
            rows.append(("description", story.experiment_proposal.description))
        rows.append(("status", story.experiment_proposal.status))
    else:
        rows.append(("small experiment", "No experiment has been proposed yet."))
    rows.append(("boundary", "This is not Builder delivery until explicitly confirmed."))
    return _box("△  EXPERIMENT PROPOSAL", rows)


def _handoff_path_label(path: str) -> str:
    name = PurePath(path.replace("\\", "/")).name
    return f"{name} — {path}" if name else path


def render_builder_handoff_proposed(story: ExplorerStory) -> str:
    rows = [("journey", story.journey)]
    handoff = story.builder_handoff
    if handoff:
        rows.append(("handoff", handoff.title))
        if handoff.summary:
            rows.append(("summary", handoff.summary))
        if handoff.artifact_dir:
            rows.append(("artifact directory", _handoff_path_label(handoff.artifact_dir)))
        if handoff.index_path:
            rows.append(("index", _handoff_path_label(handoff.index_path)))
        if handoff.exploratory_story_path:
            rows.append(("exploratory story", _handoff_path_label(handoff.exploratory_story_path)))
        if handoff.handoff_info_path:
            rows.append(("handoff info", _handoff_path_label(handoff.handoff_info_path)))
        if handoff.product_design_proposal_path:
            rows.append(("product design", _handoff_path_label(handoff.product_design_proposal_path)))
        if handoff.full_conversation_path:
            rows.append(("full conversation", _handoff_path_label(handoff.full_conversation_path)))
    else:
        rows.append(("handoff", "No Builder handoff has been proposed yet."))
    if story.source_conversations:
        for source in story.source_conversations:
            title = f" — {source.title}" if source.title else ""
            rows.append(("source evidence", f"{source.conversation_id}{title} ({source.role})"))
    if story.current_exploratory_story:
        rows.append(("current story", story.current_exploratory_story))
    for attractor in story.attractors:
        rows.append(("attractor", f"{attractor.label} [{attractor.status}]"))
    if story.experiment_proposal:
        rows.append(
            (
                "experiment proposal",
                f"{story.experiment_proposal.title} [{story.experiment_proposal.status}]",
            )
        )
    rows.append(("boundary", "Builder executes only after explicit confirmation."))
    return _box("△  BUILDER HANDOFF PROPOSED", rows)


def render_no_builder_handoff(*, journey: str) -> str:
    return _box(
        "△  NO BUILDER HANDOFF",
        [
            ("journey", journey),
            ("state", "No Builder handoff proposal exists for this story."),
            ("boundary", "Ask for a handoff proposal before promoting to Builder."),
        ],
    )


def render_missing_exploratory_story(*, journey: str) -> str:
    return _box(
        "△  NO EXPLORATORY STORY",
        [
            ("journey", journey),
            ("state", "No current Exploratory Story is stored for this journey."),
        ],
    )


def _story_rows(
    story: ExplorerStory,
    *,
    include_last_card: bool,
    include_direction: bool = False,
    include_lifecycle: bool = False,
) -> list[tuple[str, str]]:
    rows = [("journey", story.journey)]
    if include_lifecycle:
        if story.id:
            rows.append(("story id", story.id))
        rows.append(("status", story.status))
    if story.current_exploratory_story:
        rows.append(("current story", story.current_exploratory_story))
    if story.narrative_field_summary:
        rows.append(("narrative summary", story.narrative_field_summary))
    if include_last_card and story.last_story_card:
        rows.append(("last card", story.last_story_card))
    if include_direction:
        for attractor in story.attractors:
            rows.append(("attractor", f"{attractor.label} [{attractor.status}]"))
            if attractor.description:
                rows.append(("attractor detail", attractor.description))
        if story.experiment_proposal:
            rows.append(
                (
                    "experiment proposal",
                    f"{story.experiment_proposal.title} [{story.experiment_proposal.status}]",
                )
            )
            if story.experiment_proposal.description:
                rows.append(("experiment detail", story.experiment_proposal.description))
    if include_lifecycle and story.updated_at:
        rows.append(("updated", story.updated_at))
    if len(rows) == 1 or (include_lifecycle and len(rows) <= 3):
        rows.append(("current story", "No story text recorded yet."))
    return rows


def _box(title: str, rows: list[tuple[str, str]]) -> str:
    lines = ["Mirror", "╭" + "─" * WIDTH + "╮", _line(f"        {title}")]
    for label, value in rows:
        lines.append(_line(""))
        lines.append(_line(f"  {label}"))
        for wrapped in _wrap(value):
            lines.append(_line(f"  {wrapped}"))
    lines.append("╰" + "─" * WIDTH + "╯")
    return "\n".join(lines)


def _line(text: str) -> str:
    content = text[:WIDTH]
    return "│" + content.ljust(WIDTH) + "│"


def _wrap(text: str) -> list[str]:
    max_width = WIDTH - 2
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = ""
    for word in words:
        chunks = _chunk_word(word, max_width)
        for chunk in chunks:
            if not current:
                current = chunk
            elif len(current) + 1 + len(chunk) <= max_width:
                current += " " + chunk
            else:
                lines.append(current)
                current = chunk
    if current:
        lines.append(current)
    return lines


def _chunk_word(word: str, width: int) -> list[str]:
    if len(word) <= width:
        return [word]
    return [word[index : index + width] for index in range(0, len(word), width)]
