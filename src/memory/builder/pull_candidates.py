"""Inspect Ariad pull candidates from roadmap files."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from memory.builder.lifecycle_ribbon import render_lifecycle_ribbon
from memory.builder.surface_protocol import wrap_ariad_surface

_CANDIDATE_STATUSES = ("Planned", "Active", "Blocked", "Candidate")
_STATUS_RE = re.compile(r"\*\*Status:\*\*\s*(?P<status>.+?)\s*$", re.MULTILINE)
_HEADING_RE = re.compile(r"^#\s+(?P<code>[A-Z0-9.]+)\s+[—-]\s+(?P<title>.+?)\s*$", re.MULTILINE)
_TYPE_RE = re.compile(r"\*\*Type:\*\*\s*(?P<type>.+?)\s*$", re.MULTILINE)


@dataclass(frozen=True)
class RoadmapSnapshotItem:
    code: str
    title: str
    status: str


@dataclass(frozen=True)
class RoadmapSnapshotReport:
    journey: str
    method: str
    items: tuple[RoadmapSnapshotItem, ...]
    source: str | None


@dataclass(frozen=True)
class PullCandidate:
    code: str
    title: str
    level: str
    status: str
    path: str


@dataclass(frozen=True)
class PullCandidatesReport:
    journey: str
    method: str
    candidates: tuple[PullCandidate, ...]
    recommended: PullCandidate | None


def inspect_roadmap_snapshot(
    project_path: Path | None,
    *,
    journey: str,
    method: str,
) -> RoadmapSnapshotReport:
    """Inspect the compact roadmap snapshot from docs/project/roadmap/index.md."""
    if project_path is None:
        return RoadmapSnapshotReport(journey=journey, method=method, items=(), source=None)
    root = project_path.expanduser().resolve()
    roadmap_index = root / "docs" / "project" / "roadmap" / "index.md"
    if not roadmap_index.is_file():
        return RoadmapSnapshotReport(journey=journey, method=method, items=(), source=None)
    try:
        content = roadmap_index.read_text(encoding="utf-8")
    except OSError:
        return RoadmapSnapshotReport(journey=journey, method=method, items=(), source=None)
    return RoadmapSnapshotReport(
        journey=journey,
        method=method,
        items=tuple(_snapshot_items_from_content(content)),
        source=str(roadmap_index.resolve().relative_to(root)),
    )


def inspect_pull_candidates(
    project_path: Path | None,
    *,
    journey: str,
    method: str,
) -> PullCandidatesReport:
    """Inspect roadmap files and return candidate Ariad pull items."""
    if project_path is None:
        return PullCandidatesReport(journey=journey, method=method, candidates=(), recommended=None)
    root = project_path.expanduser().resolve()
    roadmap_root = root / "docs" / "project" / "roadmap"
    if not roadmap_root.is_dir():
        return PullCandidatesReport(journey=journey, method=method, candidates=(), recommended=None)

    candidates = tuple(
        candidate
        for path in sorted(roadmap_root.rglob("index.md"))
        for candidate in _candidates_from_file(root, path)
    )
    return PullCandidatesReport(
        journey=journey,
        method=method,
        candidates=candidates,
        recommended=_recommend(candidates),
    )


def render_roadmap_snapshot_report(
    report: RoadmapSnapshotReport,
    *,
    candidates: tuple[PullCandidate, ...] = (),
) -> str:
    """Render Ariad roadmap snapshot using the method visual grammar."""
    focus = _focus_item(report.items, candidates=candidates)
    result = "ready to pull" if candidates else "no pull candidates"
    lines = [
        "ROADMAP SNAPSHOT",
        "Delivery field overview",
        render_lifecycle_ribbon("pull"),
        "",
        "view                         overview",
        f"result of roadmap-snapshot      {result}",
        "",
        "╭────────────────────────────────────────────────────────╮",
    ]
    if focus is None:
        lines.extend(
            [
                "│ roadmap field                                      none │",
                "│                                                        │",
                "│   Backlog                                           none │",
            ]
        )
    else:
        marker = _status_marker(focus.status)
        lines.extend(
            [
                _card_line(f"🟪[{focus.code}]  {focus.title}", marker),
                _card_text(f"value: {focus.title}"),
                "│                                                        │",
            ]
        )
        delivery_candidates = tuple(
            candidate for candidate in candidates if candidate.code.startswith(f"{focus.code}.")
        )
        current = _recommend(delivery_candidates) if delivery_candidates else None
        if current is not None:
            lines.extend(
                [
                    _card_line(
                        f"   └─ 🟦[{current.code.split('.')[-1]}] {current.title.split('/')[-1].strip()}",
                        "◉ current",
                    ),
                    _card_text("      progress: not started"),
                    "│                                                        │",
                ]
            )
        lines.append(_card_text("      Backlog"))
        if delivery_candidates:
            for candidate in delivery_candidates:
                lines.append(
                    _card_text(
                        f"      ○ 🟦[{candidate.code}] {candidate.title.split('/')[-1].strip()}"
                    )
                )
        else:
            lines.append(_card_text("      none"))
        lines.extend(
            [
                "│                                                        │",
                _card_text("      Recently promoted from Exploration"),
                _card_text("      none"),
                "│                                                        │",
                _card_text("      Active constraints"),
                _card_text("      ✕ do not start candidates automatically"),
                _card_text("      ✓ Navigator explicitly chooses Pull"),
            ]
        )
    lines.extend(
        [
            "╰────────────────────────────────────────────────────────╯",
            "",
            "source",
            report.source or "none",
            "",
            "boundary",
            "Roadmap was inspected only. No item was pulled. No lifecycle work was executed.",
        ]
    )
    return wrap_ariad_surface("roadmap_snapshot", "\n".join(lines) + "\n")


def render_pull_candidates_report(report: PullCandidatesReport) -> str:
    """Render Ariad pull candidates using the method visual grammar."""
    lines = [
        "Delivery",
        render_lifecycle_ribbon("pull"),
        "",
        "╭────────────────────────────────────────────────────────╮",
        "│        🟪■  PULL CANDIDATES                            │",
        "│                                                        │",
        _card_text("journey"),
        _card_text(report.journey),
        "│                                                        │",
        _card_text("method"),
        _card_text(report.method),
        "│                                                        │",
        _card_text("available candidates"),
        *_card_prefixed(_candidate_lines(report.candidates), "-"),
        "│                                                        │",
        _card_text("recommended pull"),
        *_card_wrapped(_format_candidate(report.recommended) if report.recommended else "none"),
        "│                                                        │",
        _card_text("boundary"),
        *_card_wrapped("No item was pulled. No lifecycle work was executed."),
        "╰────────────────────────────────────────────────────────╯",
    ]
    return wrap_ariad_surface("pull_candidates", "\n".join(lines) + "\n")


def _snapshot_items_from_content(content: str) -> list[RoadmapSnapshotItem]:
    items: list[RoadmapSnapshotItem] = []
    in_table = False
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if line == "| Code | Capability Value | Status |":
            in_table = True
            continue
        if in_table and line.startswith("|---"):
            continue
        if in_table and line.startswith("|"):
            parts = [part.strip() for part in line.strip("|").split("|")]
            if len(parts) >= 3:
                items.append(
                    RoadmapSnapshotItem(
                        code=_strip_markdown_link(parts[0]),
                        title=_strip_markdown_link(parts[1]),
                        status=parts[2],
                    )
                )
            continue
        if in_table and line:
            break
    if items:
        return items

    current_cv: tuple[str, str] | None = None
    for raw_line in content.splitlines():
        line = raw_line.strip()
        cv_match = re.match(r"^##\s+(CV\d+):\s+(.+?)\s*$", line)
        if cv_match:
            current_cv = (cv_match.group(1), cv_match.group(2).strip())
            continue
        status_match = re.match(r"^\*\*Status:\*\*\s*(.+?)\s*$", line)
        if status_match and current_cv:
            items.append(
                RoadmapSnapshotItem(
                    code=current_cv[0],
                    title=current_cv[1],
                    status=status_match.group(1).strip(),
                )
            )
            current_cv = None
    return items


def _candidates_from_file(root: Path, path: Path) -> tuple[PullCandidate, ...]:
    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        return ()
    candidates: list[PullCandidate] = []
    index_candidate = _candidate_from_index_content(root, path, content)
    if index_candidate is not None:
        candidates.append(index_candidate)
    candidates.extend(_candidate_delivery_stories_from_content(root, path, content))
    return tuple(candidates)


def _candidate_from_index_content(root: Path, path: Path, content: str) -> PullCandidate | None:
    heading = _HEADING_RE.search(content)
    status = _STATUS_RE.search(content)
    if not heading or not status:
        return None
    status_text = status.group("status").strip()
    if not any(marker in status_text for marker in _CANDIDATE_STATUSES):
        return None
    code = heading.group("code").strip()
    return PullCandidate(
        code=code,
        title=heading.group("title").strip(),
        level=_level_for(code, content),
        status=status_text,
        path=str(path.resolve().relative_to(root)),
    )


def _candidate_delivery_stories_from_content(
    root: Path,
    path: Path,
    content: str,
) -> list[PullCandidate]:
    candidates: list[PullCandidate] = []
    current_cv: str | None = None
    current_cv_title: str | None = None
    current_status: str | None = None
    in_candidate_delivery_stories = False
    for raw_line in content.splitlines():
        line = raw_line.strip()
        cv_match = re.match(r"^##\s+(CV\d+):\s+(.+?)\s*$", line)
        if cv_match:
            current_cv = cv_match.group(1)
            current_cv_title = cv_match.group(2).strip()
            current_status = None
            in_candidate_delivery_stories = False
            continue
        status_match = re.match(r"^\*\*Status:\*\*\s*(.+?)\s*$", line)
        if status_match and current_cv:
            current_status = status_match.group(1).strip()
            continue
        if line == "Candidate Delivery Stories:":
            in_candidate_delivery_stories = True
            continue
        if in_candidate_delivery_stories and line.startswith("- ") and current_cv:
            ds_match = re.match(r"^-\s+(DS\d+)\s+(.+?)\.?$", line)
            if not ds_match:
                continue
            status = current_status or "Candidate"
            if not any(marker in status for marker in _CANDIDATE_STATUSES):
                continue
            title = ds_match.group(2).strip()
            if current_cv_title:
                title = f"{current_cv_title} / {title}"
            candidates.append(
                PullCandidate(
                    code=f"{current_cv}.{ds_match.group(1)}",
                    title=title,
                    level="delivery_story",
                    status=status,
                    path=str(path.resolve().relative_to(root)),
                )
            )
            continue
        if in_candidate_delivery_stories and line and not line.startswith("- "):
            in_candidate_delivery_stories = False
    return candidates


def _level_for(code: str, content: str) -> str:
    type_match = _TYPE_RE.search(content)
    if type_match:
        story_type = type_match.group("type").strip().lower()
        if "technical" in story_type:
            return "technical_story"
        if "user" in story_type:
            return "user_story"
    if ".DS" in code:
        return "delivery_story"
    return "cv"


def _recommend(candidates: tuple[PullCandidate, ...]) -> PullCandidate | None:
    for preferred_status in ("Planned", "Candidate", "Active", "Blocked"):
        for preferred_level in ("user_story", "technical_story", "delivery_story"):
            for candidate in candidates:
                if candidate.level == preferred_level and preferred_status in candidate.status:
                    return candidate
    return candidates[0] if candidates else None


def _focus_item(
    items: tuple[RoadmapSnapshotItem, ...],
    *,
    candidates: tuple[PullCandidate, ...] = (),
) -> RoadmapSnapshotItem | None:
    recommended = _recommend(candidates) if candidates else None
    if recommended is not None:
        recommended_cv = recommended.code.split(".", 1)[0]
        for item in items:
            if item.code == recommended_cv:
                return item
    for preferred_status in ("Active", "In Progress", "Candidate", "Planned", "Future"):
        for item in items:
            if preferred_status in item.status:
                return item
    return items[0] if items else None


def _status_marker(status: str) -> str:
    if "Active" in status or "In Progress" in status:
        return "◉ active"
    if "Candidate" in status:
        return "◉ candidate"
    if "Planned" in status:
        return "○ planned"
    if "Done" in status:
        return "✓ done"
    return f"○ {status.lower()}"


def _strip_markdown_link(value: str) -> str:
    match = re.fullmatch(r"\[(?P<label>[^\]]+)\]\([^)]*\)", value.strip())
    return match.group("label") if match else value


def _card_line(left: str, right: str) -> str:
    width = 54
    right_width = len(right)
    left_width = max(1, width - right_width - 1)
    trimmed_left = left[:left_width]
    content = f"{trimmed_left:<{left_width}} {right}"
    return f"│ {content:<{width}} │"


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


def _candidate_lines(candidates: tuple[PullCandidate, ...]) -> tuple[str, ...]:
    return tuple(_format_candidate(candidate) for candidate in candidates)


def _format_candidates(candidates: tuple[PullCandidate, ...]) -> list[str]:
    if not candidates:
        return ["none"]
    return [f"- {_format_candidate(candidate)}" for candidate in candidates]


def _format_candidate(candidate: PullCandidate) -> str:
    return f"{candidate.code} — {candidate.title} [{candidate.level}] {candidate.status} ({candidate.path})"
