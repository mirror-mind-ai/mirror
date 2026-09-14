"""Generate the `build load` golden (CV22.DS7.US8 plateau 7, Scope G).

`load` is the last leaf and the only one in this story that crosses the provider
seam, so its corpus is built in two halves that fail differently.

**The pure half, here.** `render_builder_mode_transition` and `_extract_query` are
deterministic functions over the journey document, and they carry most of the
divergence risk in the leaf:

* `_extract_query` reads FIVE section names, two of them Portuguese, and slices the
  result to 500 -- which is 500 CODE POINTS in Python and 500 UTF-16 units in a
  naive JavaScript port, so a briefing with emoji or CJK diverges silently and the
  only symptom is a different embedding, hence a differently ordered memories
  block. Cases carry astral characters at the boundary.
* the transition card's `_wrap` does NOT chunk over-long words (it truncates in
  `_line` instead), which is the opposite of the story cards -- the same asymmetry
  `explorer/transition.ts` already records for the Explorer card.
* `_extract_section` has a FALLBACK: when no section matches, it joins every
  non-heading line and slices to 240. A port that returns `None` there renders a
  card with no briefing row, and the row is what a Navigator reads first.
* `_extract_stage` is `re.MULTILINE` with `.+$`, so it stops at the line end and
  keeps interior whitespace before `.strip()`.

**The invocation half** lives in `_load_invocations` and drives the real
`cmd_load` in a subprocess under patched providers -- see that function's
docstring for why the seam is patched rather than replayed.

Run:  uv run python ts/parity/generate_builder_load_golden.py
"""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path
from typing import Any

from memory.cli.build import _extract_query
from memory.surfaces.mode_transition import render_builder_mode_transition

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "builder-load.golden.json"

# A journey document with every feature the extractors look at: a Stage line, a
# Description section, and a heading that terminates capture.
FULL_JOURNEY = """# Mirror TypeScript Core Port
**Status:** active
**Stage:** DS7 — Command Burn-Down (26/27) — next: load

## Description

Dedicated journey to implement CV22, the TypeScript Core Port. Ports Mirror
Mind's Python core to TypeScript via a database-seam strangler.

## Scope

This heading terminates the capture, so nothing here reaches the query.
"""

# Portuguese section names, which the extractor accepts and a port written from
# the English ones alone would miss.
#
# TWO forms, and the difference is a real defect rather than a test detail.
# `_extract_query` compares the lowercased heading against a literal list, with no
# Unicode normalization, so `Descrição` written NFD (c + combining cedilla, a +
# combining tilde) does NOT match the NFC literal in `build.py` -- and the query
# silently falls back to the SLUG, which turns an informed memories block into a
# slug search. macOS filesystem APIs and some editors produce NFD text, so this is
# reachable by a real journey document.
#
# The port must reproduce it: JavaScript's `includes` compares code units too, so
# parity holds as long as neither side normalizes. A port that "helpfully" calls
# `.normalize("NFC")` fixes the defect and breaks parity, which is why BOTH forms
# are recorded. Carried to Debt Review as a CR.
_PORTUGUESE_TEMPLATE = """# Jornada em português
**Stage:** Fase 2

## {heading}

Uma jornada cuja abertura está em português.

## Outra seção

Isto não deve entrar na consulta.
"""

# The section test runs against EVERY line, not only headings, and a match
# `continue`s -- so a BODY line containing one of the five names is SILENTLY
# DROPPED from the query, while the lines around it are kept. Harmless in a long
# description; fatal in a short one, because a body whose only line mentions
# "context" captures nothing and the query collapses to the slug. Found exactly
# that way: the Portuguese case's body originally said "seção de contexto" and
# produced the slug with no error.
BODY_MENTION_JOURNEY = """# A journey whose prose mentions the magic words

## Description

This first sentence is kept.
The next line explains the context in which the work happens.
This line is kept too; only the line above it disappears.

## Scope

Not captured.
"""

# The same quirk where it actually bites: one body line, and it mentions a section
# name, so the query is the slug.
SINGLE_BODY_MENTION_JOURNEY = """# A journey with one line of prose

## Description

The whole description is about the context of this work.
"""

PORTUGUESE_NFC_JOURNEY = _PORTUGUESE_TEMPLATE.format(
    heading=unicodedata.normalize("NFC", "Descrição")
)
PORTUGUESE_NFD_JOURNEY = _PORTUGUESE_TEMPLATE.format(
    heading=unicodedata.normalize("NFD", "Descrição")
)

# No matching section at all: `_extract_section` falls back to every non-heading
# line joined and cut at 240, while `_extract_query` falls back to the SLUG. The
# two fallbacks differ, which is the point of having both here.
NO_SECTION_JOURNEY = """# A journey with no described section

Just a paragraph that belongs to no section.
And a second line of it.
"""

# 500 is a CODE POINT boundary. The run is long enough that the cut lands inside
# it: 520 astral characters are 520 code points to Python and 1040 UTF-16 units to
# JavaScript, so a naive `slice(0, 500)` keeps 250 of them and produces a visibly
# shorter query -- a different embedding, and therefore a differently ordered
# memories block, with no error anywhere.
ASTRAL_JOURNEY = (
    "# Astral journey\n**Stage:** 🟩 staged\n\n## Description\n\n"
    + ("🟦" * 520)
    + " tail words that fall past the five hundredth code point\n"
)

# A word longer than the card's 54-column wrap width: `_wrap` does NOT chunk it,
# so `_line` truncates it instead. The Explorer card records the same asymmetry.
LONG_WORD_JOURNEY = (
    "# Long word journey\n\n## Description\n\n" + ("x" * 120) + " and a short tail\n"
)

EMPTY_JOURNEY = ""

JOURNEYS: dict[str, str] = {
    "full": FULL_JOURNEY,
    "portuguese_nfc": PORTUGUESE_NFC_JOURNEY,
    "portuguese_nfd": PORTUGUESE_NFD_JOURNEY,
    "body_mention": BODY_MENTION_JOURNEY,
    "single_body_mention": SINGLE_BODY_MENTION_JOURNEY,
    "no_section": NO_SECTION_JOURNEY,
    "astral": ASTRAL_JOURNEY,
    "long_word": LONG_WORD_JOURNEY,
    "empty": EMPTY_JOURNEY,
    # The slug fallback: content that is only headings captures nothing.
    "headings_only": "# One\n## Two\n### Three\n",
}

PROJECT_PATHS: dict[str, str | None] = {
    "with_project": "/projects/mirror",
    "no_project": None,
}


def _transition_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for journey_name, content in JOURNEYS.items():
        for path_name, project_path in PROJECT_PATHS.items():
            cases.append(
                {
                    "name": f"transition_{journey_name}_{path_name}",
                    "journey": "demo-journey",
                    "journey_content": content,
                    "project_path": project_path,
                    "surface": render_builder_mode_transition(
                        journey="demo-journey",
                        journey_content=content,
                        project_path=project_path,
                    ),
                }
            )
    # A slug long enough to overflow the card, since the journey row is not wrapped
    # by `_wrap` alone -- `_line` truncates at WIDTH.
    long_slug = "a-journey-slug-that-is-far-longer-than-the-fifty-six-column-card"
    cases.append(
        {
            "name": "transition_long_slug",
            "journey": long_slug,
            "journey_content": FULL_JOURNEY,
            "project_path": "/projects/mirror",
            "surface": render_builder_mode_transition(
                journey=long_slug,
                journey_content=FULL_JOURNEY,
                project_path="/projects/mirror",
            ),
        }
    )
    return cases


def _query_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for journey_name, content in JOURNEYS.items():
        query = _extract_query(content, "demo-journey")
        cases.append(
            {
                "name": f"query_{journey_name}",
                "journey_content": content,
                "slug": "demo-journey",
                "query": query,
                # Recorded so a UTF-16 port fails on the LENGTH before anyone has
                # to read the two strings side by side.
                "query_code_points": len(query),
                # The slug fallback is a DIFFERENT outcome from a short capture,
                # and the NFD case reaches it by accident rather than by design.
                "fell_back_to_slug": query == "demo-journey",
            }
        )
    return cases


# The fixture BOTH engines read: Python through `build_load_oracle.py`'s patched
# seam, TypeScript through its replay embedding provider. One file, so the two
# sides cannot disagree about the query vector and therefore about the ranking.
#
# A constant vector is the right shape here and not a shortcut: the search corpus
# already grades the ranker against a frozen query vector, and what `load` adds is
# COMPOSITION -- two searches, a merge, a dedupe, a stable sort, a slice of six.
EMBEDDING_DIMENSIONS = 1536
LOAD_FIXTURE = {
    "embedding": [0.0125] * EMBEDDING_DIMENSIONS,
    "llm": {"default": "[]"},
}

# What the TypeScript replay provider expects, from the same numbers.
TS_EMBEDDING_FIXTURE = {
    "kind": "embedding",
    "response": {"embedding": LOAD_FIXTURE["embedding"]},
}

FIXTURE_DIR = HERE.parent / "test" / "fixtures" / "builder-load"


def _write_fixtures() -> Path:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    oracle_path = FIXTURE_DIR / "oracle-seam.json"
    oracle_path.write_text(
        json.dumps(LOAD_FIXTURE, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (FIXTURE_DIR / "replay-embedding.json").write_text(
        json.dumps(TS_EMBEDDING_FIXTURE, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return oracle_path


def build_payload() -> dict[str, Any]:
    _write_fixtures()
    return {"transitions": _transition_cases(), "queries": _query_cases()}


def main() -> None:
    payload = build_payload()
    text = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")
    print(
        f"{len(payload['transitions'])} transition cases, {len(payload['queries'])} query cases"
    )
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")
    print(f"wrote {FIXTURE_DIR.relative_to(HERE.parent.parent)}/")


if __name__ == "__main__":
    main()
