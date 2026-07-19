"""CV9.E2.S28 (AI-14) — ONE-TIME, keyed fixture generation.

Reads the hand-authored corpus/queries in `authoring.py`, calls the real
embedding API exactly once per unique text, and writes the frozen, committed
`corpus.json` / `queries.json` the (keyless, deterministic) eval module
actually loads at run time.

Run only when the corpus/queries change, or when EMBEDDING_MODEL changes
(a deliberate, versioned regeneration — same discipline as the ts-search-parity
spike's golden.json). Requires OPENROUTER_API_KEY. Not run in CI, not run per
eval invocation — this is authoring infrastructure, matching
`spikes/ts-search-parity/generate_golden.py`'s precedent.

Usage:
    uv run python evals/_fixtures/retrieval_relevance/generate_fixtures.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from authoring import CORPUS, FROZEN_NOW, QUERIES  # type: ignore[import-not-found]

from memory.config import EMBEDDING_MODEL
from memory.intelligence.embeddings import generate_embedding
from memory.services.memory import memory_embed_text

HERE = Path(__file__).parent


def main() -> None:
    corpus_out = []
    for mem in CORPUS:
        text = memory_embed_text(mem.title, mem.content)
        vec = generate_embedding(text)
        corpus_out.append(
            {
                "id": mem.id,
                "title": mem.title,
                "content": mem.content,
                "created_at": mem.created_at,
                "memory_type": mem.memory_type,
                "layer": mem.layer,
                "relevance_score": mem.relevance_score,
                "use_count": mem.use_count,
                "access_count": mem.access_count,
                "last_accessed_at": mem.last_accessed_at,
                "embedding": [float(x) for x in vec],
            }
        )
        print(f"embedded corpus: {mem.id}")

    queries_out = []
    for q in QUERIES:
        vec = generate_embedding(q.text)
        queries_out.append(
            {
                "id": q.id,
                "text": q.text,
                "relevant_ids": q.relevant_ids,
                "rationale": q.rationale,
                "top_k": q.top_k,
                "embedding": [float(x) for x in vec],
            }
        )
        print(f"embedded query: {q.id}")

    provenance = {
        "embedding_model": EMBEDDING_MODEL,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "frozen_now": FROZEN_NOW,
    }

    (HERE / "corpus.json").write_text(
        json.dumps({"provenance": provenance, "memories": corpus_out}, indent=2) + "\n"
    )
    (HERE / "queries.json").write_text(
        json.dumps({"provenance": provenance, "queries": queries_out}, indent=2) + "\n"
    )
    print(f"\nwrote {len(corpus_out)} corpus memories, {len(queries_out)} labeled queries")
    print(f"embedding_model={EMBEDDING_MODEL}")


if __name__ == "__main__":
    main()
