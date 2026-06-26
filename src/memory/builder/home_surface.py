"""Builder Home surface rendering for Ariad-adopted journeys."""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from memory.builder.lifecycle_ribbon import render_lifecycle_ribbon
from memory.builder.pull_candidates import PullCandidatesReport
from memory.builder.surface_protocol import wrap_ariad_surface
from memory.builder.workbench import WorkbenchSnapshot, get_workbench_snapshot
from memory.storage.store import Store


@dataclass(frozen=True)
class RefinementFieldSnapshot:
    """Read-only Builder Home snapshot of nascent Refinement state."""

    active_refinement_story: str | None
    active_change_request: str | None
    storage_state: str
    seed_change_requests: int
    seed_change_request_source: str | None
    next_move: str
    refinement_story_count: int = 0
    change_request_count: int = 0
    unassigned_change_request_count: int = 0


def inspect_refinement_field(
    project_path: Path | None,
    *,
    store: Store | None = None,
    journey: str | None = None,
) -> RefinementFieldSnapshot:
    """Inspect current refinement field without requiring durable Workbench storage."""
    workbench = _safe_workbench_snapshot(store, journey)
    if project_path is None:
        return _refinement_snapshot(
            seed_count=0,
            seed_source=None,
            workbench=workbench,
        )
    root = project_path.expanduser().resolve()
    ds6_plan = (
        root
        / "docs/project/roadmap/cv20-builder-mode-evolution/"
        / "cv20-ds6-refinement-workbench-flow/plan.md"
    )
    seed_count = 0
    seed_source: str | None = None
    if ds6_plan.is_file():
        try:
            content = ds6_plan.read_text(encoding="utf-8")
        except OSError:
            content = ""
        seed_count = len(re.findall(r"^###\s+CR:", content, flags=re.MULTILINE))
        if seed_count:
            seed_source = str(ds6_plan.resolve().relative_to(root))
    return _refinement_snapshot(
        seed_count=seed_count,
        seed_source=seed_source,
        workbench=workbench,
    )


def render_builder_home_surface(
    *,
    journey: str,
    method: str,
    candidates_report: PullCandidatesReport,
    refinement: RefinementFieldSnapshot,
) -> str:
    """Render no-active-item Builder Home orientation for Ariad journeys."""
    recommended = candidates_report.recommended
    lines = [
        "Builder Home",
        render_lifecycle_ribbon("pull"),
        "",
        "╭────────────────────────────────────────────────────────╮",
        "│        ■  BUILDER HOME                                 │",
        "│                                                        │",
        _card_text("journey"),
        _card_text(journey),
        "│                                                        │",
        _card_text("method"),
        _card_text(method),
        "│                                                        │",
        _card_text("🟪 Delivery field"),
        *_card_wrapped(
            f"recommended pull: {_format_recommended(recommended)}"
            if recommended
            else "recommended pull: none"
        ),
        "│                                                        │",
        _card_text("🧰 Refinement field"),
        *_card_wrapped(f"active RS: {refinement.active_refinement_story or 'none'}"),
        *_card_wrapped(f"active CR: {refinement.active_change_request or 'none'}"),
        _card_text(f"workbench storage: {refinement.storage_state}"),
        _card_text(f"stored RSs: {refinement.refinement_story_count}"),
        _card_text(f"stored CRs: {refinement.change_request_count}"),
        _card_text(f"unassigned CRs: {refinement.unassigned_change_request_count}"),
        _card_text(f"seed CRs: {refinement.seed_change_requests}"),
    ]
    if refinement.seed_change_request_source:
        lines.extend(_card_wrapped(f"seed source: {refinement.seed_change_request_source}"))
    lines.extend(
        [
            *_card_wrapped(f"next refinement move: {refinement.next_move}"),
            "│                                                        │",
            _card_text("available moves"),
            *_card_prefixed(_available_refinement_moves(refinement), "-"),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped(
                "Builder Home orients only; no item was pulled and no lifecycle work was executed."
            ),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("builder_home", "\n".join(lines) + "\n")


def _available_refinement_moves(refinement: RefinementFieldSnapshot) -> tuple[str, ...]:
    moves = [
        "pull recommended Delivery item",
        "inspect roadmap further",
        "review seed Change Requests",
    ]
    if refinement.active_refinement_story:
        moves.append("continue active Refinement Story")
    elif refinement.storage_state == "implemented":
        moves.append("compose or capture Refinement Work when requested")
    else:
        moves.append("implement Workbench Storage Model before durable RS/CR work")
    return tuple(moves)


def _safe_workbench_snapshot(store: Store | None, journey: str | None) -> WorkbenchSnapshot | None:
    if store is None or journey is None:
        return None
    try:
        return get_workbench_snapshot(store, journey)
    except sqlite3.OperationalError:
        return None


def _refinement_snapshot(
    *,
    seed_count: int,
    seed_source: str | None,
    workbench: WorkbenchSnapshot | None,
) -> RefinementFieldSnapshot:
    if workbench is None:
        return RefinementFieldSnapshot(
            active_refinement_story=None,
            active_change_request=None,
            storage_state="not implemented yet",
            seed_change_requests=seed_count,
            seed_change_request_source=seed_source,
            next_move="implement Workbench Storage Model before durable RS/CR work",
        )
    return RefinementFieldSnapshot(
        active_refinement_story=(
            f"{workbench.active_refinement_story.id} — {workbench.active_refinement_story.title}"
            if workbench.active_refinement_story
            else None
        ),
        active_change_request=(
            f"{workbench.active_change_request.id} — {workbench.active_change_request.title}"
            if workbench.active_change_request
            else None
        ),
        storage_state=workbench.storage_state,
        seed_change_requests=seed_count,
        seed_change_request_source=seed_source,
        next_move=(
            "continue active Change Request"
            if workbench.active_change_request
            else (
                "continue active Refinement Story"
                if workbench.active_refinement_story
                else "compose or capture Refinement Work when requested"
            )
        ),
        refinement_story_count=workbench.refinement_story_count,
        change_request_count=workbench.change_request_count,
        unassigned_change_request_count=workbench.unassigned_change_request_count,
    )


def _format_recommended(candidate: object | None) -> str:
    if candidate is None:
        return "none"
    code = getattr(candidate, "code", "")
    title = getattr(candidate, "title", "")
    level = getattr(candidate, "level", "")
    return f"{code} — {title} [{level}]"


def _card_text(text: str) -> str:
    width = 54
    return f"│ {text[:width]:<{width}} │"


def _card_prefixed(items: tuple[str, ...], prefix: str) -> list[str]:
    if not items:
        return [_card_text("none")]
    lines: list[str] = []
    for item in items:
        wrapped = _wrap_plain_text(item, width=52)
        for index, line in enumerate(wrapped):
            marker = prefix if index == 0 else " "
            lines.append(_card_text(f"{marker} {line}"))
    return lines


def _card_wrapped(text: str) -> list[str]:
    return [_card_text(line) for line in _wrap_plain_text(text, width=54)]


def _wrap_plain_text(text: str, *, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        if len(word) > width:
            if current:
                lines.append(current)
                current = ""
            for start in range(0, len(word), width):
                lines.append(word[start : start + width])
            continue
        candidate = f"{current} {word}".strip()
        if len(candidate) > width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or ["none"]
