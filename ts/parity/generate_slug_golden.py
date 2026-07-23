"""Generate the committed strip_accents/kebab_slug golden (CV22.DS7.US1 rider).

Drives the REAL `memory.utils.strip_accents`/`kebab_slug` oracle over a case
list covering every branch the docstring and DS7.US1 plan call out, so the
TypeScript port (ts/src/util/slug.ts) can be graded without re-deriving the
answer. Both functions are pure (no DB, no clock), so nothing needs freezing.

Branches exercised:
  - accented text across several scripts (PT/FR/DE), a title with punctuation
    ('.', '/', '&', '—') collapsing to hyphens;
  - already-clean kebab-case input (no-op);
  - only-punctuation / empty input -> "" (no alphanumeric content remains);
  - non-Latin script (no accents to strip, collapses to "" if no ASCII
    alphanumerics survive);
  - the 80-char cap: exactly at the cap, one under, one over, and a case
    engineered so the cap lands exactly on a hyphen (re-trimmed after cut).

Run:  uv run python ts/parity/generate_slug_golden.py
"""

from __future__ import annotations

import json
from pathlib import Path

from memory.utils import kebab_slug, strip_accents

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "slug.golden.json"

CASES: tuple[str, ...] = (
    "episódio",
    "CV22.DS7.US1 — Remaining identity/journey reads & writes",
    "Café com Açúcar & Ação",
    "  leading and trailing spaces  ",
    "___only___underscores___",
    "!!!",
    "",
    "already-kebab-case",
    "Mixed_Case-With.Dots",
    "日本語テキスト",
    "x" * 100,
    "café " * 20,
    "trailing-hyphen-after-cap-" + "a" * 60,
    "ação-" * 20,
    "üöäÜÖÄß",
    "naïve café résumé",
    "a" * 79 + "-" + "b",
    "a" * 80,
    "a" * 81,
)


def main() -> None:
    golden = {
        "cases": [
            {"input": text, "stripped": strip_accents(text), "slug": kebab_slug(text)}
            for text in CASES
        ]
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(golden, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"cases: {len(golden['cases'])}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
