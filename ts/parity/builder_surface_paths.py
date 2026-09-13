"""Machine-independent recording of Builder surfaces that print filesystem paths.

Shared by `generate_builder_lifecycle_golden.py` (function level) and
`generate_builder_command_golden.py` (command level), because both grade the same
surfaces and the rule must not drift between them.

The problem this solves, measured at CV22.DS7.US8 plateau 3:

`story_paths` resolves the roadmap root to an ABSOLUTE path deliberately --
`create_story_directory`'s escape guard is `target.is_relative_to(roadmap_root)`,
which is only sound on absolutes. Two Ariad surfaces then print those paths raw:
`plan_checkpoint` (`story package`, `artifacts`, and the `*_path=` trailer) and
`expand_decision` / `expand_blocked` (`materialized`, `why blocked`). Every other
artifact surface relativizes through `artifact_surfaces._display_path`.

So those regions are machine-dependent, and the obvious repair does not work: the
paths are WRAPPED at 52 or 54 code points by `_card_prefixed` / `_card_wrapped`,
so the absolute prefix's length decides where each chunk boundary falls. A token
substitution matches nothing in
`\u2502 /private/var/folders/5k/q6bjkgn95gzd_qss7_5flyzw0000gp \u2502` -- a truncated prefix
of the root -- and even a successful match would leave machine-dependent
continuation rows.

Two rules, applied at record time:

- `normalize_path_rows` collapses a run of card rows that render an ABSOLUTE path
  into ONE stable token row, preserving the run's first list marker.
- `scrub_message` rewrites absolute paths inside refusal messages, which carry
  them untruncated and can therefore be substituted exactly.

A run is recognized by its FIRST row starting with `/`, and that detail is
load-bearing. The first version asked only whether a row's text was a fragment of
some absolute path, which is also true of every RELATIVIZED row -- `docs/project/…`
is a substring of `/abs/prefix/project/docs/project/…`. It therefore collapsed the
`artifacts_materialized` rows too, erasing content that is machine-independent and
must stay graded byte for byte. Only a row that begins the absolute path can open a
run; relative rows are left exactly as Python printed them.

What remains graded, and why it is enough: the path CONTENT is graded exactly in
each step's structured project-relative fields; the WRAPPING mechanism is graded
exhaustively by `builder-card` (516 rows, including over-long words chunked at 52
and 54); `artifacts_materialized` renders the same paths relativized and is graded
whole; and every other byte of the affected surfaces -- block order, labels,
framing, markers -- is still compared byte for byte.
"""

from __future__ import annotations

import re
from pathlib import Path

PATH_ROW_TOKEN = "<ABSOLUTE PATH>"
OUTSIDE_TOKEN = "<OUTSIDE PROJECT>"

# The list markers `_card_prefixed` can put in front of a wrapped path, plus the
# two-space continuation it uses for a wrapped item's later lines.
_PATH_ROW_MARKERS = ("✓ ", "○ ", "- ", "• ", "✕ ", "✎ ", "↻ ", "  ")
_ABSOLUTE_PATH_RE = re.compile(r"/[^\s,'\"]+")

# Shorter than this, a `/`-leading fragment could still be ordinary content (a card
# could legitimately print `/tmp`), so a run only opens on a long fragment; the
# short final chunk of a wrapped path is captured by the run-continuation clause.
_MIN_STANDALONE_FRAGMENT = 24


def absolute_paths_in(message: str) -> list[str]:
    """Absolute paths embedded in a message, longest first.

    Longest first so replacing a parent directory cannot corrupt a child path that
    shares its prefix.
    """
    found = {match.group(0).rstrip(".") for match in _ABSOLUTE_PATH_RE.finditer(message)}
    return sorted(found, key=len, reverse=True)


def normalize_path_rows(text: str, absolute_paths: list[str]) -> str:
    """Collapse card rows rendering an absolute path into one stable token row."""
    if not absolute_paths:
        return text
    normalized: list[str] = []
    in_run = False
    for line in text.split("\n"):
        fragment, marker = _card_row_content(line)
        if not fragment:
            in_run = False
            normalized.append(line)
            continue
        belongs = any(fragment in path for path in absolute_paths)
        opens_run = (
            fragment.startswith("/") and belongs and len(fragment) >= _MIN_STANDALONE_FRAGMENT
        )
        if opens_run or (in_run and belongs):
            if not in_run:
                normalized.append(f"│ {marker}{PATH_ROW_TOKEN}".ljust(57) + "│")
            in_run = True
            continue
        in_run = False
        normalized.append(line)
    return "\n".join(normalized)


def normalize_trailer_paths(text: str, absolute_paths: list[str], project_root: Path) -> str:
    """Rewrite `key=<absolute path>` trailer lines as project-relative.

    `render_plan_checkpoint` appends `story_package_path=`, `index_artifact_path=`,
    `plan_artifact_path=`, and `test_guide_artifact_path=` AFTER the card, as plain
    lines. Those are unwrapped, so unlike the card rows they can be substituted
    exactly and stay fully graded.
    """
    for absolute in absolute_paths:
        text = text.replace(absolute, project_relative(Path(absolute), project_root))
    return text


def scrub_message(message: str, *, project_root: Path, repo_root: Path | None = None) -> str:
    """Rewrite absolute paths inside a refusal message as relative ones.

    Idempotent on purpose. An earlier version was applied twice to the same message
    -- once at the call site, once while recording -- and the second pass re-matched
    the RELATIVE result (`docs/project/roadmap/…` contains `/project/roadmap/…`) and
    rewrote it to a token, producing `authored package at docs<OUTSIDE PROJECT>`.
    Only candidates under `repo_root` are touched, so a second pass is a no-op and
    an unrelated `/`-prefixed fragment in product text is left alone.
    """
    root = (repo_root or Path.cwd()).resolve()
    project = project_root.resolve()
    for absolute in absolute_paths_in(message):
        if not absolute.startswith(str(root)):
            continue
        candidate = Path(absolute)
        if absolute.startswith(str(project)):
            replacement = project_relative(candidate, project)
        else:
            replacement = f"<REPO>/{candidate.resolve().relative_to(root).as_posix()}"
        message = message.replace(absolute, replacement)
    return message


def project_relative(path: Path, project_root: Path) -> str:
    """Path content in the only form that is machine-independent."""
    resolved = Path(path).resolve()
    root = project_root.resolve()
    if resolved == root:
        return "."
    if not resolved.is_relative_to(root):
        return OUTSIDE_TOKEN
    return resolved.relative_to(root).as_posix()


def _card_row_content(line: str) -> tuple[str, str]:
    """A card row's inner text without its frame and list marker."""
    if not (line.startswith("│ ") and line.endswith("│")):
        return "", ""
    inner = line[2:-1].rstrip()
    for marker in _PATH_ROW_MARKERS:
        if inner.startswith(marker):
            return inner[len(marker) :].strip(), marker
    return inner, ""
