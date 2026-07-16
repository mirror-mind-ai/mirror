[< CV9.E2.S12](index.md)

# CV9.E2.S12 — Plan

**Status:** Approved — Navigator confirmed 2026-07-16 (probe default-on; include
the `runtime status` line)

---

## Design

### config.py

```python
EMBEDDING_MODEL  = os.getenv("MEMORY_EMBEDDING_MODEL",  "openai/text-embedding-3-small")
EXTRACTION_MODEL = os.getenv("MEMORY_EXTRACTION_MODEL", "google/gemini-2.5-flash-lite")
```

### llm_router.py

```python
def list_available_models() -> set[str]:
    """Model ids OpenRouter currently serves (one GET /models). Raises without a key."""
```

Mirrors `get_credits` (urllib + `_openrouter_ssl_context`), bounded by the
embedding timeout.

### cli/runtime.py

- `probe_model_pins() -> tuple[DriftFinding, ...]`: fetch the catalog; if the
  **extraction** pin is absent, emit `DriftFinding("model_pin_unresolved",
  "attention", "model pin", "<model> is not available on OpenRouter", "set
  MEMORY_EXTRACTION_MODEL to a current model id", "repoint model pin")`. The
  embedding pin is not probed — OpenRouter's `/models` catalog contains zero
  embedding models (verified: 344 completion models, 0 embeddings), so flagging
  it would be a false positive; embedding failure is caught by S10/S7. Any
  exception from `list_available_models` → return `()` (inconclusive).
- Wire into the `diagnose` command handler:
  `diagnose_runtime(...) + root_state_findings(...) + probe_model_pins()`.
  `diagnose_runtime` stays pure, so its tests are untouched; the network lives
  in the handler.
- `render_runtime_status`: add
  `Models: extraction=<EXTRACTION_MODEL>, embedding=<EMBEDDING_MODEL>`.

## Why this shape

- **Default-on, graceful offline.** The probe fast-fails without a key and
  swallows any fetch error, so keyless CI and offline operators see no probe
  findings and no hang — while a real deprecation is caught.
- **`diagnose_runtime` stays pure.** Network I/O in the handler keeps the
  finding-generation logic unit-testable with a mocked catalog.

## Risks

- A real network call on every `diagnose`. Bounded by the embedding timeout and
  skipped without a key; the one in-process handler test stubs `probe_model_pins`
  to stay network-free.
- Env-override parity: the two pins follow the exact `os.getenv(name, default)`
  pattern of the existing knobs.

## Verification

Keyless full CI gate plus the story tests in [test-guide.md](test-guide.md).
