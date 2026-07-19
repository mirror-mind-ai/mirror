[< CV7.E1 Observability](../index.md)

# CV7.E1.S2 — Evals harness skeleton + first eval (`extraction`)

**Status:** Planned  
**Epic:** CV7.E1 — Pipeline Observability & Evals  
**Requires:** CV7.E1.S1 (llm_calls substrate)  
**Goal:** A runnable evals framework with the extraction eval as the first probe set;
establishes the shape that S3 probes plug into.

---

## What This Is

Tests tell us code is correct. Evals tell us behavior hasn't drifted.

They are different problems with different cost profiles:

| | `tests/` | `evals/` |
|---|---|---|
| When to run | Every commit (CI) | On demand, before shipping behavior changes |
| Determinism | Mocked I/O — deterministic | Real LLM calls — non-deterministic |
| Cost | Free | Cents per run |
| Failure semantics | Code broke | Behavior drifted |
| Pass condition | All tests pass | Probe score ≥ threshold |

`evals/` lives outside `tests/` precisely because it should not be in CI.

---

## Structure

```
evals/
  __init__.py
  runner.py          # shared runner: runs a named eval, prints report, exits 0/1
  types.py           # EvalProbe, EvalResult, EvalReport
  extraction.py      # first eval: extraction quality on canned transcripts
```

Invoked as:

```bash
uv run python -m memory eval extraction
```

This dispatches through `__main__.py` → `evals/runner.py` → `evals/extraction.py`.

---

## Types (`evals/types.py`)

```python
@dataclass
class EvalProbe:
    id: str                        # unique within the eval, e.g. "engineering-decision"
    description: str               # human-readable intent
    run: Callable[[], bool]        # returns True if probe passes

@dataclass
class EvalResult:
    probe_id: str
    passed: bool
    notes: str = ""                # optional detail for the report

@dataclass
class EvalReport:
    eval_name: str
    results: list[EvalResult]
    threshold: float               # fraction required to pass, e.g. 0.8

    @property
    def score(self) -> float:      # passes / total
    @property
    def passed(self) -> bool:      # score >= threshold
```

---

## Runner (`evals/runner.py`)

```python
def run_eval(eval_name: str) -> EvalReport
```

- Imports `evals/<eval_name>.py`
- Expects the module to expose `PROBES: list[EvalProbe]` and `THRESHOLD: float`
- Runs each probe, collects results, prints a table, returns the report
- Exits 0 if `report.passed`, exits 1 otherwise

Output format (stdout):

```
── extraction eval ──────────────────────────────────────
  ✓  engineering-decision     extracted decision memory in ego layer
  ✓  existential-reflection   extracted insight/reflection in self layer
  ✗  tension-shadow           no tension memory found
  ✓  trivial-no-memory        correctly extracted 0 memories
  ✓  commitment               extracted commitment in ego layer

  4/5 passed  (threshold: 0.80)  ✓ PASS
```

---

## The Extraction Eval (`evals/extraction.py`)

Five probes covering the cases that matter most. Each probe calls
`extract_memories()` on a canned transcript and checks the output shape.

| Probe id | Transcript topic | Expected shape |
|----------|-----------------|----------------|
| `engineering-decision` | Developer decides to refactor a module, explains the why | ≥1 memory with `memory_type` in {`decision`, `learning`}, `layer` == `ego` |
| `existential-reflection` | User reflects on purpose, what they want their life to mean | ≥1 memory with `memory_type` in {`insight`, `reflection`}, `layer` in {`self`, `ego`} |
| `tension-shadow` | User describes avoiding a difficult conversation, recognizes the pattern | ≥1 memory with `memory_type` == `tension`, `layer` in {`shadow`, `ego`} |
| `trivial-no-memory` | Brief exchange: "what time is it?" / "3pm" / "thanks" | 0 memories extracted |
| `commitment` | User explicitly commits to a concrete action by a date | ≥1 memory with `memory_type` == `commitment` |

**Threshold:** 0.8 (4 of 5 must pass).

A probe's `run()` function calls `extract_memories()` directly (real LLM,
real API). It checks whether the returned list satisfies the shape predicate.
Notes record what was actually returned for diagnostic output.

---

## `__main__.py` addition

Add `eval` as a new command:

```
eval   Run a named eval probe set
       Usage: python -m memory eval <name>
```

Dispatches to `evals/runner.run_eval(name)` and exits with the runner's return code.

---

## Developer guide addition

A section added to `docs/process/development-guide.md`:

```markdown
## Evals

Evals live in `evals/`, separate from `tests/`. They hit real LLM APIs,
cost a few cents per run, and are non-deterministic. Do not add them to CI.

**When to run:**
- Before changing any prompt in `src/memory/intelligence/prompts.py`
- Before shipping any change that touches extraction, routing, or reception logic
- After a model change in config

**How to run:**
uv run python -m memory eval extraction
uv run python -m memory eval routing      # after S3
uv run python -m memory eval proportionality  # after S3

**How to add a new eval:**
1. Create `evals/<name>.py`
2. Define `PROBES: list[EvalProbe]` and `THRESHOLD: float`
3. Each probe: an `id`, a `description`, and a `run() -> bool` callable
4. Document the expected behavior in the probe's description
```

---

## Implementation sequence

```
1. evals/__init__.py (empty)
2. evals/types.py (EvalProbe, EvalResult, EvalReport)
3. evals/runner.py (run_eval, CLI output, exit code)
4. evals/extraction.py (5 probes, THRESHOLD = 0.8)
5. __main__.py: add "eval" command dispatch
6. docs/process/development-guide.md: add Evals section
7. Tests for runner.py and types.py (mock probes — no real LLM calls)
```

---

## Files changed

| File | Change |
|------|--------|
| `evals/__init__.py` | New (empty) |
| `evals/types.py` | New: `EvalProbe`, `EvalResult`, `EvalReport` |
| `evals/runner.py` | New: runner logic, report printing, exit code |
| `evals/extraction.py` | New: 5 extraction probes, `THRESHOLD = 0.8` |
| `src/memory/__main__.py` | Add `eval` command dispatch |
| `docs/process/development-guide.md` | Add Evals section |
| `tests/unit/memory/evals/test_runner.py` | New: runner contract tests (mocked probes) |
| `tests/unit/memory/evals/test_types.py` | New: `EvalReport.score`, `EvalReport.passed` |

---

## Tests

All unit tests use mocked probes — no real LLM calls, no API keys required.

**`test_types.py`:**
- `score` is `passes / total`
- `passed` is `True` when `score >= threshold`
- `passed` is `False` when `score < threshold`
- `score` is `0.0` when all probes fail
- `score` is `1.0` when all probes pass

**`test_runner.py`:**
- `run_eval()` returns an `EvalReport`
- All-passing probes → `report.passed == True`
- Below-threshold probes → `report.passed == False`
- Unknown eval name → raises `ValueError` with the name in the message
- Runner calls each probe's `run()` exactly once
- Results list length equals probes list length

---

## Constraints

- **No CI.** The `evals/` tree is not imported by `tests/` and is not run by the
  CI workflow. Nothing in `evals/` may be imported in the normal test path.
- **Real LLM calls only in `evals/`** — the probe `run()` functions call
  `extract_memories()` directly. No mocking inside an eval.
- **Runner is storage-free** — `runner.py` does not touch the database.
  The `llm_calls` log is written by the service layer when `LOG_LLM_CALLS=1`;
  the runner does not manage that.
- **Threshold is per-eval, not global** — each eval file declares its own.

---

## Done condition

- `uv run python -m memory eval extraction` runs without error and prints a
  scored report (requires `OPENROUTER_API_KEY`)
- Exit code is 0 when score ≥ threshold, 1 when below
- Unknown eval name exits 1 with a helpful message
- The runner and types unit tests pass in CI without `OPENROUTER_API_KEY`
- Developer guide documents when and how to run evals
- S3 can add `evals/routing.py` and `evals/proportionality.py` by following
  the same pattern with no changes to the runner

---

**See also:** [CV7.E1 index](../index.md) · [draft-analysis §4.5](../../draft-analysis.md) · [Principles](../../../../../product/principles.md)
