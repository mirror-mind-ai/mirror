"""Generate the committed compute_cost golden (CV22.DS8.US1).

Drives the REAL `memory.intelligence.cost` oracle -- the single cost authority
(AI-09 / CV9.E2.S13) -- over every branch its docstring names, so the
TypeScript port (ts/src/providers/cost.ts) can be graded without re-deriving
the arithmetic.

Why this golden exists at all: until DS8 the TS core deliberately did NOT port
`compute_cost` (see the header of ts/src/observability/llmCalls.ts) because
consult always logs the real fetched generation cost. The live search
embedding has no such fetched figure -- Python prices that row from the static
table -- so the port becomes load-bearing exactly when the live provider lands.

Branches exercised:
  - both pinned models (extraction + embedding), prompt-only and both sides;
  - an unknown model -> None (never a silent 0.0);
  - a known model with prompt_tokens=None -> None (usage genuinely unknown);
  - completion_tokens=None -> treated as zero completion, NOT as unknown;
  - zero prompt tokens -> 0.0, which is a real priced zero, not None;
  - large token counts, to pin float behavior away from tidy magnitudes.

Float note: Python and JS both compute in IEEE-754 doubles over the same
operation order, so the TS test asserts EXACT equality. If that ever drifts,
the divergence is real and worth failing on -- do not relax it to an epsilon
without evidence.

Run:  uv run python ts/parity/generate_cost_golden.py
"""

from __future__ import annotations

import json
from pathlib import Path

from memory.intelligence.cost import MODEL_PRICES, compute_cost

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "cost.golden.json"

EXTRACTION_PIN = "google/gemini-2.5-flash-lite"
EMBEDDING_PIN = "openai/text-embedding-3-small"

CASES: tuple[tuple[str, int | None, int | None], ...] = (
    # Extraction pin: both sides priced.
    (EXTRACTION_PIN, 1000, 500),
    (EXTRACTION_PIN, 1, 1),
    (EXTRACTION_PIN, 12345, 6789),
    # Extraction pin: completion omitted -> zero completion, still priced.
    (EXTRACTION_PIN, 1000, None),
    # Embedding pin: no completion side at all (the live-search row's shape).
    (EMBEDDING_PIN, 42, None),
    (EMBEDDING_PIN, 42, 0),
    (EMBEDDING_PIN, 1_000_000, None),
    # A real priced zero -- distinct from None.
    (EXTRACTION_PIN, 0, 0),
    (EXTRACTION_PIN, 0, None),
    # Unknown model -> None, never 0.0.
    ("anthropic/claude-sonnet-4", 1000, 500),
    ("", 1000, 500),
    # Known model, unknown usage -> None.
    (EXTRACTION_PIN, None, 500),
    (EMBEDDING_PIN, None, None),
)


def main() -> None:
    golden = {
        "prices": {
            model: {
                "prompt_per_1k": price.prompt_per_1k,
                "completion_per_1k": price.completion_per_1k,
            }
            for model, price in sorted(MODEL_PRICES.items())
        },
        "cases": [
            {
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "cost_usd": compute_cost(model, prompt_tokens, completion_tokens),
            }
            for model, prompt_tokens, completion_tokens in CASES
        ],
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(golden, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"models: {len(golden['prices'])}")
    print(f"cases: {len(golden['cases'])}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
