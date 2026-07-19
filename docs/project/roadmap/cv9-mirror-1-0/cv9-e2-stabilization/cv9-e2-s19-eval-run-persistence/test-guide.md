[< Story](index.md)

# Test Guide — CV9.E2.S19 Eval Run Persistence & Trend

All unit-level, deterministic — no live LLM. Extends `test_runner.py`'s existing
pattern of mocking `PROBES` on a fake module via `mocker.patch`.

## `evals/persistence.py`

- **Path resolution:** with a mirror home resolvable, `history_path("x")` returns
  `<home>/eval-history/x.jsonl`. With none resolvable, falls back to
  `evals/.history/x.jsonl`.
- **Atomic append:** `append_run` writes one JSON line; two sequential calls
  produce two lines, first unmodified.
- **Fail-soft:** if the target path is unwritable (mock a raising `open`/write),
  `append_run` does not raise.
- **Read tolerates malformed trailing line:** a file with two valid lines + one
  truncated/invalid line → `read_history` returns the two valid records, not an
  exception.
- **Read on missing file:** `read_history` on a nonexistent path returns `[]`,
  not an error.
- **`limit`:** `read_history(name, limit=2)` on a 5-line file returns the 2 most
  recent.

## Record building (in `run_eval`)

- **`prompt_hash` is `None` when `EVAL_PROMPTS == ()`** (routing/retrieval-style
  module) — not a hash of empty content.
- **`prompt_hash` changes** when `EVAL_PROMPTS` content changes; **stable** when
  unchanged (two builds from identical `EVAL_PROMPTS` produce the same hash).
- **`model`/`prompt_hash` default to `None`** for a module that declares neither
  constant (backward compatibility — `getattr` fallback).
- **`started_at <= ended_at`**, both present.
- **Probes list matches `EvalReport.results`** exactly (id/passed/notes).

## Runner integration

- **A run persists exactly one record** to the eval's history file.
- **Persistence failure does not affect the returned `EvalReport` or exit code**
  — mock `append_run` to raise; `run_eval`/`main` behave identically to the
  no-persistence case.
- **Non-determinism is not asserted** — never assert two runs' scores are equal;
  only assert each run's record matches what its (mocked) probes returned.

## `--history` reader

- Renders N most-recent runs in reverse-chronological order.
- **First run / empty history** renders a clear "no history yet" message, not a
  crash or empty output.
- **Per-probe flip detection:** given two consecutive records where probe `x`
  was `passed=True` then `passed=False`, the render flags `x` as regressed —
  even though the aggregate score might still clear threshold.

## Full verification

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live" -q
uv run ruff check src/ tests/ evals/
uv run ruff format --check src/ tests/ evals/
git diff --check
```

## Manual validation route

```bash
# Run twice to see history accumulate (costs a few cents each — real LLM):
uv run python -m memory eval routing        # free — no LLM calls
uv run python -m memory eval routing --history
```

Expected: the second command shows one persisted run with score/threshold and
`model=None, prompt_hash=None` (routing is prompt-free) — proving the record
shape without spending on a paid eval. Optionally repeat with
`uv run python -m memory eval extraction --history` to see a real `prompt_hash`
and per-probe detail (costs a few cents).
