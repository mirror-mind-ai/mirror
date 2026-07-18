[< CV7.E2 Reception](../index.md)

# CV7.E2.S1 — Reception MVP

**Status:** Done
**Epic:** CV7.E2 — Reception & Conditional Composition
**Requires:** CV7.E1 (observability substrate)
**Goal:** A `reception()` function classifies each Mirror Mode turn in one LLM call
and returns four axes; `mirror.py` uses it when `MEMORY_RECEPTION=1`, falling back
to keyword detection otherwise.

---

## What changes

Today `_resolve_defaults()` runs keyword-matching (`detect_persona()`) and
embedding-based journey detection. These heuristics work well for clear domain
queries but fail on ambiguous inputs and open questions — as the E1 routing
baseline showed (13/15, two documented misses).

S1 adds an LLM classifier that runs before the heuristics and produces a
richer signal:

```python
@dataclass
class ReceptionResult:
    personas: list[str]      # ordered, most relevant first; [] = ego responds alone
    journey: str | None      # slug of the most relevant journey, or None
    touches_identity: bool   # true only when the message invites deep self-examination
    touches_shadow: bool     # true only with evidence of avoidance/contradiction/pattern
```

`touches_identity` and `touches_shadow` are not used by `mirror.py` in S1 —
they are returned and logged. S2 will consume them to gate identity layers.
They are produced here so the baseline can be measured before composition
changes land.

---

## Design

### `reception()` — `src/memory/intelligence/reception.py`

```python
def reception(
    query: str,
    personas: list[dict],          # [{slug, description, routing_keywords}]
    journeys: list[dict],          # [{slug, description}]
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> ReceptionResult:
```

- Calls `send_to_model()` with a single user message (prompt + query)
- Parses the JSON response into `ReceptionResult`
- On any failure (LLM error, malformed JSON, invalid fields): returns
  `ReceptionResult(personas=[], journey=None, touches_identity=False,
  touches_shadow=False)` — the empty fallback that causes the caller to
  use keyword detection
- Follows the same store-free pattern as extraction: no DB imports,
  no `MemoryClient`, caller passes in the persona/journey metadata

### Reception prompt

The prompt gives the classifier:
1. The list of available personas — slug + description + routing keywords
2. The list of active journeys — slug + description
3. The user's message
4. Rules for each axis

**Rules encoded in the prompt:**

- `personas`: ordered list of matching persona slugs, most relevant first;
  empty list if the ego should answer alone. Action verbs dominate topic
  ("write a post about X" → writer, not the X-domain persona). When a single
  persona's domain clearly covers the message, return it. When genuinely
  ambiguous, return the most relevant one only.
- `journey`: the slug whose description best matches the message context,
  or null. Conservative: prefer null over a speculative match.
- `touches_identity`: true only when the message explicitly invites personal
  reflection on values, purpose, meaning, or deep self-examination. Operational
  and technical questions are false even if they touch important decisions.
  Default false — the cost of missing an identity touch is a slightly lighter
  context; the cost of over-triggering is silent token waste on every turn.
- `touches_shadow`: true only when there is explicit evidence of avoidance,
  contradiction, or a recurring pattern the user is aware of. Requires positive
  signal — absence of evidence is false, not unknown. Default false.

**Output format:**

```json
{
  "personas": ["engineer"],
  "journey": "mirror",
  "touches_identity": false,
  "touches_shadow": false
}
```

### `MEMORY_RECEPTION` feature flag

`src/memory/config.py`:
```python
RECEPTION_ENABLED = os.getenv("MEMORY_RECEPTION", "") == "1"
```

### Wiring into `mirror.py`

`_resolve_defaults()` is extended:

```python
if RECEPTION_ENABLED and query:
    result = reception(query, personas_metadata, journeys_metadata, on_llm_call=logger)
    if result.personas:
        resolved_persona = result.personas[0]
    if result.journey:
        resolved_journey = result.journey
    # touches_identity and touches_shadow stored for S2 — not yet consumed
```

If reception returns the empty fallback (all None/empty/False), the existing
keyword detection runs as before. This means the feature flag can be toggled
without breaking anything.

The persona and journey metadata is fetched from the store inside
`_resolve_defaults()` and passed to `reception()`. This keeps `reception.py`
storage-free.

### `on_llm_call` logging

Reception follows the same callback pattern as extraction. When
`MEMORY_LOG_LLM_CALLS=1`, the service layer passes a logger closure with
`role="reception"`.

Since `_resolve_defaults()` is called from `mirror.py` (not a service),
the logger is constructed inline using the store connection:

```python
if LOG_LLM_CALLS:
    def _log(response: LLMResponse) -> None:
        mem.store.log_llm_call(role="reception", ...)
```

### New eval: `evals/reception.py`

A dedicated eval separate from `evals/routing.py`. The routing eval
continues to test keyword detection (its fixture set will be the regression
net when E2.S3 promotes reception to primary). The reception eval tests the
LLM classifier directly.

**12 probes, THRESHOLD = 0.80:**

| Category | Count | What is tested |
|----------|-------|----------------|
| Clear domain → correct persona | 4 | engineering/code → engineer, writing/article → writer, health/symptom → doctor, travel/trip → traveler |
| Ambiguous → intent wins over topic | 3 | "write a post about X" → writer not X-domain; "help me think through this code structure" → engineer; "what is the meaning of freedom" → [] (ego alone) |
| Identity touch detected | 2 | explicit purpose/values question → touches_identity=True; operational task → touches_identity=False |
| Shadow touch | 2 | explicit avoidance pattern → touches_shadow=True; vague discomfort without pattern → touches_shadow=False |
| Journey detection | 1 | query clearly in scope of a known journey → correct slug |

Probes use the real production database (requires seeded personas/journeys).
Hits real LLM — costs cents per run.

---

## Implementation sequence

```
1. ReceptionResult dataclass — src/memory/models.py
2. RECEPTION_PROMPT constant — src/memory/intelligence/prompts.py
3. reception() function — src/memory/intelligence/reception.py
4. RECEPTION_ENABLED flag — src/memory/config.py
5. Wire into mirror.py — extend _resolve_defaults() behind the flag
6. Log reception calls with role="reception" when LOG_LLM_CALLS=1
7. evals/reception.py — 12 probes, THRESHOLD = 0.80
8. Tests (unit) — mock send_to_model, test happy path + fallback cases
```

---

## Files changed

| File | Change |
|------|--------|
| `src/memory/models.py` | Add `ReceptionResult` dataclass |
| `src/memory/intelligence/prompts.py` | Add `RECEPTION_PROMPT` |
| `src/memory/intelligence/reception.py` | New: `reception()` function |
| `src/memory/config.py` | Add `RECEPTION_ENABLED` |
| `src/memory/skills/mirror.py` | Extend `_resolve_defaults()` to call reception when flag set |
| `evals/reception.py` | New: 12 probes, `THRESHOLD = 0.80` |
| `tests/unit/memory/evals/test_eval_modules.py` | Add `evals.reception` to parametrized list |
| `tests/unit/memory/intelligence/test_reception.py` | New: unit tests for `reception()` |

---

## Tests

All unit tests mock `send_to_model` — no real LLM, no API key.

**`test_reception.py`:**
- Valid JSON with persona + journey → correct `ReceptionResult` fields
- Valid JSON with `touches_identity: true` → `touches_identity` is True
- Valid JSON with `touches_shadow: true` → `touches_shadow` is True
- Empty `personas` list → `personas == []`
- Null `journey` → `journey is None`
- Malformed JSON → empty fallback result
- LLM call raises exception → empty fallback result
- `on_llm_call` invoked with the `LLMResponse` when provided
- `on_llm_call` not invoked when None
- Multiple personas → first one is primary
- send_to_model called with the RECEPTION_PROMPT in messages

---

## Constraints

- `reception.py` is storage-free: no `MemoryClient`, no `Store`, no DB imports
- The empty fallback (`personas=[], journey=None, touches_identity=False, touches_shadow=False`)
  must be safe: when reception returns it, keyword detection runs unchanged
- `MEMORY_RECEPTION=1` enables the feature; `MEMORY_RECEPTION=0` (default)
  leaves existing behavior completely unchanged
- `touches_identity` and `touches_shadow` are returned but not consumed by
  `mirror.py` in S1 — S2 will wire them into conditional composition
- The reception eval requires `OPENROUTER_API_KEY` and a seeded database;
  it must not run in CI

---

## Done condition

- `reception()` returns a valid `ReceptionResult` on a live LLM call
- When `MEMORY_RECEPTION=1`, `mirror load` uses reception for persona and
  journey routing instead of keyword detection
- When `MEMORY_RECEPTION=0` (default), behavior is identical to before S1
- `uv run python -m memory eval reception` runs and scores ≥ 0.80
- All unit tests pass in CI without `OPENROUTER_API_KEY`
- `MEMORY_LOG_LLM_CALLS=1 MEMORY_RECEPTION=1` produces a `role="reception"`
  row in `llm_calls` on every Mirror Mode load

---

**See also:** [CV7.E2 index](../index.md) · [draft-analysis §4.2](../../draft-analysis.md) · [E1 baseline scores](../../../../../process/worklog.md)
