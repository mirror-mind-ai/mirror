[< Story](index.md)

# Test Guide — CV22.DS10.TS3

## Automated Validation

Every plateau, from `ts/`:

```bash
npm run typecheck && npm run lint && npm test
```

`ts/test/evals/` covers the harness contract (the Python
`tests/unit/memory/evals/` list, ported): discovery by capability and sorted
order; infrastructure excluded without a skip-list; `runAll` threads one
`suite_run_id`, never aborts on a failing module, returns reports in order,
streams `onReport`; a raising probe is a recorded failure; unknown name and
missing `PROBES` are errors; `THRESHOLD` from the module reaches the report;
**a failed blocking probe fails the module at any score**; exactly one record
persisted per run, matching the report, `prompt_hash` stable/changing with the
prompts, `null` model/hash for a prompt-free module; persistence failure never
touches the report or exit code; a record is written at `schema_version: 3`
and the reader accepts 2 and 3; `--history` renders records newest-first and
flags a flipped probe, blocked verdicts distinctly; `--all` exits 1 on any
failure and names the failing modules; `--all` beats `--history`; importing a
probe module makes no provider call and reads no key.
`assertedInOwnVoice` passes the Python-generated golden case for case.
`ts/test/search/ranker.test.ts` carries the ten `retrieval` contracts by their
Python probe ids.

Until plateau 6, and again after it:

```bash
uv run pytest -q
```

Before the plateau-6 deletion commit:

```bash
grep -rn "evals\|memory eval" tests/ src/ scripts/ | grep -v "tests/unit/memory/evals/"
```

Every hit is in the deletion set or explained in `validation.md`.

After plateau 6:

```bash
uv run python scripts/check_retired_surfaces.py   # eval-harness row
git ls-files evals/ tests/unit/memory/evals/        # prints nothing
```

Plus the pre-push set from the workflow (generators, write-parity probes,
smokes, both suites, four checks).

## E2E Decision

**Required.** The live `--all` run is the end-to-end: real transport, real
model, real history directory. It is Navigator-run because it spends money.

## Navigator Validation

### Route 1 — keyless (free; after plateau 2)

```bash
cd ts && npm run eval -- retrieval_relevance
```

```bash
tail -1 ~/.mirror-minds/<mirror>/eval-history/retrieval_relevance.jsonl | head -c 120
```

- **Expected observation:** a `── retrieval_relevance eval ──` block, nineteen
  probe lines with ✓ (one per query, plus `mrr-aggregate`), `19/19 passed
  (threshold: 0.95) ✓ PASS`, exit 0; the `tail` shows a new line with
  `"schema_version": 3` in the **same file** that already holds the
  2026-09-21 Python record — the path is the assertion, not the append.
- **Pass:** all of the above.
- **Fail:** module not discovered, any ✗, no record appended, the record
  landed in a different directory (a second `eval-history/` somewhere), or
  exit ≠ 0.

### Route 2 — blocking semantics (free; after plateau 1)

The self-test proves it; the Navigator can see it without a key by running
the suite and reading `ts/test/evals/runner.test.ts` for the case
`a failed blocking probe fails the module at 5/6`.

- **Pass:** the test exists, is named for what it proves, and is green.
- **Fail:** the module verdict in that case is PASS.

### Route 3 — full live run and diff (paid; plateau 5)

```bash
cd ts && npm run eval -- --all
npm run eval -- extraction --history 3
npm run eval -- shadow --history 3
```

- **Expected observation:** nine module blocks in sorted order
  (`consolidate`, `conversation_summary`, `extraction`, `journal`,
  `proportionality`, `reception`, `retrieval_relevance`, `shadow`,
  `title_tags`); `9/9 evals passed ✓ SUITE PASS` or a named failure; exit code
  agreeing with the verdict. Then the diff protocol from `plan.md`, in order:
  1. per module, the TS probe-id set equals the Python record's (70 ids in
     total) — a mismatch fails the route before any verdict is read;
  2. per probe, verdict against the 2026-09-21 record; the Python baseline
     has zero instability, so **every** difference is explained in
     `validation.md` — a TS fail on a Python pass (single-probe re-run at
     n=5, ≥2/5 reproduced is a stop), and a TS pass on one of the five
     probes Python fails consistently (a finding about TS orchestration, not
     a win);
  3. `--history` shows the TS run above the Python run with the same
     `prompt_hash` and model — necessary, not sufficient: it proves the same
     templates, not the same assembled prompt.
- **Pass:** all of the above, and every `*-injection-resisted` probe is ✓.
- **Fail:** fewer than nine modules; any probe-id set mismatch; a module PASS
  alongside a ✗ injection probe; an unexplained difference in either
  direction; a `prompt_hash` that differs from Python's for the same module;
  verdict/exit mismatch.
- **If an injection probe blocks:** the probe alone is re-run at n=5 on your
  authorization. ≥2/5 obeyed is a fence regression and a stop; 1/5 or 0/5 is
  recorded as residual with the suite run recorded as blocked, and you decide
  whether to run the suite again. Never re-run the suite until green.

### Route 4 — deletion is clean (free; after plateau 6)

```bash
uv run python -m memory eval --all; echo "exit=$?"
ls ~/.mirror-minds/<mirror>/eval-history/
```

- **Expected observation:** the first command reports an unknown command
  (non-zero exit), and the history directory still lists `scene.jsonl`,
  `routing.jsonl`, and `retrieval.jsonl` with their original sizes.
- **Pass:** both.
- **Fail:** `eval` still dispatches, or any history file changed.

## Validation Evidence

Pending implementation and validation.
