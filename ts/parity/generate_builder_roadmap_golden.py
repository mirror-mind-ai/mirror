"""Generate the Builder roadmap-parsing fixture tree and golden (CV22.DS7.US8 plateau 1).

`build pull-candidates`, `build load`'s home path, Expand's package resolution,
and the Done preflight all read the SAME thing: a tree of
`docs/project/roadmap/**/index.md` files authored by humans. This generator
commits a synthetic tree and records what Python's parsers say about it, so the
TypeScript port is proven against authored Markdown rather than against a
paraphrase of it.

Synthetic and not the real roadmap, deliberately: the real tree changes every
time this project plans anything, and a golden that moves with the docs proves
nothing. More importantly, the real tree does not currently contain the edge
cases that break a port — it is one directory name away from several of them.

What the tree is built to break:

  * **`sorted(rglob("index.md"))` sorts Path objects, not strings.** Python
    compares path COMPONENT lists, so `a/b` precedes `a-x/c`; a JavaScript
    `paths.sort()` over joined strings puts `a-x/c` first, because `-` (0x2D)
    sorts before `/` (0x2F). Candidate order decides `_recommend`, which is the
    Navigator-facing "recommended next pull" — so a naive sort silently
    recommends a different story. Measured: 3.10 and 3.12 agree with each
    other, and on the real 352-file tree the two orders happen to coincide
    today, which is exactly why the collision is staged here instead of being
    left to an accident of directory naming.
  * **Three snapshot grammars with precedence.** `_cv_table_items` wins over
    `_ds_table_items`, which wins over `_cv_heading_items`. A file carrying two
    grammars must return the first one, so the fixtures include one that
    carries all three.
  * **The DS table accumulates across `## Chapter N —` sections** while the CV
    table stops at the first non-table line. Same shape, different termination.
  * **`legacy/` is excluded** from every scan, by path component.
  * **`done.md` is inherited.** `_has_done_artifact` walks up to the roadmap
    root, so a child package with no `done.md` of its own is still filtered out
    when an ANCESTOR has one.
  * **Duplicate heading codes raise.** Two packages claiming one code is
    `StoryPackageAmbiguityError`, and the message lists both paths.
  * **`Candidate Delivery Stories:` bullets chain the CV title** into
    `"<CV title> / <DS title>"`, which is where the `/` convention that split
    this story's own title comes from.
  * **`**Type:**` decides the level** by substring (`technical` / `user`),
    falling back to `.DS` in the code or the bare `DS-\\d+` form.
  * **Heading codes accept both an em dash and a hyphen** as the separator, and
    Markdown-link cells must be unwrapped to their label.
  * **Path confinement.** `create_story_directory` derives a folder from a
    caller-supplied code and title; `../`, an absolute-looking title, and a
    title that is only `/` must not escape the roadmap root.

Run:  uv run python ts/parity/generate_builder_roadmap_golden.py
"""

from __future__ import annotations

import json
import shutil
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

from memory.builder.pull_candidates import (
    inspect_pull_candidates,
    inspect_roadmap_snapshot,
    render_project_position_report,
    render_pull_candidates_report,
    render_roadmap_snapshot_report,
)
from memory.builder.roadmap_grammar import HEADING_RE as _HEADING_RE
from memory.builder.roadmap_grammar import STATUS_RE as _STATUS_RE
from memory.builder.roadmap_grammar import strip_markdown_link as _strip_markdown_link
from memory.builder.roadmap_position import resolve_roadmap_position
from memory.builder.story_paths import (
    create_story_directory,
    find_duplicate_roadmap_headings,
    resolve_story_directory,
    story_folder_name,
    title_leaf,
)

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent / "test" / "fixtures" / "builder-roadmap"
OUT_PATH = HERE.parent / "test" / "goldens" / "builder-roadmap.golden.json"

# --- The fixture trees ----------------------------------------------------
# Each project is a separate root so a parser question can be asked in
# isolation; `main` is the one that carries the realistic mixture.

PROJECTS: dict[str, dict[str, str]] = {}

# `main`: CV table snapshot grammar, nested DS/US/TS packages, a legacy archive,
# a done-filtered subtree, and the hyphen-vs-slash sort collision.
PROJECTS["main"] = {
    "docs/project/roadmap/index.md": """# Roadmap

The compact snapshot. Parsed by `_cv_table_items`.

| Code | Capability Value | Status |
|------|------------------|--------|
| [CV1](cv1-first-value/index.md) | [First value](cv1-first-value/index.md) | ✅ Done |
| CV2 | Second value | 🟢 Active |
| CV3 | Third value | 🟡 Planned |

Text after the table stops the CV scan.

| Code | Delivery Story | Status |
|------|----------------|--------|
| CV9.DS1 | Never read, the CV table won | 🟡 Planned |
""",
    # Done at the CV level: every descendant is filtered, even those whose own
    # status is Planned and which have no done.md of their own.
    "docs/project/roadmap/cv1-first-value/index.md": """# CV1 — First value

**Status:** ✅ Done
**Type:** Capability Value
""",
    "docs/project/roadmap/cv1-first-value/done.md": "Closed.\n",
    "docs/project/roadmap/cv1-first-value/cv1-ds1-inherits-done/index.md": """# CV1.DS1 — Inherits done from its parent

**Status:** 🟡 Planned
""",
    "docs/project/roadmap/cv2-second-value/index.md": """# CV2 — Second value

**Status:** 🟢 Active
""",
    # The sort collision: `cv2-ds1-alpha/cv2-ds1-us1-child` vs
    # `cv2-ds1-alpha-extra`. Path order puts the nested child first; a string
    # sort over joined paths puts `-extra` first.
    "docs/project/roadmap/cv2-second-value/cv2-ds1-alpha/index.md": """# CV2.DS1 — Alpha delivery

**Status:** 🟡 Planned
**Type:** Delivery Story
""",
    "docs/project/roadmap/cv2-second-value/cv2-ds1-alpha/cv2-ds1-us1-child/index.md": """# CV2.DS1.US1 — Child user story

**Status:** 🟡 Planned
**Type:** User Story
""",
    "docs/project/roadmap/cv2-second-value/cv2-ds1-alpha-extra/index.md": """# CV2.DS2 — Alpha extra, sorts differently as a string

**Status:** 🟡 Planned
**Type:** Technical Story
""",
    # Hyphen instead of an em dash in the heading separator.
    "docs/project/roadmap/cv2-second-value/cv2-ds3-hyphen/index.md": """# CV2.DS3 - Hyphen separator in the heading

**Status:** 🟡 Planned
**Type:** User Story
""",
    # Blocked and Active statuses, to exercise `_recommend`'s status order.
    "docs/project/roadmap/cv2-second-value/cv2-ds4-blocked/index.md": """# CV2.DS4 — Blocked delivery

**Status:** 🔴 Blocked on an external decision
**Type:** Delivery Story
""",
    # Not a candidate at all: no CANDIDATE_STATUSES marker in the status text.
    "docs/project/roadmap/cv3-third-value/index.md": """# CV3 — Third value

**Status:** 💤 Dormant
""",
    # Excluded by path component, despite being a perfectly good candidate.
    "docs/project/roadmap/legacy/cv0-retired/index.md": """# CV0 — Retired value

**Status:** 🟡 Planned
**Type:** User Story
""",
    # Not an index.md: never scanned.
    "docs/project/roadmap/cv2-second-value/cv2-ds1-alpha/plan.md": """# CV2.DS1 — Alpha delivery

**Status:** 🟡 Planned
""",
}

# `ds_grammar`: the DS table, accumulating across chapters, with the CV table
# absent so precedence falls through to it.
PROJECTS["ds_grammar"] = {
    "docs/project/roadmap/index.md": """# Delivery Roadmap

## Chapter 1 — Foundations

| Code | Delivery Story | Status |
|------|----------------|--------|
| DS-1 | [Bootstrap](ds-1-bootstrap/index.md) | ✅ Done |
| DS-2 | Second story | 🟢 Active |

Prose between chapters terminates the table but not the accumulation.

## Chapter 2 — Convergence

| Code | Delivery Story | Status |
|------|----------------|--------|
| DS-35 | Bare top-level DS code | 🟡 Planned |
| DS-35.US-1 | Hyphenated child code | 🟡 Planned |
""",
    "docs/project/roadmap/ds-35-bare/index.md": """# DS-35 — Bare top-level DS code

**Status:** 🟡 Planned
""",
}

# `heading_grammar`: no tables at all, so the scan falls through to
# `_cv_heading_items`, including its `Candidate Delivery Stories:` bullets.
PROJECTS["heading_grammar"] = {
    "docs/project/roadmap/index.md": """# Roadmap

## CV1: Heading grammar value

**Status:** 🟢 Active

Candidate Delivery Stories:

- DS1 First candidate from a bullet
- DS2 Second candidate with a trailing period.
- not a delivery story bullet
- DS3 Third candidate

Prose after the bullets closes the block.

## CV2: Dormant value

**Status:** 💤 Dormant

Candidate Delivery Stories:

- DS1 Filtered out, the CV status is not a candidate status
""",
}

# `ambiguous`: two packages claim CV5.DS1.
PROJECTS["ambiguous"] = {
    "docs/project/roadmap/index.md": "# Roadmap\n\nNo table.\n",
    "docs/project/roadmap/first-claim/index.md": """# CV5.DS1 — First claim

**Status:** 🟡 Planned
""",
    "docs/project/roadmap/second-claim/index.md": """# CV5.DS1 — Second claim

**Status:** 🟡 Planned
""",
}

# `empty`: a roadmap root that exists but holds nothing parseable.
PROJECTS["empty"] = {
    "docs/project/roadmap/index.md": "# Roadmap\n\nNothing here yet.\n",
}

# `precedence`: two questions the other fixtures cannot distinguish, both found
# by mutation testing rather than by reading.
#
#   * The CV table BREAKS at the first non-table line while the DS table merely
#     leaves table mode. Every other fixture follows its CV table with a DS
#     table, whose header cannot re-enter CV mode, so both rules give the same
#     answer. It takes a SECOND CV table after prose to tell them apart.
#   * `_recommend` loops status-outer, level-inner, so a Planned delivery story
#     beats a Candidate user story. Swapping the loops is invisible unless those
#     two exist together.
PROJECTS["precedence"] = {
    "docs/project/roadmap/index.md": """# Roadmap

| Code | Capability Value | Status |
|------|------------------|--------|
| CV1 | First table value | \U0001f7e2 Active |

Prose between two CV tables. The CV scan must STOP here.

| Code | Capability Value | Status |
|------|------------------|--------|
| CV2 | Second table value, must not be read | \U0001f7e1 Planned |
""",
    # A Candidate user story and a Planned delivery story, competing.
    "docs/project/roadmap/cv1-candidate-user-story/index.md": """# CV1.US1 \u2014 Candidate user story

**Status:** Candidate
**Type:** User Story
""",
    "docs/project/roadmap/cv1-planned-delivery/index.md": """# CV1.DS1 \u2014 Planned delivery story

**Status:** \U0001f7e1 Planned
**Type:** Delivery Story
""",
}

# `dialect`: the regex-dialect traps, one package each. These exist because a
# literal transcription of the Python patterns into JavaScript diverges on all
# three, and nothing in the real roadmap currently exercises them.
PROJECTS["dialect"] = {
    "docs/project/roadmap/index.md": "# Roadmap\n\nNo table.\n",
    # U+001F (unit separator) is whitespace to Python's `\s`, not to JavaScript's.
    "docs/project/roadmap/us-separator/index.md": (
        "# CV7.DS1\u001f\u2014\u001fUnit separator around the dash\n\n**Status:** \U0001f7e1 Planned\n"
    ),
    # U+0085 (next line) likewise: Python whitespace, JavaScript not.
    "docs/project/roadmap/nel/index.md": (
        "# CV7.DS2 \u2014 Title then a next-line char\u0085trailing\n\n**Status:** \U0001f7e1 Planned\n"
    ),
    # U+FEFF is whitespace to JavaScript's `\s`, not to Python's.
    "docs/project/roadmap/bom/index.md": (
        "# CV7.DS3 \u2014 Title with a\ufeffbyte order mark\n\n**Status:** \U0001f7e1 Planned\n"
    ),
    # U+2028 (line separator): Python's `.` matches it, JavaScript's does not.
    "docs/project/roadmap/line-separator/index.md": (
        "# CV7.DS4 \u2014 Title with a\u2028line separator\n\n**Status:** \U0001f7e1 Planned\n"
    ),
    # NBSP, which both dialects agree is whitespace.
    "docs/project/roadmap/nbsp/index.md": (
        "# CV7.DS5 \u2014 Title with a\u00a0non breaking space\n\n**Status:** \U0001f7e1 Planned\n"
    ),
    # A status line padded with an ideographic space.
    "docs/project/roadmap/ideographic/index.md": (
        "# CV7.DS6 \u2014 Ideographic padding\n\n**Status:**\u3000\U0001f7e1 Planned\u3000\n"
    ),
    # A heading whose title cell is a whole Markdown link, and a status carrying
    # Markdown emphasis.
    "docs/project/roadmap/linked/index.md": (
        "# CV7.DS7 \u2014 [Linked title](../index.md)\n\n"
        "**Status:** **\U0001f7e1 Planned** with emphasis\n"
    ),
    # CRLF line endings throughout.
    "docs/project/roadmap/crlf/index.md": (
        "# CV7.DS8 \u2014 CRLF endings\r\n\r\n**Status:** \U0001f7e1 Planned\r\n"
    ),
}

# `no_roadmap`: a project with no roadmap directory at all.
PROJECTS["no_roadmap"] = {
    "README.md": "# A project with no roadmap tree\n",
}


def write_fixtures() -> None:
    if FIXTURES.exists():
        shutil.rmtree(FIXTURES)
    for project, files in PROJECTS.items():
        for relative, content in files.items():
            target = FIXTURES / project / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")


def _plain(value: Any) -> Any:
    if is_dataclass(value) and not isinstance(value, type):
        return {key: _plain(item) for key, item in asdict(value).items()}
    if isinstance(value, (list, tuple)):
        return [_plain(item) for item in value]
    if isinstance(value, Path):
        return value.as_posix()
    return value


def _record(name: str, kind: str, payload: dict[str, Any], produce) -> dict[str, Any]:
    scenario: dict[str, Any] = {"name": name, "kind": kind, "input": payload}
    try:
        scenario["expected"] = _plain(produce())
    except Exception as exc:
        scenario["expected_error"] = f"{type(exc).__name__}: {exc}"
    return scenario


def build_scenarios() -> list[dict[str, Any]]:
    scenarios: list[dict[str, Any]] = []
    projects = [*PROJECTS, "missing_entirely"]

    for project in projects:
        root = FIXTURES / project
        path_arg: Path | None = root if project != "missing_entirely" else None

        scenarios.append(
            _record(
                f"snapshot__{project}",
                "roadmap_snapshot",
                {"project": project},
                lambda p=path_arg: inspect_roadmap_snapshot(p, journey="j", method="ariad"),
            )
        )
        scenarios.append(
            _record(
                f"candidates__{project}",
                "pull_candidates",
                {"project": project},
                lambda p=path_arg: inspect_pull_candidates(p, journey="j", method="ariad"),
            )
        )
        scenarios.append(
            _record(
                f"position__{project}",
                "roadmap_position",
                {"project": project},
                lambda p=path_arg: resolve_roadmap_position(p),
            )
        )
        scenarios.append(
            _record(
                f"duplicates__{project}",
                "duplicate_headings",
                {"project": project},
                lambda p=root: {
                    code: [path.relative_to(p).as_posix() for path in paths]
                    for code, paths in find_duplicate_roadmap_headings(p).items()
                },
            )
        )

        # The three rendered surfaces, byte for byte.
        snapshot = inspect_roadmap_snapshot(path_arg, journey="j", method="ariad")
        candidates = inspect_pull_candidates(path_arg, journey="j", method="ariad")
        scenarios.append(
            _record(
                f"render_snapshot__{project}",
                "render_roadmap_snapshot",
                {"project": project},
                lambda s=snapshot, c=candidates: render_roadmap_snapshot_report(
                    s, candidates=c.candidates
                ),
            )
        )
        scenarios.append(
            _record(
                f"render_candidates__{project}",
                "render_pull_candidates",
                {"project": project},
                lambda c=candidates: render_pull_candidates_report(c),
            )
        )
        scenarios.append(
            _record(
                f"render_position__{project}",
                "render_project_position",
                {"project": project, "just_moved": None},
                lambda s=snapshot, c=candidates: render_project_position_report(
                    s, candidates=c.candidates
                ),
            )
        )
        scenarios.append(
            _record(
                f"render_position_moved__{project}",
                "render_project_position",
                {"project": project, "just_moved": "CV2.DS1 reached Done"},
                lambda s=snapshot, c=candidates: render_project_position_report(
                    s, candidates=c.candidates, just_moved="CV2.DS1 reached Done"
                ),
            )
        )

    # --- resolve_story_directory ------------------------------------------
    resolve_cases = [
        ("main", "CV2.DS1"),
        ("main", "CV2.DS1.US1"),
        ("main", "CV2.DS2"),
        ("main", "CV1"),
        ("main", "CV0"),  # legacy-only: excluded, so unresolvable
        ("main", "NOPE.1"),
        ("ambiguous", "CV5.DS1"),
        ("no_roadmap", "CV1"),
    ]
    for project, code in resolve_cases:
        scenarios.append(
            _record(
                f"resolve__{project}__{code}",
                "resolve_story_directory",
                {"project": project, "code": code},
                lambda p=FIXTURES / project, c=code: (
                    resolved.relative_to(p).as_posix()
                    if (resolved := resolve_story_directory(p, c)) is not None
                    else None
                ),
            )
        )

    # --- create_story_directory, including the confinement matrix ----------
    create_cases = [
        ("main", "CV2.DS1.US2", "A brand new user story"),
        ("main", "CV2.DS5", "New delivery under an active CV"),
        ("main", "CV4.DS1", "Parent CV has no package at all"),
        ("main", "CV2.DS1.US3", "Chained title / with a leaf segment"),
        ("main", "CV2.DS1.US4", "   "),
        ("main", "CV2.DS1.US5", "/"),
        # Confinement: a code or title that tries to climb out.
        ("main", "../escape", "Escaping code"),
        ("main", "CV2.DS1.US6", "../../escape"),
        ("main", "CV2.DS1.US7", "/etc/passwd"),
        ("main", "..", "Bare dotdot code"),
        ("main", "CV2/DS9", "Slash inside the code"),
        ("empty", "CV1.DS1", "First package in an empty roadmap"),
    ]
    for project, code, title in create_cases:
        scenarios.append(
            _record(
                f"create__{project}__{code}__{title.strip() or 'blank'}",
                "create_story_directory",
                {"project": project, "code": code, "leaf_title": title},
                lambda p=FIXTURES / project, c=code, t=title: (
                    create_story_directory(p, c, t).relative_to(p).as_posix()
                ),
            )
        )

    # --- pure helpers ------------------------------------------------------
    # --- grammar primitives, exercised directly on strings -----------------
    grammar_cases = [
        ("em_dash", "# CV1.DS1 \u2014 Title\n"),
        ("hyphen", "# CV1.DS1 - Title\n"),
        ("en_dash_unsupported", "# CV1.DS1 \u2013 Title\n"),
        ("suffix_letter", "# CV21.E2.S1b \u2014 Split story\n"),
        ("hyphenated_child", "# DS-35.US-1 \u2014 Child\n"),
        ("unit_separator", "# CV1.DS1\u001f\u2014\u001fTitle\n"),
        ("next_line_char", "# CV1.DS1 \u2014 Title\u0085more\n"),
        ("bom_in_title", "# CV1.DS1 \u2014 Title\ufeffmore\n"),
        ("line_separator", "# CV1.DS1 \u2014 Title\u2028more\n"),
        ("nbsp", "# CV1.DS1 \u2014 Title\u00a0more\n"),
        ("crlf", "# CV1.DS1 \u2014 Title\r\n"),
        ("not_first_line", "Prose\n\n# CV1.DS1 \u2014 Title\n"),
        ("two_headings", "# CV1 \u2014 First\n\n# CV2 \u2014 Second\n"),
        ("deeper_hash", "## CV1.DS1 \u2014 Not a level one heading\n"),
        ("no_heading", "Just prose.\n"),
    ]
    for name, content in grammar_cases:
        scenarios.append(
            _record(
                f"heading__{name}",
                "match_heading",
                {"content": content},
                lambda c=content: (
                    {"code": m.group("code"), "title": m.group("title")}
                    if (m := _HEADING_RE.search(c))
                    else None
                ),
            )
        )

    status_cases = [
        ("plain", "**Status:** \U0001f7e1 Planned\n"),
        ("emphasis", "**Status:** **\U0001f7e1 Planned** with emphasis\n"),
        ("ideographic_padding", "**Status:**\u3000\U0001f7e1 Planned\u3000\n"),
        ("unit_separator", "**Status:**\u001f\U0001f7e1 Planned\u001f\n"),
        ("bom_padding", "**Status:**\ufeff\U0001f7e1 Planned\ufeff\n"),
        ("line_separator", "**Status:** Planned\u2028Active\n"),
        ("crlf", "**Status:** \U0001f7e1 Planned\r\n"),
        ("multiline_first_wins", "**Status:** First\n**Status:** Second\n"),
        ("absent", "No status here.\n"),
    ]
    for name, content in status_cases:
        scenarios.append(
            _record(
                f"status__{name}",
                "match_status",
                {"content": content},
                lambda c=content: m.group("status") if (m := _STATUS_RE.search(c)) else None,
            )
        )

    link_cases = [
        "[label](target.md)",
        "  [padded](target.md)  ",
        "prose [label](target.md) prose",
        "[label](target.md) trailing",
        "[](empty-label.md)",
        "[label]()",
        "[nested [brackets]](t.md)",
        "plain value",
        "",
        "\u3000[ideographic padded](t.md)\u3000",
        "\ufeff[bom padded](t.md)\ufeff",
    ]
    for value in link_cases:
        scenarios.append(
            _record(
                f"link__{value.strip() or 'blank'}",
                "strip_markdown_link",
                {"value": value},
                lambda v=value: _strip_markdown_link(v),
            )
        )

    title_cases = [
        "plain title",
        "CV title / DS title",
        "Builder/Ariad tree",
        "a / b / c",
        "  padded  ",
        "/",
        "",
        "trailing/",
        "/leading",
    ]
    for title in title_cases:
        scenarios.append(
            _record(
                f"title_leaf__{title.strip() or 'blank'}",
                "title_leaf",
                {"title": title},
                lambda t=title: title_leaf(t),
            )
        )

    folder_cases = [
        ("CV2.DS1.US1", "A user story"),
        ("DS-35", "Hyphenated code"),
        ("CV2.DS1", ""),
        ("CV2.DS1", "   "),
        ("../escape", "Escaping"),
        ("CV2/DS9", "Slashed code"),
        ("..", "Dotdot"),
        ("CV1", "Título com acentuação e emoji 🟦"),
        ("CV1", "Punctuation: colons, commas — and dashes!"),
    ]
    for code, title in folder_cases:
        scenarios.append(
            _record(
                f"folder__{code}__{title.strip() or 'blank'}",
                "story_folder_name",
                {"code": code, "title": title},
                lambda c=code, t=title: story_folder_name(c, t),
            )
        )

    return scenarios


def main() -> None:
    write_fixtures()
    scenarios = build_scenarios()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"scenarios": scenarios}, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    produced = sum(1 for s in scenarios if "expected" in s)
    refused = sum(1 for s in scenarios if "expected_error" in s)
    files = sum(len(files) for files in PROJECTS.values())
    print(f"{len(scenarios)} scenarios: {produced} produced, {refused} refused")
    print(f"{files} fixture files across {len(PROJECTS)} projects")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")
    print(f"wrote {FIXTURES.relative_to(HERE.parent.parent)}/")


if __name__ == "__main__":
    main()
