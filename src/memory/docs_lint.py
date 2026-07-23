"""Link and anchor integrity checker for the project's markdown documentation.

Scans every ``*.md`` file in the repository for relative file links and
in-document/cross-document anchor links, verifying that:

- every relative file target actually exists on disk;
- every ``#anchor`` resolves to a real heading in the target file, using the
  same slug algorithm GitHub applies to render heading ids (lowercase,
  ``[a-z0-9 _-]`` kept, everything else stripped, spaces become hyphens,
  duplicate headings get a numeric suffix).

Deliberately network-free and deterministic: it never checks external
(``http``/``https``) links, only repo-relative ones. External-link liveness
is flaky and rate-limited, and is a non-goal (see the "Testing" section of
docs/process/engineering-principles.md).

Also checks a second, unrelated invariant that happens to share this CI job:
``docs/project/roadmap/**/index.md`` heading uniqueness. Two roadmap packages
must never claim the same ``# <code> — title`` heading code -- that is the
static, pre-runtime guard for the "one code -> one package" invariant Ariad's
Expand depends on (``memory.builder.story_paths.resolve_story_directory``),
closing the class of defect first seen as CR048 (DS6.TS5) and recurring as
CV22.DS7 (see ``handoff-ariad-fix.MD`` / ``plan-ariad-fix.md``).

Used by ``scripts/check_doc_links.py`` (CLI) and the ``docs`` CI workflow.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from memory.builder.story_paths import find_duplicate_roadmap_headings

_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
_HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.MULTILINE)
_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
_SLUG_STRIP_RE = re.compile(r"[^a-z0-9 _\-]")

_EXCLUDED_DIR_NAMES = {"node_modules", ".venv", "__pycache__"}

# roadmap/templates/*.md link to a bare `index.md` as a breadcrumb meant to
# resolve once the template is copied into a real story folder -- templates/
# itself has no index.md, by design. Not a broken link.
_TEMPLATE_DIR_MARKER = "/roadmap/templates/"


@dataclass(frozen=True)
class BrokenLink:
    """One link or anchor that does not resolve."""

    source_file: str
    line: int
    target: str
    reason: str


@dataclass(frozen=True)
class DuplicateRoadmapHeading:
    """Two or more roadmap ``index.md`` files whose heading claims the same code."""

    code: str
    paths: tuple[str, ...]


def slugify(heading: str) -> str:
    """Reproduce GitHub's heading-to-anchor-id algorithm.

    Lowercase, strip everything except letters/digits/spaces/underscores/
    hyphens (existing hyphens and underscores are preserved -- a heading
    like ``MEMORY_LOG_LLM_CALLS`` slugs to ``memory_log_llm_calls``, not
    ``memory-log-llm-calls``), then replace spaces with hyphens. Repeated
    hyphens are never collapsed, matching GitHub's real behavior.
    """
    lowered = heading.lower()
    stripped = _SLUG_STRIP_RE.sub("", lowered)
    return stripped.replace(" ", "-")


def strip_fenced_code(text: str) -> str:
    """Blank out fenced code blocks so link-like text inside ``` ``` is
    never scanned, while preserving line count exactly -- so any problem
    reported after a fence still points at the real source line.
    """

    def _blank(match: re.Match[str]) -> str:
        return "\n" * match.group(0).count("\n")

    return _FENCE_RE.sub(_blank, text)


def extract_headings(text: str) -> list[str]:
    """Return every Markdown heading's text, in document order."""
    return [m.group(1) for m in _HEADING_RE.finditer(text)]


def compute_anchors(text: str) -> set[str]:
    """Return every valid anchor id reachable in this document.

    Duplicate heading text is suffixed ``-1``, ``-2``, ... in encounter
    order, matching GitHub's disambiguation for repeated headings.
    """
    anchors: set[str] = set()
    seen_counts: dict[str, int] = {}
    for heading in extract_headings(text):
        base = slugify(heading)
        count = seen_counts.get(base, -1) + 1
        seen_counts[base] = count
        anchors.add(base if count == 0 else f"{base}-{count}")
    return anchors


def _is_template_placeholder(source_file: Path, target_path: str) -> bool:
    return _TEMPLATE_DIR_MARKER in source_file.as_posix() and target_path == "index.md"


def _iter_markdown_files(repo_root: Path) -> list[Path]:
    files = [
        path
        for path in repo_root.rglob("*.md")
        if not any(part in _EXCLUDED_DIR_NAMES for part in path.parts)
    ]
    return sorted(files)


def _line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def check_file(source_file: Path, repo_root: Path) -> list[BrokenLink]:
    """Check every relative/anchor link in one markdown file."""
    raw = source_file.read_text(encoding="utf-8")
    scanned = strip_fenced_code(raw)
    own_anchors: set[str] | None = None
    problems: list[BrokenLink] = []
    rel_source = source_file.relative_to(repo_root).as_posix()

    for match in _LINK_RE.finditer(scanned):
        link = match.group(1).strip()
        if link.startswith(("http://", "https://", "mailto:")):
            continue
        line = _line_of(scanned, match.start())

        if link.startswith("#"):
            if own_anchors is None:
                own_anchors = compute_anchors(raw)
            if link[1:] not in own_anchors:
                problems.append(BrokenLink(rel_source, line, link, "anchor not found in this file"))
            continue

        path_part, _, anchor_part = link.partition("#")
        if _is_template_placeholder(source_file, path_part):
            continue

        target = Path(os.path.normpath(source_file.parent / path_part))
        if not target.exists():
            problems.append(BrokenLink(rel_source, line, link, "target file does not exist"))
            continue

        if anchor_part and target.suffix == ".md":
            target_anchors = compute_anchors(target.read_text(encoding="utf-8"))
            if anchor_part not in target_anchors:
                problems.append(
                    BrokenLink(rel_source, line, link, "anchor not found in target file")
                )

    return problems


def check_repo(repo_root: Path) -> list[BrokenLink]:
    """Check every markdown file in the repository. Deterministic order."""
    problems: list[BrokenLink] = []
    for md_file in _iter_markdown_files(repo_root):
        problems.extend(check_file(md_file, repo_root))
    return problems


def check_roadmap_duplicate_headings(repo_root: Path) -> list[DuplicateRoadmapHeading]:
    """Check ``docs/project/roadmap`` for two ``index.md`` files sharing a heading code.

    Deterministic, sorted order (by code, then by path) for stable CI output.
    Returns an empty list when the roadmap directory does not exist or every
    code is unique. Resolves ``repo_root`` before computing relative paths --
    ``find_duplicate_roadmap_headings`` returns already-resolved directories
    internally, so an unresolved ``repo_root`` (e.g. containing a symlink,
    ``..``, or a relative path) would otherwise fail ``Path.relative_to``.
    """
    resolved_root = repo_root.resolve()
    duplicates = find_duplicate_roadmap_headings(repo_root)
    return [
        DuplicateRoadmapHeading(
            code=code,
            paths=tuple(
                sorted(str((path / "index.md").relative_to(resolved_root)) for path in paths)
            ),
        )
        for code, paths in sorted(duplicates.items())
    ]
