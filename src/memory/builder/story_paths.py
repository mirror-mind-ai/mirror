"""Shared resolve-then-create path logic for Builder roadmap story packages.

Both Ariad Expand (``lifecycle.expand_delivery_story``) and the CLI's Plan /
checkpoint artifact-path lookups (``cli.build._canonical_package_path``) need
to answer the same question: given a roadmap item code, where does its
authored ``index.md`` package live on disk?

The single source of truth for an EXISTING package is its own heading
(``# <code> — <title>``), never a folder-naming convention or arithmetic on
the code+title -- an authored package can live under any folder name a human
chose; what makes it "CV2.DS1" is its heading, exactly as
``pull_candidates.py`` already resolves Pull candidates. ``resolve_story_directory``
is the one resolver every call site shares, so they can never diverge again.
This is the actual fix for the class of defect first seen as CR048 (DS6.TS5)
and recurring as CV22.DS7: Expand used to *derive* a path from code+title
arithmetic instead of resolving the real, already-authored package.

Creating a brand-new package (``create_story_directory``) is a different,
lower-stakes concern: since nothing is authored yet for that code, a new path
cannot diverge from or duplicate anything. Naming a not-yet-materialized
parent coordinate degrades gracefully -- resolve it if it already has a
package, else name it from the root roadmap snapshot
(``docs/project/roadmap/index.md``, which is the intentional planning record
for CVs before they have their own folder), else fall back to a bare code
segment. This never fails loud, and it never uses "/"-joined title-chain
arithmetic across code levels -- the previous design's other defect, since
the delivery cursor only ever carries a story's own leaf title, never a full
ancestor-title chain.
"""

from __future__ import annotations

from pathlib import Path

from memory.builder.pull_candidates import inspect_roadmap_snapshot
from memory.builder.roadmap_grammar import HEADING_RE, is_legacy_path
from memory.utils import kebab_slug


class StoryPackageAmbiguityError(ValueError):
    """More than one roadmap package's heading claims the same code."""


def title_leaf(title: str) -> str:
    """Return the final ``/``-separated segment of a title, trimmed.

    Roadmap titles are sometimes given as a full ancestor chain (``"CV title
    / DS title"``); this extracts just the item's own leaf segment. A plain,
    non-chain title passes through unchanged.
    """
    return title.split("/")[-1].strip()


def _sanitize_code_segment(code: str) -> str:
    """Filesystem-safe rendering of a work-item code for folder derivation.

    Dots are the code's own level separator (``CV2.DS1``), so they convert to
    hyphens first, preserving the existing folder-naming convention for
    well-formed codes unchanged. Everything else routes through
    ``kebab_slug`` -- the same sanitizer already applied to titles -- so an
    unsanitized ``/`` or ``..`` surviving in a candidate-table code cell
    (Navigator- or LLM-authored, unlike a folder-name title) can no longer
    create unintended nested directories within the roadmap tree (closes
    D-012).
    """
    return kebab_slug(code.replace(".", "-"))


def story_folder_name(code: str, title: str) -> str:
    """Canonical folder name for a story: ``<code>-<title-slug>``."""
    code_part = _sanitize_code_segment(code)
    slug = kebab_slug(title)
    return f"{code_part}-{slug}" if slug else code_part


def resolve_story_directory(project_path: Path, code: str) -> Path | None:
    """Return the directory of the authored package whose ``index.md``
    heading code equals ``code`` exactly, or ``None`` if no package claims it.

    Raises ``StoryPackageAmbiguityError`` if more than one package does -- the
    roadmap-integrity CI guard (duplicate-heading check, see
    ``find_duplicate_roadmap_headings`` and ``docs_lint.py``) exists precisely
    to catch this before it ever reaches runtime resolution.
    """
    roadmap_root = (project_path / "docs" / "project" / "roadmap").resolve()
    if not roadmap_root.is_dir():
        return None
    matches = _group_roadmap_headings(roadmap_root).get(code, [])
    if not matches:
        return None
    if len(matches) > 1:
        raise StoryPackageAmbiguityError(
            f"{len(matches)} roadmap packages claim code {code!r}: "
            + ", ".join(str(path) for path in matches)
        )
    return matches[0]


def _group_roadmap_headings(roadmap_root: Path) -> dict[str, list[Path]]:
    """Group every non-legacy ``docs/**/index.md`` file under a code by its
    own heading (``# <code> — <title>``). Shared scan used by both
    ``resolve_story_directory`` (single-code lookup) and
    ``find_duplicate_roadmap_headings`` (whole-tree duplicate detection) so
    the two can never drift apart.
    """
    by_code: dict[str, list[Path]] = {}
    for index_path in sorted(roadmap_root.rglob("index.md")):
        if is_legacy_path(index_path, roadmap_root):
            continue
        try:
            content = index_path.read_text(encoding="utf-8")
        except OSError:
            continue
        heading = HEADING_RE.search(content)
        if heading:
            by_code.setdefault(heading.group("code").strip(), []).append(index_path.parent)
    return by_code


def find_duplicate_roadmap_headings(project_path: Path) -> dict[str, tuple[Path, ...]]:
    """Return every code claimed by more than one ``docs/project/roadmap/**/index.md``
    heading, mapped to its claiming directories.

    This is the CI-facing, whole-tree counterpart to ``resolve_story_directory``'s
    per-code ambiguity guard -- the static check (see ``docs_lint.py``) that keeps
    the "one code -> one package" invariant from ever silently breaking again
    (the class of defect first seen as CR048 / DS6.TS5, recurring as CV22.DS7).
    Returns an empty dict when the roadmap root does not exist or every code is
    unique.
    """
    roadmap_root = (project_path / "docs" / "project" / "roadmap").resolve()
    if not roadmap_root.is_dir():
        return {}
    grouped = _group_roadmap_headings(roadmap_root)
    return {code: tuple(paths) for code, paths in grouped.items() if len(paths) > 1}


def _parent_code(code: str) -> str | None:
    """``'CV2.DS1'`` -> ``'CV2'``; ``'DS-35'`` -> ``None`` (no dotted parent)."""
    if "." not in code:
        return None
    return code.rsplit(".", 1)[0]


def _bare_code_segment(code: str) -> str:
    return _sanitize_code_segment(code)


def _snapshot_title(project_path: Path, code: str) -> str | None:
    """Best-effort title for ``code`` from the root roadmap index's own
    compact snapshot (handles both the legacy CV-heading grammar and the
    CV/DS table grammar -- see ``pull_candidates._snapshot_items_from_content``).
    Used only to NAME a not-yet-materialized parent coordinate; never used to
    decide where an EXISTING package lives (that is always
    ``resolve_story_directory``).
    """
    snapshot = inspect_roadmap_snapshot(project_path, journey="", method="ariad")
    for item in snapshot.items:
        if item.code == code:
            return item.title
    return None


def _parent_directory(project_path: Path, code: str) -> Path:
    """Best available directory to nest a NEW ``code`` under: resolve an
    existing authored package by heading; else name it from the root roadmap
    snapshot; else recurse to the grandparent and fall back to a bare code
    segment. Never fails loud -- nothing is authored yet for ``code``, so
    nothing can diverge; this only affects the readability of a brand-new
    folder name, never correctness or safety.
    """
    resolved = resolve_story_directory(project_path, code)
    if resolved is not None:
        return resolved
    roadmap_root = (project_path / "docs" / "project" / "roadmap").resolve()
    parent = _parent_code(code)
    base = roadmap_root if parent is None else _parent_directory(project_path, parent)
    title = _snapshot_title(project_path, code)
    folder = story_folder_name(code, title) if title else _bare_code_segment(code)
    return base / folder


def create_story_directory(project_path: Path, code: str, leaf_title: str) -> Path:
    """Canonical directory for a NEW package, nested under its best-available
    parent coordinate. Only the story's own leaf title slugs its own folder
    name -- title chains are never used for arithmetic across code levels.
    """
    roadmap_root = (project_path / "docs" / "project" / "roadmap").resolve()
    parent = _parent_code(code)
    base = roadmap_root if parent is None else _parent_directory(project_path, parent)
    target = (base / story_folder_name(code, title_leaf(leaf_title))).resolve()
    if not target.is_relative_to(roadmap_root):
        raise ValueError(f"story directory escapes roadmap root: {target}")
    return target
