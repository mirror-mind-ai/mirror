[< Story](index.md)

# Plan — CV9.E2.S1 Embedding Resilience

## Current Behavior

Embedding generation lives in `src/memory/intelligence/embeddings.py`:

```python
def generate_embedding(text: str) -> np.ndarray:
    client = get_embedding_client()
    response = client.embeddings.create(
        input=text,
        model=EMBEDDING_MODEL,
    )
    return np.array(response.data[0].embedding, dtype=np.float32)
```

Callers include:

- `MemoryService.add_memory()` — embeds `title + content + context`, then writes
  a `Memory` row.
- `AttachmentService.add_attachment()` — embeds attachment content, then writes
  an `Attachment` row.
- `MemorySearch.search()` — embeds query text for semantic/hybrid search.
- `AttachmentService.search_attachments()` and `search_all_attachments()` —
  embed query text for attachment search.

The first two are write paths. They must not persist semantic state unless the
embedding is valid. The search paths are read paths. They need a deliberate
failure/degradation policy.

---

## Proposed Design

### 1. Introduce an explicit embedding error

Add a domain-level exception, likely in `src/memory/intelligence/embeddings.py`:

```python
class EmbeddingError(RuntimeError):
    """Raised when embedding generation fails after validation/retry."""
```

This keeps provider/library exceptions from leaking as accidental implementation
details at service boundaries.

### 2. Validate provider responses before use

Extract response parsing into a small function:

```python
def _extract_embedding(response) -> np.ndarray:
    if not response.data:
        raise EmbeddingError("No embedding data received")
    embedding = response.data[0].embedding
    if not embedding:
        raise EmbeddingError("Empty embedding payload received")
    return np.array(embedding, dtype=np.float32)
```

The important boundary: empty responses become intentional failures.

### 3. Add bounded retry

Use a small retry policy inside `generate_embedding()`:

- default attempts: 3 total
- short backoff between attempts
- retry on:
  - empty `response.data`
  - empty/missing embedding payload
  - provider exceptions that are likely transient

Keep this simple. Do not introduce a new dependency unless the standard library
is clearly insufficient.

The function signature may accept optional testing hooks:

```python
def generate_embedding(text: str, *, attempts: int = 3) -> np.ndarray:
```

or keep the public signature unchanged and test through monkeypatching a private
constant/helper. Prefer minimal API surface.

### 4. Preserve atomic write behavior

`MemoryService.add_memory()` and `AttachmentService.add_attachment()` already
generate embeddings before creating rows. That is the right order. The main task
is to make sure tests lock this behavior down:

- if embedding fails, `store.create_memory()` is not called
- if embedding fails, `store.create_attachment()` is not called
- no placeholder vector is generated

No schema change is needed for this story.

### 5. Decide search degradation deliberately

There are two viable options for query embedding failures:

**Option A — fail clearly.** Search raises `EmbeddingError` with a useful message.
Simple and honest.

**Option B — lexical-only fallback.** Memory search can fall back to FTS-only
results when query embedding fails, with semantic score absent or zeroed in a
clearly documented way.

Recommendation for S1: **Option A for attachment search; consider Option B only
for memory search if the current `MemorySearch` structure already makes it
simple.** Do not introduce a broad search refactor inside this stabilization
story.

### 6. Runtime-visible error messaging

CLI commands that directly invoke memory writes/search should not expose a raw
traceback as the primary UX when an embedding failure occurs. Catch
`EmbeddingError` at the appropriate CLI boundary where practical and print an
actionable message to stderr, for example:

```text
Embedding generation failed after 3 attempts. Check OPENROUTER_API_KEY,
provider availability, and retry the command.
```

This may be implemented narrowly for commands touched by this story rather than
across the full CLI surface.

---

## Implementation Sequence

1. Add tests for embedding response validation and retry in a new focused test
   module, e.g. `tests/unit/memory/intelligence/test_embeddings.py`.
2. Implement `EmbeddingError`, response validation, and bounded retry.
3. Add service tests for no-write-on-failure:
   - memory add
   - attachment add
4. Decide and test search behavior for query embedding failure.
5. Add narrow CLI-level handling if needed for user-facing commands.
6. Run full verification.
7. Update story status and worklog.

---

## Design Guardrails

- Do not store zero vectors or fake embeddings.
- Do not add a pending repair schema in this story.
- Do not swallow embedding failures silently.
- Do not create a large provider abstraction unless tests reveal it is necessary.
- Keep the retry policy boring and bounded.

---

## Open Question For Implementation

Should `MemorySearch.search()` fail clearly when query embedding fails, or should
it return FTS-only results? The safer default is clear failure; lexical fallback
is useful but can blur the meaning of hybrid scores if done carelessly.

**Default recommendation:** clear failure in S1, fallback as a later story if real
usage shows it is worth the added semantics.

---

## As-Built (reconciled at implementation)

This plan predated three landed stories. What actually shipped:

**Already in place before S1 (removed from scope):**

- The missing-key guard landed with CV9.E2.S10 (AI-04).
- Client-level `timeout` + `max_retries` landed with AI-01.
- Memory search already degrades to lexical-only and flags `degraded=True`
  (CV9.E2.S10). The plan's open question — fail clearly vs. lexical fallback for
  *memory* search — was therefore already answered (fallback), and
  `test_search_degradation.py` remains its guard. S1 left that path unchanged.

**What S1 added — a three-way failure taxonomy** (refined from three-lens review):

1. **permanent-input** — empty/whitespace text raises `EmbeddingError(permanent=True)`
   *before* any network call (no doomed spend);
2. **transient** — empty `data`/payload is retried up to `EMBEDDING_ATTEMPTS`
   (default 3) with short backoff. This is the class the SDK's `max_retries`
   cannot see (a 200 with empty data), i.e. the actual live failure;
3. **permanent-config** — a dimension mismatch raises `EmbeddingError(permanent=True)`
   immediately with a diagnostic message (expected vs. actual + the
   `MEMORY_EMBEDDING_MODEL` remedy). It is *not* retried, so a config error is
   never mislabeled "failed after 3 attempts".

Provider exceptions surface after the SDK's own retries and are wrapped once
(`EmbeddingError`) — this layer does not re-retry them, bounding interactive-path
latency (AI-01 philosophy).

**Conscious exclusions (recorded, not built):**

- The dimension check is *shape* verification, not *space* verification. A silent
  provider re-route to a different 1536-dim space is invisible until AI-07
  embedding provenance + a drift eval (AI-11). Named in `_extract_embedding`.
- Embedding calls still bypass the `llm_calls` ledger — deferred as an AI-09
  follow-up (debt **D-003**), safe because `EMBEDDING_ATTEMPTS` bounds retry
  amplification.
- Journey search's silent `[]` on embedding failure is pre-existing and out of
  scope (debt **D-002**).
- CLI messaging kept minimal: the clean `EmbeddingError` is the deliverable;
  write-path callers already isolate it (extraction quarantine, S7) or degrade
  (memory search, S10).
