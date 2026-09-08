"""Generate the Soul harvest-journal golden (CV22.DS7.US6 plateau 5).

`compose_soul_harvest_journal` (`src/memory/services/soul_journal.py`) turns a
harvested fruit plus the originating conversation into the journal entry that
`soul harvest save` persists. It is pure, and it concentrates four Python string
behaviors that JavaScript does not share:

  * `_title_from_fruit` splits on `(?<=[.!?])\\s+`, where `\\s` is PYTHON's
    whitespace class, then measures the result with `len()` -- CODE POINTS --
    against 80, and truncates with `[:77]`. A UTF-16 length or slice puts the
    cut in a different place, and an astral character astride the boundary
    proves it.
  * `.rstrip(".!?")` strips a CHARACTER SET from the right, not a suffix.
  * `_blockquote` uses `splitlines()`, whose eleven boundaries include \\v, \\f,
    \\x1c-\\x1e, \\x85, and U+2028/9.
  * `_format_transcript` renders unknown roles with `str.title()`, which
    capitalizes after every non-alphabetic character: `"tool_call"` becomes
    `"Tool_Call"`, not `"Tool_call"`.

The metadata is `json.dumps(..., ensure_ascii=False)` with NO sort_keys -- the
opposite of the identity integration's rule in the same story. Both are pinned,
separately, on purpose.

Run:  uv run python ts/parity/generate_soul_harvest_golden.py
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "soul-harvest.golden.json"

# 80 code points exactly: the boundary `len(...) <= 80` accepts.
EIGHTY = "x" * 80
# 81, so it truncates at 77 + "...".
EIGHTY_ONE = "y" * 81
# Astral characters astride the 77/80 boundary: 1 code point each to Python,
# 2 UTF-16 units each to JavaScript, so a naive port cuts elsewhere.
ASTRAL_LONG = ("🎯" * 40) + " a tail that pushes this past eighty code points in total"
# A space at position 77 so `[:77].rstrip()` has something to remove.
SPACE_AT_CUT = ("z" * 76) + "  and more text after the cut point to force truncation"


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "soul-harvest-fixture"
        home.mkdir()
        for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "OPENROUTER_API_KEY"):
            os.environ.pop(key, None)
        os.environ["MIRROR_HOME"] = str(home)
        os.environ["MIRROR_USER"] = home.name
        os.environ["DB_PATH"] = str(home / "memory.db")

        from memory.models import Message
        from memory.services.soul_journal import compose_soul_harvest_journal

        def message(role: str, content: str) -> Message:
            return Message(conversation_id="conv-1", role=role, content=content)

        scenarios: list[dict[str, Any]] = []

        def case(
            name: str,
            *,
            fruit: str,
            conversation_id: str | None = None,
            messages: list[tuple[str, str]] | None = None,
        ) -> None:
            record: dict[str, Any] = {
                "name": name,
                "fruit": fruit,
                "conversation_id": conversation_id,
                "messages": [{"role": r, "content": c} for r, c in (messages or [])],
            }
            try:
                entry = compose_soul_harvest_journal(
                    fruit=fruit,
                    conversation_id=conversation_id,
                    messages=[message(r, c) for r, c in (messages or [])],
                )
                record["expected_title"] = entry.title
                record["expected_content"] = entry.content
                record["expected_metadata"] = entry.metadata
            except ValueError as exc:
                record["expected_error"] = str(exc)
            scenarios.append(record)

        # --- title derivation ---
        case("title_first_sentence", fruit="A first sentence. A second one follows.")
        case("title_strips_trailing_punctuation", fruit="Ends with punctuation!!!")
        case("title_no_sentence_end", fruit="no punctuation at all here")
        case("title_exactly_eighty", fruit=f"{EIGHTY}.")
        case("title_eighty_one_truncates", fruit=f"{EIGHTY_ONE}.")
        case("title_astral_boundary", fruit=ASTRAL_LONG)
        case("title_rstrip_at_cut", fruit=SPACE_AT_CUT)
        case("title_nbsp_after_period", fruit="First sentence.\u00a0Second sentence.")
        case("title_ideographic_space_after_period", fruit="First sentence.\u3000Second.")
        case("title_unit_separator_after_period", fruit="First sentence.\u001fSecond.")
        case("title_newline_after_period", fruit="First sentence.\nSecond sentence.")
        # --- blockquote / splitlines ---
        case("fruit_multiline", fruit="first line\nsecond line")
        case("fruit_blank_line_between", fruit="first line\n\nthird line")
        case("fruit_crlf", fruit="first line\r\nsecond line")
        case("fruit_vertical_tab", fruit="first line\vsecond line")
        case("fruit_form_feed", fruit="first line\fsecond line")
        case("fruit_line_separator", fruit="first line\u2028second line")
        # --- origin section ---
        case("with_conversation_id", fruit="a fruit", conversation_id="conv-1")
        case("without_conversation_id", fruit="a fruit", conversation_id=None)
        # --- transcript ---
        case(
            "transcript_roles",
            fruit="a fruit",
            conversation_id="conv-1",
            messages=[
                ("user", "  a user line  "),
                ("assistant", "a mirror line"),
                ("system", "a system line"),
                ("tool_call", "an unknown role rendered with str.title()"),
            ],
        )
        case(
            "transcript_skips_blank_content",
            fruit="a fruit",
            conversation_id="conv-1",
            messages=[("user", "kept"), ("assistant", "   "), ("user", "also kept")],
        )
        case(
            "transcript_limit_and_omitted_count",
            fruit="a fruit",
            conversation_id="conv-1",
            messages=[("user", f"message {index}") for index in range(20)],
        )
        case(
            "transcript_exactly_sixteen",
            fruit="a fruit",
            conversation_id="conv-1",
            messages=[("user", f"message {index}") for index in range(16)],
        )
        case(
            "transcript_without_conversation_id",
            fruit="a fruit",
            conversation_id=None,
            messages=[("user", "present but unlinked")],
        )
        # --- unicode + refusal ---
        case("unicode_fruit", fruit="Silêncio 沉默 🎯 kept raw in content and metadata")
        case("error_blank_fruit", fruit="   ")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"scenarios": scenarios}, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    refused = sum(1 for s in scenarios if "expected_error" in s)
    print(f"{len(scenarios)} scenarios ({refused} refused)")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
