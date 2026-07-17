[< Story](index.md)

# Plan — CV9.E2.S17 Embedding Provenance

## Design

### Recording — two helpers in `intelligence/embeddings.py`

```python
def embedding_provenance() -> dict[str, object]:
    return {"embedding_model": EMBEDDING_MODEL, "embedding_dimensions": EMBEDDING_DIMENSIONS}

def add_embedding_provenance(metadata: str | None) -> str:
    """Merge current provenance into a metadata JSON string.

    Preserves foreign keys; the provenance keys are authoritative for the write.
    Never raises on malformed/non-object existing metadata — falls back to a
    fresh object so a bad metadata value can never fail a vector write.
    """
```

`embeddings.py` owns `EMBEDDING_MODEL`/`EMBEDDING_DIMENSIONS`, so the helpers live
there and the service layer imports them.

### Why the write path, not `store.create_memory`

Stamping "current model" at storage time would be wrong for the exact case AI-07
exists for — a future migration writing old-model vectors. Provenance must reflect
the model that produced the vector. Today there is one global pin and every fresh
write uses it, so recording it at the write path is correct; a later migration
sets provenance explicitly per vector.

### Application points

- `MemoryService.add_memory`: `metadata=add_embedding_provenance(metadata)` — covers
  manual adds and the extraction staging path (which passes `embedding=` precomputed;
  provenance is still stamped because the staged vector used the same global pin).
- `AttachmentService.add_attachment`: set `metadata=add_embedding_provenance(None)`.
- Consolidation merge (`cli/consolidate_cmd.py`): `merged.metadata =
  add_embedding_provenance(merged.metadata)` before `create_memory`. Its input is
  `None`, exactly the helper's most-tested case.

### Reader — `inspect embedding-provenance`

- Store: `count_memories_by_embedding_model() -> list[tuple[str | None, int]]`.
  Loads `metadata` for rows with a non-null embedding and aggregates **in Python**
  (not SQLite `json_extract`) so a malformed legacy row degrades to `unknown`
  rather than raising — the same crash-safety rule as the write helper.
- Render: a pure `render_embedding_provenance(distribution) -> str`.
- Command: `cmd_inspect_embedding_provenance(args)` parses `--mirror-home`, fetches,
  prints; dispatched in `cmd_inspect` before positional parsing, like `llm-calls`.

## Guardrails

- No schema change (`metadata` TEXT column already exists on both tables).
- The write helper must never raise — table-driven test over
  `None`/`{}`/valid/foreign-key/pre-existing-provenance/malformed/non-object.
- The reader must not crash on a malformed legacy metadata row.
- Do not stamp storage-side; stamp at the write path where the model is known.

## Test-first sequence

1. Helper unit tests (taxonomy + never-raises + valid JSON).
2. `add_memory`/`add_attachment` provenance + staging + foreign-key merge tests.
3. Store distribution query test (incl. null + malformed → `unknown`).
4. Render test.
5. Implement helpers → apply at write paths → store query → inspect command.
6. Full verification; docs; status.
