[< Story](index.md)

# Test Guide — CV9.E2.S17 Embedding Provenance

## Unit tests

### Helper (`tests/unit/memory/intelligence/test_embeddings.py`)

- `embedding_provenance()` returns `embedding_model` + `embedding_dimensions`
  matching the config pins.
- `add_embedding_provenance(None)` → object with provenance; valid JSON.
- Foreign keys preserved: `{"source":"import"}` → keeps `source`, adds provenance.
- Authoritative: `{"embedding_model":"old"}` → overwritten to the current model.
- **Never raises:** `"not json"`, `"[1,2]"`, `"42"` each → fresh provenance object,
  no exception.

### Write paths

- `add_memory` stores metadata containing both provenance keys (parse the row).
- Staging path: `add_memory(embedding=<precomputed>)` still records provenance.
- Caller metadata merges, not clobbered: `add_memory(..., metadata='{"k":1}')` → both.
- `add_attachment` records provenance in its metadata.

### Reader (`tests/unit/memory/cli/test_inspect_embedding_provenance.py`)

- `count_memories_by_embedding_model()` returns the correct distribution after
  adding memories on the current pin.
- A row with NULL metadata and a row with malformed metadata both fall into the
  `unknown` (None) bucket — the query does not raise.
- `render_embedding_provenance(...)` renders counts, the model labels, and
  `unknown (pre-provenance)`; empty corpus → a clear "no stored vectors" line.

## Full verification

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live" -q   # raise ulimit -n if on stock macOS (debt D-004)
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
git diff --check
```

## Manual validation route

```bash
uv run python -m memory inspect embedding-provenance --mirror-home <a test home>
```

Expected: a distribution table with the current model and, on a real corpus, an
`unknown (pre-provenance)` bucket for vectors written before this story.
