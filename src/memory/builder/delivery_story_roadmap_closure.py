"""Read-only authored-roadmap preflight for Delivery Story Done."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from memory.builder.roadmap_grammar import strip_markdown_link
from memory.builder.story_paths import resolve_story_directory

_STATUS_RE = re.compile(r"^\*\*Status:\*\*\s*(?P<status>.+?)\s*$", re.MULTILINE)


@dataclass(frozen=True)
class AuthoredClosureReport:
    """Bounded evidence that authored roadmap state is ready for DS Done."""

    ready: bool
    issues: tuple[str, ...]


def inspect_authored_closure(
    project_path: Path,
    *,
    delivery_story: str,
    child_work_items: tuple[str, ...],
) -> AuthoredClosureReport:
    """Verify explicit DS/child package and canonical table statuses are Done."""
    project_root = project_path.resolve()
    issues: list[str] = []
    for code in (delivery_story, *child_work_items):
        package = resolve_story_directory(project_root, code)
        if package is None:
            issues.append(f"docs/project/roadmap: package {code} was not found")
            continue
        index_path = package / "index.md"
        content = index_path.read_text(encoding="utf-8")
        match = _STATUS_RE.search(content)
        if match is None or not _is_done(match.group("status")):
            issues.append(f"{_relative(index_path, project_root)}: package status is not Done")

    roadmap_root = project_root / "docs" / "project" / "roadmap"
    known_codes = {delivery_story, *child_work_items}
    if roadmap_root.is_dir():
        for index_path in sorted(roadmap_root.rglob("index.md")):
            for code, status in _status_table_rows(index_path):
                if code in known_codes and not _is_done(status):
                    issues.append(
                        f"{_relative(index_path, project_root)}: table row {code} is not Done"
                    )

    return AuthoredClosureReport(ready=not issues, issues=tuple(issues))


def _status_table_rows(index_path: Path) -> tuple[tuple[str, str], ...]:
    rows: list[tuple[str, str]] = []
    columns: dict[str, int] | None = None
    for raw_line in index_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line.startswith("|"):
            columns = None
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if columns is None:
            lowered = [cell.casefold() for cell in cells]
            if "code" in lowered and "status" in lowered:
                columns = {name: lowered.index(name) for name in ("code", "status")}
            continue
        if all(not cell or set(cell) <= {"-", ":"} for cell in cells):
            continue
        if len(cells) <= max(columns.values()):
            continue
        code = strip_markdown_link(cells[columns["code"]])
        rows.append((code, cells[columns["status"]]))
    return tuple(rows)


def _is_done(status: str) -> bool:
    return status.strip().casefold().endswith("done")


def _relative(path: Path, project_root: Path) -> str:
    return path.resolve().relative_to(project_root).as_posix()
