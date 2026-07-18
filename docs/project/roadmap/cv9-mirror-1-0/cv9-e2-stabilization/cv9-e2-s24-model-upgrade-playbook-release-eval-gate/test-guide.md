[< CV9.E2.S24](index.md)

# CV9.E2.S24 — Test Guide

## Automated (keyless, CI-safe)

```bash
uv run pytest tests/unit/memory/evals/ -q
```

Expected: green. Key cases:

- `TestDiscoverEvalNames` — discovery returns exactly the eight `PROBES`
  modules, sorted, infra excluded.
- `TestRunAll` — per-name invocation order, one shared `suite_run_id`, in-order
  reports, `on_report` callback, and the real-`retrieval` mechanism smoke.
- `TestMainAllFlag` — exit 0 when all pass, exit 1 when any fails, summary names
  the failing eval, `--all` takes precedence over `--history`.
- `TestSuiteRunIdThreading` / `TestSuiteRunId` — stamped for a suite run, `None`
  standalone, legacy pre-v2 lines still parse.

Full gate (the same commands CI runs):

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/ evals/
uv run ruff format --check src/ tests/ evals/
uv run mypy src/memory        # 109-error D-006 baseline; touched files clean
git diff --check
```

## Manual — discovery is live and drift-proof

```bash
uv run python -c "from evals.runner import discover_eval_names; print(discover_eval_names())"
```

Expected:

```text
['consolidate', 'extraction', 'proportionality', 'reception', 'retrieval', 'routing', 'scene', 'shadow']
```

## Manual — the real record shape (no API key, hermetic eval)

`retrieval` is pure scoring math — no network, no product-DB writes. Run it and
inspect the persisted record:

```bash
uv run python -m memory eval retrieval
```

Expected: `10/10 passed  ✓ PASS`. Then find the record (under your mirror home's
`eval-history/retrieval.jsonl`, or the gitignored `evals/.history/retrieval.jsonl`
fallback) and confirm:

- `schema_version` is `2`
- `suite_run_id` is `null` (a standalone run, not part of `--all`)
- `model` is `null` (retrieval is prompt-free)

## Manual — the `.gitignore` fix

```bash
git check-ignore -v evals/.history/retrieval.jsonl
```

Expected: a match on `.gitignore` (the `evals/.history/` line). Before the fix,
this returned nothing (exit 1) because the inline comment made the pattern
literal.

## Not run here (by design)

`eval --all` in full hits every live eval (extraction, reception, scene, shadow,
consolidate) against `EXTRACTION_MODEL` — it costs money and needs an API key.
That is the human release step per the
[model upgrade playbook](../../../../../process/development-guide.md#model-upgrade-playbook),
never a CI job. The aggregation and exit-code plumbing it depends on is proven
above by the keyless `run_all(["retrieval"])` smoke and the injected-runner
`--all` tests.
