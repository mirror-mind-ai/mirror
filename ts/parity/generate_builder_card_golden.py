"""Generate the committed Builder card-primitives golden (CV22.DS7.US8 plateau 1).

`build` renders `transport=verbatim` surfaces, so the golden captures rendered
bytes: a re-wrap, a re-indent, or a one-character padding change is a failure,
not a formatting difference.

What this file grades is the layer underneath every Builder surface, and it
exists because Python has TEN copies of it with TWO behaviors. Measured, not
read (`md5` over each extracted function body):

  * `_wrap_plain_text` is copied into `artifact_surfaces`, `delivery_story_closure`,
    `delivery_story_plan`, `flow_unit`, `home_surface`, `lifecycle`,
    `pull_candidates`, `release_intent`, `resume_surface`, and
    the Workbench surfaces. Eight of them CHUNK a word longer than `width` into
    `width`-sized slices. **`release_intent` and the Workbench ones did not** --
    the over-long word is appended whole, and `_card_text`'s `text[:54]` then
    truncates it, silently losing the tail. Same input, two outputs, one module
    apart. A port that factors these into one helper is wrong in one of the two
    places unless the difference is a parameter, so both are graded here.

  * `_card_prefixed` has THREE variants:
      - the common one returns `["none"]` for an empty input tuple;
      - `flow_unit`'s returns `none` only when the RENDERED list is empty,
        which differs for a tuple of blank strings (the common one renders a
        card per blank; `flow_unit` renders `none`);
      - `delivery_story_closure`'s strips a leading `"- "` from each item
        first, so a Markdown-bulleted debt list renders unbulleted there and
        bulleted everywhere else.

  * `_card_text` is `f"│ {text[:54]:<54} │"`: truncate to 54 CODE POINTS, then
    pad. Python counts code points; JavaScript counts UTF-16 units, so every
    astral-plane glyph in a Builder card (`🟪`, `🟦`, `🧰`, `✎`, `🧭`, `🟩`)
    is a divergence site.

  * `_wrap_plain_text` splits with `str.split()`, whose separator set is
    `str.isspace()`: it includes U+001C-U+001F and excludes U+FEFF, both the
    opposite of JavaScript's `\\s`. It also measures with `len()`, so the
    width budget is in code points.

  * Embedded newlines are NOT preserved: `str.split()` treats them as
    whitespace, so paragraphs collapse. Pinned, because "preserve the
    paragraphs" is the natural assumption for a port.

The functions are module-private by design, so this generator reaches them
through `getattr` on the modules that own them rather than re-implementing the
call sites. That is deliberate: the golden must record what the CALL SITES
share, and any drift between the copies is exactly the thing being pinned.

Run:  uv run python ts/parity/generate_builder_card_golden.py
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from memory.builder import (
    artifact_surfaces,
    delivery_story_closure,
    delivery_story_plan,
    flow_unit,
    home_surface,
    lifecycle,
    pull_candidates,
    release_intent,
    resume_surface,
)
from memory.builder.surface_protocol import wrap_ariad_surface

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "builder-card.golden.json"

# Every module that owns a copy, in the order the inventory lists them.
WRAP_OWNERS = {
    "artifact_surfaces": artifact_surfaces,
    "delivery_story_closure": delivery_story_closure,
    "delivery_story_plan": delivery_story_plan,
    "flow_unit": flow_unit,
    "home_surface": home_surface,
    "lifecycle": lifecycle,
    "pull_candidates": pull_candidates,
    "release_intent": release_intent,
    "resume_surface": resume_surface,
}

PREFIX_OWNERS = {
    "delivery_story_closure": delivery_story_closure,
    "delivery_story_plan": delivery_story_plan,
    "flow_unit": flow_unit,
    "home_surface": home_surface,
    "lifecycle": lifecycle,
    "pull_candidates": pull_candidates,
    "resume_surface": resume_surface,
}

# --- Corpus ---------------------------------------------------------------
# Each string exists to break one specific naive implementation.

ASTRAL = "🟪 a chapter and 🟦 a story carried through one Builder card"
CJK = "交付故事在被拉取之前必須先被展開否則計劃將指向一個不可實作的層級這是規則"
COMBINING = "a\u0301 e\u0301 i\u0301 combining acutes counting two code points each"
UNBROKEN_60 = "x" * 60
UNBROKEN_200 = "y" * 200
NBSP = "one\u00a0two\u00a0three separated by non-breaking spaces"
IDEOGRAPHIC = "one\u3000two\u3000three separated by ideographic spaces"
UNIT_SEPARATOR = "one\u001ftwo three separated by a unit separator"
BOM_JOINED = "one\ufefftwo three joined by a byte-order mark"
FORM_FEED = "first block\u000csecond block after a form feed"
MULTI_PARAGRAPH = "first paragraph\n\n\nsecond paragraph after blanks\n\nthird"
LEADING_BLANKS = "\n\n  padded on both ends  \n\n"
EMPTY = ""
ONLY_SPACES = "     "
# 54 is `_card_text`'s field width; 52 is `_card_prefixed`'s wrap budget.
AT_52 = "a" * 52
AT_53 = "b" * 53
AT_54 = "c" * 54
AT_55 = "d" * 55
# A real Builder string that overflows: a project-relative artifact path.
LONG_PATH = (
    "docs/project/roadmap/cv22-typescript-core-port/cv22-ds7-command-burn-down/"
    "cv22-ds7-us8-builder-ariad-tree/index.md"
)
# A word longer than the width immediately after text, which is the branch
# where the chunking variants flush `current` before slicing.
FLUSH_THEN_CHUNK = f"short lead {UNBROKEN_60} trailing words after"

WRAP_CORPUS: list[tuple[str, str]] = [
    ("astral", ASTRAL),
    ("cjk", CJK),
    ("combining", COMBINING),
    ("unbroken_60", UNBROKEN_60),
    ("unbroken_200", UNBROKEN_200),
    ("nbsp", NBSP),
    ("ideographic_space", IDEOGRAPHIC),
    ("unit_separator", UNIT_SEPARATOR),
    ("bom_joined", BOM_JOINED),
    ("form_feed", FORM_FEED),
    ("multi_paragraph", MULTI_PARAGRAPH),
    ("leading_blanks", LEADING_BLANKS),
    ("empty", EMPTY),
    ("only_spaces", ONLY_SPACES),
    ("at_52", AT_52),
    ("at_53", AT_53),
    ("at_54", AT_54),
    ("at_55", AT_55),
    ("long_path", LONG_PATH),
    ("flush_then_chunk", FLUSH_THEN_CHUNK),
]

# The two widths Builder actually calls with: 54 for card body text, 52 for
# prefixed list items.
WRAP_WIDTHS = (52, 54)

PREFIX_CORPUS: list[tuple[str, tuple[str, ...], str]] = [
    ("empty_tuple", (), "✓"),
    ("single", ("one finding",), "✓"),
    ("two", ("first finding", "second finding"), "✕"),
    ("blank_strings", ("", ""), "✓"),
    ("only_spaces", ("   ",), "✓"),
    ("bulleted", ("- a bulleted finding", "- another one"), "○"),
    ("mixed_bullets", ("- bulleted", "unbulleted"), "○"),
    ("dash_no_space", ("-not a bullet",), "○"),
    ("wraps", (LONG_PATH,), "✓"),
    ("chunks", (UNBROKEN_60,), "✓"),
    ("astral", (ASTRAL,), "🧰"),
    ("multi_paragraph", (MULTI_PARAGRAPH,), "✓"),
]


def _scenario(name: str, kind: str, payload: dict[str, Any], render: Callable[[], Any]):
    scenario: dict[str, Any] = {"name": name, "kind": kind, "input": payload}
    try:
        scenario["expected"] = render()
    except Exception as exc:
        scenario["expected_error"] = f"{type(exc).__name__}: {exc}"
    return scenario


def build_scenarios() -> list[dict[str, Any]]:
    scenarios: list[dict[str, Any]] = []

    # --- _wrap_plain_text, every owner x every corpus row x both widths ----
    # Nine owners are recorded even though only two behaviors exist, because
    # "which modules agree" is the fact a future refactor would break.
    for owner_name, module in WRAP_OWNERS.items():
        wrap = module._wrap_plain_text
        for corpus_name, text in WRAP_CORPUS:
            for width in WRAP_WIDTHS:
                scenarios.append(
                    _scenario(
                        f"wrap__{owner_name}__{corpus_name}__w{width}",
                        "wrap_plain_text",
                        {"owner": owner_name, "text": text, "width": width},
                        lambda w=wrap, t=text, x=width: w(t, width=x),
                    )
                )

    # --- _card_text, the truncate-then-pad rule ---------------------------
    card_text = lifecycle._card_text
    for corpus_name, text in WRAP_CORPUS:
        scenarios.append(
            _scenario(
                f"card_text__{corpus_name}",
                "card_text",
                {"text": text},
                lambda t=text: card_text(t),
            )
        )

    # --- _card_wrapped, the composition of the two -------------------------
    card_wrapped = lifecycle._card_wrapped
    for corpus_name, text in WRAP_CORPUS:
        scenarios.append(
            _scenario(
                f"card_wrapped__{corpus_name}",
                "card_wrapped",
                {"text": text},
                lambda t=text: card_wrapped(t),
            )
        )

    # --- _card_prefixed, all three variants --------------------------------
    for owner_name, module in PREFIX_OWNERS.items():
        prefixed = module._card_prefixed
        for corpus_name, items, prefix in PREFIX_CORPUS:
            scenarios.append(
                _scenario(
                    f"card_prefixed__{owner_name}__{corpus_name}",
                    "card_prefixed",
                    {"owner": owner_name, "items": list(items), "prefix": prefix},
                    lambda p=prefixed, i=items, x=prefix: p(i, x),
                )
            )

    # --- _card_line, pull_candidates only (left/right composition) ---------
    card_line = getattr(pull_candidates, "_card_line", None)
    if card_line is not None:
        pairs = [
            ("short", "left", "right"),
            ("empty_right", "left", ""),
            ("empty_both", "", ""),
            ("overflow_left", AT_54, "right"),
            ("astral", "🟦 story", "🟩 done"),
        ]
        for corpus_name, left, right in pairs:
            scenarios.append(
                _scenario(
                    f"card_line__{corpus_name}",
                    "card_line",
                    {"left": left, "right": right},
                    lambda a=left, b=right: card_line(a, b),
                )
            )

    # --- wrap_ariad_surface, the transport boundary -------------------------
    # Every Ariad surface passes through this, and the runtime harness parses
    # the markers, so the normalization and the rstrip are protocol.
    wrap_cases = [
        ("lower", "plan_checkpoint", "body\n"),
        ("upper", "PLAN_CHECKPOINT", "body\n"),
        ("spaces", "Plan Checkpoint", "body\n"),
        ("padded_id", "  plan_checkpoint  ", "body\n"),
        ("ideographic_padded_id", "\u3000plan_checkpoint\u3000", "body\n"),
        # The two call-site styles: `body + "\n"` and bare `body`.
        ("body_no_newline", "plan_checkpoint", "body"),
        ("body_two_newlines", "plan_checkpoint", "body\n\n"),
        ("body_trailing_spaces", "plan_checkpoint", "body   \n"),
        ("body_trailing_ideographic", "plan_checkpoint", "body\u3000"),
        ("body_trailing_bom", "plan_checkpoint", "body\ufeff"),
        ("body_empty", "plan_checkpoint", ""),
        ("body_only_newlines", "plan_checkpoint", "\n\n\n"),
        ("body_leading_newline", "plan_checkpoint", "\nbody\n"),
        ("multiline_body", "plan_checkpoint", "one\ntwo\nthree\n"),
        ("tab_in_id", "plan\tcheckpoint", "body\n"),
    ]
    for name, surface_id, body in wrap_cases:
        scenarios.append(
            _scenario(
                f"wrap_surface__{name}",
                "wrap_ariad_surface",
                {"surface_id": surface_id, "body": body},
                lambda i=surface_id, b=body: wrap_ariad_surface(i, b),
            )
        )

    # --- _card_context_items, lifecycle only -------------------------------
    context_items = getattr(lifecycle, "_card_context_items", None)
    if context_items is not None:
        for corpus_name, items, _prefix in PREFIX_CORPUS:
            scenarios.append(
                _scenario(
                    f"card_context_items__{corpus_name}",
                    "card_context_items",
                    {"items": list(items)},
                    lambda i=items: context_items(i),
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
    rendered = sum(1 for s in scenarios if "expected" in s)
    refused = sum(1 for s in scenarios if "expected_error" in s)
    kinds = sorted({s["kind"] for s in scenarios})
    print(f"{len(scenarios)} scenarios: {rendered} rendered, {refused} refused")
    print(f"kinds: {', '.join(kinds)}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
