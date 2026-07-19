[< CV9.E2.S13](index.md)

# CV9.E2.S13 — Plan

**Status:** Approved — Navigator confirmed 2026-07-17

---

## Design

### config.py — resolve a three-mode flag

```python
def _resolve_log_mode(raw: str) -> str:
    v = raw.strip().lower()
    if v in ("", "metadata"):   # new default: metadata-on
        return "metadata"
    if v in ("1", "full"):      # back-compat: "1" kept its old "log bodies" meaning
        return "full"
    return "off"                # "0", "off", anything unrecognized

LOG_LLM_CALLS_MODE = _resolve_log_mode(os.getenv("MEMORY_LOG_LLM_CALLS", ""))
LOG_LLM_CALLS = LOG_LLM_CALLS_MODE != "off"   # existing `if LOG_LLM_CALLS:` guards keep working
LOG_LLM_BODIES = LOG_LLM_CALLS_MODE == "full"
```

### intelligence/cost.py — the one cost authority

```python
@dataclass(frozen=True)
class ModelPrice:
    prompt_per_1k: float
    completion_per_1k: float

MODEL_PRICES: dict[str, ModelPrice] = {
    "google/gemini-2.5-flash-lite": ModelPrice(...),
    "openai/text-embedding-3-small": ModelPrice(..., 0.0),
    # consult families added as needed
}

def compute_cost(model, prompt_tokens, completion_tokens) -> float | None:
    price = MODEL_PRICES.get(model)
    if price is None or prompt_tokens is None:
        return None
    completion = completion_tokens or 0
    return (prompt_tokens / 1000) * price.prompt_per_1k \
         + (completion / 1000) * price.completion_per_1k
```

### services/observability.py — one fail-soft logger seam

```python
def build_llm_logger(store, *, role, conversation_id=None, session_id=None):
    if not LOG_LLM_CALLS:
        return None

    def _log(resp: LLMResponse) -> None:
        try:
            store.log_llm_call(
                role=role, model=resp.model,
                prompt=(resp.prompt or "") if LOG_LLM_BODIES else "",
                response_text=resp.content if LOG_LLM_BODIES else "",
                prompt_tokens=resp.prompt_tokens,
                completion_tokens=resp.completion_tokens,
                latency_ms=resp.latency_ms,
                cost_usd=compute_cost(resp.model, resp.prompt_tokens, resp.completion_tokens),
                conversation_id=conversation_id, session_id=session_id,
            )
        except Exception:   # observability must never break the pipeline it observes
            logger.warning("llm_call logging failed", exc_info=True)

    return _log
```

Placed at the **services** layer so it can combine `cost` (intelligence) with
`store.log_llm_call` (storage) without an upward import; `services/*`,
`skills/*`, and `cli/*` all consume it, replacing their inline closures.

### cli/inspect.py — render cost per row

Add an estimated-cost field to the per-row block (`$0.000123 (est)`; `—` when
`cost_usd` is NULL). No change to `--summary` (that is S14).

## Why this shape

- **Compute cost in the logger, not the router.** The logger already holds the
  `LLMResponse` (model + tokens); computing there keeps `send_to_model` pure and
  puts the body/cost policy in exactly one place.
- **One factory kills real duplication.** Six near-identical closures collapse
  into one seam — the DRY the audit implies, and the correct home for the
  metadata/full and cost decisions.
- **Fail-soft is mandatory, not cosmetic.** Since S7, an exception from the
  callback quarantines the conversation; an observability bug must never do that.

## Risks

- **Shipped-default change (off → metadata).** Mitigated: metadata never stores
  content; opt-out is `MEMORY_LOG_LLM_CALLS=off`; recorded in `decisions.md`.
- **Static prices drift.** Cost is labeled *estimated*; unknown model → NULL,
  not a misleading `0`; the table is updated alongside the model pins (AI-06).
- **Write volume.** One small metadata row per existing pipeline call
  (extraction/tasks/reception/journal); the search hot path is untouched because
  embeddings are out of scope.

## Verification

Keyless full CI gate plus the story tests in [test-guide.md](test-guide.md).
