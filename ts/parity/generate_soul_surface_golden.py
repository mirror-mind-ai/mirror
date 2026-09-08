"""Generate the committed Soul surface golden fixture (CV22.DS7.US6 plateau 1).

`src/memory/surfaces/soul.py` is a `transport=verbatim` surface: the golden
captures the RENDERED box-drawing output, so a re-indent, a re-wrap, or a
one-character padding change is a failure, not a formatting difference.

The renderers are pure functions of their arguments -- no clock, no database,
no environment -- so this generator needs none of the freezing machinery the
stateful generators carry. What it does need is a corpus that pins the places
where Python and JavaScript disagree about text, because every one of them is
live in these three helpers:

  * `_line` does `text[:WIDTH]` then `.ljust(WIDTH)` -- Python counts CODE
    POINTS, JavaScript counts UTF-16 units. An astral emoji is 1 to Python and
    2 to JavaScript, so a card containing one is padded differently by a naive
    port. This is the exact class that shipped as the `generateTitle` defect in
    DS7.US5.
  * `_wrap` measures with `len()` (code points again) and splits with
    `str.split()`, whose separator set is Python's `str.isspace()`: it includes
    U+001C-U+001F and excludes U+FEFF, both the opposite of JavaScript's `\\s`.
  * `_wrap_blocks` uses `str.splitlines()`, which breaks on \\v \\f \\x1c \\x1d
    \\x1e \\x85 U+2028 U+2029 as well as \\n and \\r\\n. `split("\\n")` in
    JavaScript sees one line where Python sees several.

Error paths are part of the surface: Soul's messages are ritual text a user
reads, so each refusal is a scenario with its exact message.

Run:  uv run python ts/parity/generate_soul_surface_golden.py
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from memory.surfaces.mode_transition import render_soul_mode_transition
from memory.surfaces.soul import (
    SoulListeningOption,
    render_active_rite,
    render_closing_rite,
    render_enrichment_proposal,
    render_fruit_in_maturation,
    render_harvested_fruit,
    render_identity_change_applied,
    render_integration_review,
    render_possible_listenings,
)

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "soul-surface.golden.json"

# --- Unicode corpus -------------------------------------------------------
# Each string below exists to break one specific naive implementation.

ASTRAL = "🎯 a target and 🌱 a seed carried through the whole card"
CJK = "沉默不是空白而是尚未成形的語言在等待被聽見的時刻到來"
COMBINING = "a\u0301 e\u0301 i\u0301 combining acutes that must count as two code points each"
UNBROKEN = "x" * 200
NBSP_SEPARATED = "one\u00a0two\u00a0three separated by non-breaking spaces"
IDEOGRAPHIC_SPACE = "one\u3000two\u3000three separated by ideographic spaces"
UNIT_SEPARATOR = "one\u001ftwo three separated by a unit separator"
BOM_JOINED = "one\ufefftwo three joined by a byte-order mark"
VERTICAL_TAB_LINES = "first block\u000bsecond block after a vertical tab"
FORM_FEED_LINES = "first block\u000csecond block after a form feed"
NEXT_LINE = "first block\u0085second block after NEL"
LINE_SEPARATOR = "first block\u2028second block after U+2028"
ESCAPED_NEWLINES = "first paragraph\\n\\nsecond paragraph after a literal escape"
MULTI_PARAGRAPH = "first paragraph\n\n\nsecond paragraph after blank lines\n\nthird"
LEADING_BLANKS = "\n\n  padded on both ends  \n\n"


def _listen(**kwargs: str) -> list[SoulListeningOption]:
    return [SoulListeningOption(voice=voice, description=text) for voice, text in kwargs.items()]


def _scenario(name: str, renderer: str, render: Callable[[], str], payload: dict[str, Any]):
    scenario: dict[str, Any] = {"name": name, "renderer": renderer, "input": payload}
    try:
        scenario["expected_stdout"] = render()
    except ValueError as exc:
        scenario["expected_error"] = str(exc)
    return scenario


def _possible_listenings(name: str, options: list[tuple[str, str]]):
    return _scenario(
        name,
        "possible_listenings",
        lambda: render_possible_listenings(
            [SoulListeningOption(voice=voice, description=text) for voice, text in options]
        ),
        {"options": [{"voice": voice, "description": text} for voice, text in options]},
    )


def _fruit(name: str, renderer: str, fn: Callable[[str], str], fruit: str):
    return _scenario(name, renderer, lambda: fn(fruit), {"fruit": fruit})


def _closing(name: str, **kwargs: str | None):
    return _scenario(name, "closing_rite", lambda: render_closing_rite(**kwargs), dict(kwargs))


def _review(name: str, **kwargs: str | None):
    return _scenario(
        name, "integration_review", lambda: render_integration_review(**kwargs), dict(kwargs)
    )


def _proposal(name: str, layer: str, **kwargs: Any):
    return _scenario(
        name,
        "enrichment_proposal",
        lambda: render_enrichment_proposal(layer, **kwargs),
        {"layer": layer, **kwargs},
    )


def _applied(name: str, layer: str, **kwargs: Any):
    return _scenario(
        name,
        "identity_change_applied",
        lambda: render_identity_change_applied(layer, **kwargs),
        {"layer": layer, **kwargs},
    )


def _rite(name: str, voice: str, **kwargs: Any):
    return _scenario(
        name, "active_rite", lambda: render_active_rite(voice, **kwargs), {"voice": voice, **kwargs}
    )


def build_scenarios() -> list[dict[str, Any]]:
    scenarios: list[dict[str, Any]] = []

    # --- possible listenings ---
    scenarios.append(_possible_listenings("listen_single_voice", [("self", "what remains true")]))
    scenarios.append(
        _possible_listenings(
            "listen_all_four_voices",
            [
                ("self", "what remains true without proof"),
                ("shadow", "the protection hiding inside the control"),
                ("wisdom", "the lesson already present in the situation"),
                ("beauty", "the form aliveness is taking right now"),
            ],
        )
    )
    scenarios.append(
        _possible_listenings(
            "listen_wraps_long_description",
            [("self", "a description long enough to wrap across several lines of the card")],
        )
    )
    scenarios.append(_possible_listenings("listen_astral_emoji", [("beauty", ASTRAL)]))
    scenarios.append(_possible_listenings("listen_cjk", [("wisdom", CJK)]))
    scenarios.append(_possible_listenings("listen_combining_marks", [("self", COMBINING)]))
    scenarios.append(_possible_listenings("listen_unbroken_token", [("shadow", UNBROKEN)]))
    scenarios.append(_possible_listenings("listen_nbsp_separators", [("self", NBSP_SEPARATED)]))
    scenarios.append(
        _possible_listenings("listen_ideographic_space", [("self", IDEOGRAPHIC_SPACE)])
    )
    scenarios.append(_possible_listenings("listen_unit_separator", [("self", UNIT_SEPARATOR)]))
    scenarios.append(_possible_listenings("listen_bom_joined", [("self", BOM_JOINED)]))
    scenarios.append(_possible_listenings("listen_error_no_options", []))
    scenarios.append(_possible_listenings("listen_error_unknown_voice", [("ego", "not a voice")]))
    scenarios.append(_possible_listenings("listen_error_blank_description", [("self", "   ")]))

    # --- fruit / harvest cards ---
    for label, renderer, fn in (
        ("fruit", "fruit_in_maturation", render_fruit_in_maturation),
        ("harvest", "harvested_fruit", render_harvested_fruit),
    ):
        scenarios.append(_fruit(f"{label}_short", renderer, fn, "a small true thing"))
        scenarios.append(
            _fruit(
                f"{label}_wraps",
                renderer,
                fn,
                "a fruit whose sentence is long enough that it must wrap more than once inside the card",
            )
        )
        scenarios.append(_fruit(f"{label}_astral", renderer, fn, ASTRAL))
        scenarios.append(_fruit(f"{label}_cjk", renderer, fn, CJK))
        scenarios.append(_fruit(f"{label}_unbroken_token", renderer, fn, UNBROKEN))
        scenarios.append(_fruit(f"{label}_strips_padding", renderer, fn, LEADING_BLANKS))
        scenarios.append(_fruit(f"{label}_error_empty", renderer, fn, "   "))

    # --- closing rite ---
    scenarios.append(_closing("close_single_section", harvested="one clear thing"))
    scenarios.append(
        _closing(
            "close_all_sections",
            harvested="what was harvested today",
            echoes="what still echoes after the rite",
            remains_open="what remains open and unresolved",
            integration="what may want integration later on",
        )
    )
    scenarios.append(_closing("close_escaped_newlines", harvested=ESCAPED_NEWLINES))
    scenarios.append(_closing("close_multi_paragraph", echoes=MULTI_PARAGRAPH))
    scenarios.append(_closing("close_vertical_tab_block", echoes=VERTICAL_TAB_LINES))
    scenarios.append(_closing("close_form_feed_block", echoes=FORM_FEED_LINES))
    scenarios.append(_closing("close_next_line_block", echoes=NEXT_LINE))
    scenarios.append(_closing("close_line_separator_block", echoes=LINE_SEPARATOR))
    scenarios.append(_closing("close_skips_blank_sections", harvested="kept", echoes="   "))
    scenarios.append(_closing("close_error_all_empty", harvested="  ", echoes=None))

    # --- integration review ---
    scenarios.append(_review("review_single_section", journal="origin material"))
    scenarios.append(
        _review(
            "review_all_sections",
            journal="the journal entry this came from",
            self_material="a principle that wants to be incorporated",
            shadow="a hidden need that became visible",
            ego="an operational pattern worth naming",
            persona="a participation pattern in one persona",
            leave_open="what should stay open for now",
        )
    )
    scenarios.append(_review("review_footer_present", ego="only the ego section"))
    scenarios.append(_review("review_error_all_empty"))

    # --- enrichment proposal ---
    for layer in ("self", "shadow", "ego", "persona"):
        scenarios.append(
            _proposal(
                f"proposal_{layer}",
                layer,
                key="soul" if layer == "self" else "profile",
                origin="a Soul Mode rite on 2026-09-08",
                current="the current content of the layer",
                proposed="the enrichment being proposed for this layer",
                why="why this may belong in the identity document",
            )
        )
    scenarios.append(
        _proposal(
            "proposal_current_none",
            "self",
            key="soul",
            origin="a rite",
            current=None,
            proposed="new material",
            why="because it recurs",
        )
    )
    scenarios.append(
        _proposal(
            "proposal_current_blank",
            "self",
            key="soul",
            origin="a rite",
            current="   ",
            proposed="new material",
            why="because it recurs",
        )
    )
    scenarios.append(
        _proposal(
            "proposal_error_bad_layer",
            "voice",
            key="k",
            origin="o",
            current=None,
            proposed="p",
            why="w",
        )
    )
    scenarios.append(
        _proposal(
            "proposal_error_blank_key",
            "self",
            key="   ",
            origin="o",
            current=None,
            proposed="p",
            why="w",
        )
    )
    scenarios.append(
        _proposal(
            "proposal_error_blank_origin",
            "self",
            key="soul",
            origin="  ",
            current=None,
            proposed="p",
            why="w",
        )
    )
    scenarios.append(
        _proposal(
            "proposal_error_blank_proposed",
            "self",
            key="soul",
            origin="o",
            current=None,
            proposed="",
            why="w",
        )
    )
    scenarios.append(
        _proposal(
            "proposal_error_blank_why",
            "self",
            key="soul",
            origin="o",
            current=None,
            proposed="p",
            why="   ",
        )
    )

    # --- identity change applied ---
    for layer in ("self", "shadow", "ego", "persona"):
        scenarios.append(
            _applied(
                f"applied_{layer}",
                layer,
                key="soul" if layer == "self" else "profile",
                content="the exact content integrated into the layer",
            )
        )
    scenarios.append(_applied("applied_astral", "self", key="soul", content=ASTRAL))
    scenarios.append(_applied("applied_error_bad_layer", "voice", key="k", content="c"))
    scenarios.append(_applied("applied_error_blank_key", "self", key=" ", content="c"))
    scenarios.append(_applied("applied_error_blank_content", "self", key="soul", content="  "))

    # --- active rite ---
    scenarios.append(_rite("rite_self_default_utterance", "self"))
    scenarios.append(_rite("rite_shadow_default_utterance", "shadow"))
    scenarios.append(
        _rite("rite_wisdom_with_says", "wisdom", utterance="what the wisdom voice says now")
    )
    scenarios.append(
        _rite("rite_beauty_with_says", "beauty", utterance="what the beauty voice says now")
    )
    scenarios.append(
        _rite("rite_question_alias", "self", question="the legacy alias supplies the utterance")
    )
    scenarios.append(
        _rite(
            "rite_says_wins_over_question",
            "self",
            utterance="says wins",
            question="question loses",
        )
    )
    scenarios.append(_rite("rite_escaped_newlines", "self", utterance=ESCAPED_NEWLINES))
    scenarios.append(_rite("rite_multi_paragraph", "shadow", utterance=MULTI_PARAGRAPH))
    scenarios.append(_rite("rite_astral", "self", utterance=ASTRAL))
    scenarios.append(_rite("rite_cjk", "shadow", utterance=CJK))
    scenarios.append(
        _rite("rite_listening_for_is_inert", "self", utterance="body", listening_for="ignored")
    )
    scenarios.append(_rite("rite_error_unknown_voice", "ego"))
    scenarios.append(_rite("rite_error_wisdom_requires_says", "wisdom"))
    scenarios.append(_rite("rite_error_beauty_requires_says", "beauty"))
    scenarios.append(_rite("rite_error_blank_utterance", "self", utterance="   "))

    # --- the Soul Mode entry card (surfaces/mode_transition.py) ---
    # A different module and a different WIDTH (56, not 40), but the same
    # transport=verbatim contract, so it is graded here rather than in a fifth
    # artifact. `journey` is accepted and deliberately discarded by the oracle,
    # so both call shapes are recorded to pin that it cannot leak into the card.
    scenarios.append(
        _scenario(
            "mode_transition_without_journey",
            "mode_transition",
            lambda: render_soul_mode_transition(journey=None),
            {"journey": None},
        )
    )
    scenarios.append(
        _scenario(
            "mode_transition_with_journey",
            "mode_transition",
            lambda: render_soul_mode_transition(journey="mirror-ts-core"),
            {"journey": "mirror-ts-core"},
        )
    )

    return scenarios


def main() -> None:
    scenarios = build_scenarios()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"scenarios": scenarios}, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    rendered = sum(1 for s in scenarios if "expected_stdout" in s)
    refused = sum(1 for s in scenarios if "expected_error" in s)
    print(f"{len(scenarios)} scenarios: {rendered} rendered, {refused} refused")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
