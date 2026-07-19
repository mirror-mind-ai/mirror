[< CV9.E2.S9](index.md)

# CV9.E2.S9 — Plan

**Status:** Approved — Navigator confirmed the staging approach 2026-07-16

---

## Design

### memory.py

- `memory_embed_text(title, content, context) -> str`: the embedded-text
  construction (`f"{title}. {content}"` + optional context), extracted so the
  staging and generation paths embed identical text.
- `add_memory(..., embedding: np.ndarray | None = None)`: when `embedding` is
  provided, skip `generate_embedding` and store it; otherwise generate as
  before. Backward compatible — the parameter is optional and last.

### conversation.py `_extract_and_persist`

Reorder so every network embedding is generated before any write:

```python
# stage (network — may raise; nothing persisted yet)
summary_bytes = embedding_to_bytes(generate_embedding(summary_text)) if summary_text else None
staged = [(ext, generate_embedding(memory_embed_text(ext.title, ext.content, ext.context)))
          for ext in extracted]

# persist (local only)
if summary_bytes is not None:
    store summary embedding + summary
for ext, emb in staged:
    self.memories.add_memory(..., embedding=emb)
set metadata.extracted = True
```

A failure in the staging loop propagates through `_run_extraction`, which (S7)
records the attempt and re-raises — with zero memories written.

## Trade-offs

- **Staging vs. conversation-scoped dedup.** The audit offered either. Staging
  is chosen because it is robust to LLM title drift across retries and it saves
  the duplicate embedding spend outright, whereas title-equality dedup can miss
  drifted re-runs.
- **No transaction wrapper.** Chosen to keep the change to the extraction path
  only; the store phase after staging is local and effectively atomic for the
  failure mode in scope.

## Risks

- `add_memory` is public and called widely; the new parameter must default to
  `None` and preserve current behavior. Covered by the happy-path regression
  test and the existing suite.
- Embedded-text parity: `memory_embed_text` must reproduce the current string
  exactly so staged embeddings match what `add_memory` would have produced.

## Verification

Full CI gate plus the story tests in [test-guide.md](test-guide.md).
