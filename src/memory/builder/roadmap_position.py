"""Resolve Builder roadmap position from roadmap files."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from memory.builder.roadmap_grammar import (
    HEADING_RE as _HEADING_RE,
)
from memory.builder.roadmap_grammar import (
    STATUS_RE as _STATUS_RE,
)
from memory.builder.roadmap_grammar import (
    is_legacy_path as _is_legacy_path,
)

_ACTIVE_STATUS_MARKERS = ("🟢 Active", "Active")


@dataclass(frozen=True)
class RoadmapPosition:
    code: str
    title: str
    status: str
    path: str


def resolve_roadmap_position(project_path: Path | None) -> RoadmapPosition | None:
    """Return the first active roadmap file under a project, if any."""
    if project_path is None:
        return None
    root = project_path.expanduser().resolve()
    roadmap_root = root / "docs" / "project" / "roadmap"
    if not roadmap_root.is_dir():
        return None

    candidates: list[RoadmapPosition] = []
    for path in sorted(roadmap_root.rglob("index.md")):
        if _is_legacy_path(path, roadmap_root):
            continue
        position = _position_from_file(root, path)
        if position is not None:
            candidates.append(position)
    return candidates[0] if candidates else None


def _position_from_file(root: Path, path: Path) -> RoadmapPosition | None:
    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        return None
    status_match = _STATUS_RE.search(content)
    if not status_match:
        return None
    status = status_match.group("status").strip()
    if not any(marker in status for marker in _ACTIVE_STATUS_MARKERS):
        return None
    heading_match = _HEADING_RE.search(content)
    if not heading_match:
        return None
    return RoadmapPosition(
        code=heading_match.group("code").strip(),
        title=heading_match.group("title").strip(),
        status=status,
        path=path.resolve().relative_to(root).as_posix(),
    )
