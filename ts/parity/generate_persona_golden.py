"""Generate the committed persona-routing golden fixture (CV22.DS2.US2).

This is the Python side of the `detect-persona` parity contract. It seeds a
temporary database with fully synthetic persona identity rows, drives the REAL
router (`IdentityService.detect_persona`) over a set of probe queries, and
records what the oracle returned, so the TypeScript core can be graded against
Python without re-deriving the answer.

Unlike the hybrid ranker, `detect_persona` is pure and deterministic: it reads
no clock and no embeddings, only DB-backed routing metadata. So nothing needs to
be frozen. The corpus is fully synthetic (no personal data) and the output is
committed, so CI can verify parity with no network and no real DB.

The probe queries are chosen to exercise every branch of the router:

  - single-word keyword token membership,
  - multi-word keyword substring match,
  - hyphen/underscore/punctuation normalization (a hyphenated keyword such as
    `savings-plan` normalizes to the multi-word `savings plan`),
  - score ties broken by ascending persona key,
  - the threshold boundary (a single hit passes at threshold 1.0),
  - and the empty result (no keyword hits, or an empty normalized query).

Run:  uv run python ts/parity/generate_persona_golden.py
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from memory.db.connection import get_connection
from memory.services.attachment import AttachmentService
from memory.services.identity import IdentityService
from memory.storage.store import Store

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "detect-persona.golden.json"

THRESHOLD = 1.0

# key -> synthetic routing keywords. Fully fictional; no personal data.
# `finance-coach` intentionally carries the hyphenated `savings-plan` keyword,
# which normalizes to the multi-word `savings plan` and so exercises the
# substring branch through a keyword that looks single-token before normalization.
SEED_PERSONAS: tuple[tuple[str, list[str]], ...] = (
    ("code-reviewer", ["code", "pull request", "refactor", "bug"]),
    ("finance-coach", ["budget", "savings-plan", "investment", "cash flow"]),
    ("garden-planner", ["garden", "soil", "compost bin", "seedling"]),
    ("travel-guide", ["travel", "itinerary", "packing list", "flight"]),
)

# label -> probe query. Labels are stable identifiers for evidence/redaction.
PROBE_QUERIES: tuple[tuple[str, str], ...] = (
    ("multi_hit_code", "How do I refactor this code and fix a bug in the pull request?"),
    ("multi_hit_travel", "I need a packing list for my travel itinerary and a flight"),
    ("hyphen_savings_plan", "review my budget and cash flow with a savings-plan"),
    ("punctuation_normalization", "CODE!! (Pull-Request) time"),
    ("tie_break_by_key", "code and garden in one line"),
    ("threshold_boundary_single_hit", "just booking a flight"),
    ("no_match", "the quiet ocean at dawn"),
    ("empty_after_normalization", "!!! ??? ..."),
)


def _seed_personas(store: Store) -> None:
    identity = IdentityService(store, AttachmentService(store))
    for key, keywords in SEED_PERSONAS:
        identity.set_identity(
            layer="persona",
            key=key,
            content=f"Synthetic persona {key} for parity fixtures.",
            metadata=json.dumps({"routing_keywords": keywords}),
        )


def _oracle_personas(store: Store) -> list[dict]:
    """The persona routing rows exactly as the oracle reads them."""
    personas: list[dict] = []
    for ident in store.get_identity_by_layer("persona"):
        if not ident.metadata:
            continue
        try:
            metadata = json.loads(ident.metadata)
        except (json.JSONDecodeError, TypeError):
            continue
        keywords = metadata.get("routing_keywords") or []
        if not isinstance(keywords, list):
            continue
        personas.append(
            {
                "key": ident.key,
                "routing_keywords": [kw for kw in keywords if isinstance(kw, str)],
            }
        )
    return personas


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        conn = get_connection(Path(tmp) / "fixture.db")
        store = Store(conn)
        _seed_personas(store)
        identity = IdentityService(store, AttachmentService(store))

        personas = _oracle_personas(store)
        probes: list[dict] = []
        for label, query in PROBE_QUERIES:
            matches = identity.detect_persona(query, threshold=THRESHOLD)
            probes.append(
                {
                    "label": label,
                    "query": query,
                    "expected": [
                        {"key": key, "score": score, "match_type": match_type}
                        for key, score, match_type in matches
                    ],
                }
            )
        conn.close()

    golden = {
        "meta": {"threshold": THRESHOLD},
        "personas": personas,
        "probes": probes,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"threshold: {THRESHOLD}")
    print(f"personas: {', '.join(p['key'] for p in personas)}")
    for probe in probes:
        rendered = ", ".join(f"{m['key']}={m['score']:.1f}" for m in probe["expected"]) or "(none)"
        print(f"  {probe['label']}: {rendered}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
