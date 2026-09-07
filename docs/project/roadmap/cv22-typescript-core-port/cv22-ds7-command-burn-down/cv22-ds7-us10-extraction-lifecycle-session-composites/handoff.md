# Handoff — CV22.DS7.US10 (implementation complete, 2026-09-07)

**Ariad state:** active item `CV22.DS7.US10`, `last_delivery_event=plan_approved`,
no active checkpoint, no pending confirmation. Implementation is complete;
the next Ariad movement is the **Validation checkpoint**, which needs the
Navigator's acceptance. Resume with `/mm-build mirror-ts-core`.

**Branch state:** pushed; CI green (all five jobs) at the last commit.

---

## Where the story stands

| Slice | Scope | State |
|-------|-------|-------|
| **C′** | Close tail under replay | ✅ done |
| **B′** | Float metadata + `append` flip | ✅ done |
| **D** | Session composites | ✅ done |
| **E** | Diagnose/repair + backfills | ✅ done |
| **F** | The eight routing flips + E2E | ✅ done (2026-09-07) |

`conversation-logger` is **15/15 routed to TS**. The five subcommands that
cross the LLM close tail (`switch`, `session-end-pi`, `session-end`, full
`session-start`, `session-maintenance`) answer from TS only under the replay
gate — `MIRROR_TS_EXTERNAL_ROUTES=1` plus `MIRROR_TS_CONVERSATION_LLM_REPLAY`
and `MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY` — and keep the Python fallback
otherwise, which is the live-cutover boundary DS8 owns. Two revert controls:
the family switch `MIRROR_TS_CONVERSATION_LOGGER=0`, and unsetting the gate
for the five.

**One bounded exception, recorded in the ledger and plan:** `repair-journeys
--apply` stays on Python. Python gates the mutating repair behind the dated
zip archive its `backup` command produces; that port is DS7.TS1's, and the
front door's fixed-name pre-write snapshot is a weaker property. The apply
path itself is proven on copies (golden + probe); when TS1 lands `backup`,
the flip is one routing line.

## What slice F changed (five plateaus, five commits)

1. **Seams.** Python's `_run_extraction` failure accounting ported
   (`extractionRun.ts`: `extraction_attempts`, `llm_failed`, quarantine at
   the max, Python's key order); the driver now awaits the async
   orchestration — before, a rejected extraction escaped isolation and
   counted as a success. The slice-D golden gained a poison-pill scenario
   that reaches quarantine through the real pipeline on both sides.
2. **Composition root + dispatch.** `loggerRuntime.ts` builds everything
   from an explicit env; `loggerCli.ts` dispatches all fifteen subcommands
   with Python's stdout contract. The DS5 pipeline never wrote `llm_calls`
   rows for its own calls; it does now, in Python's order.
3. **Write-parity probes.** `close_tail`, `session_composites`,
   `journey_repair_apply` — both cores answered by the same stub on a copy of
   the demo DB. Found the embedding ledger rows stamped from the wall clock,
   and the DS4 `journey` probe broken since DS6.US2 (harness opened the TS
   copy without migrate-on-open). All seven probes now run in CI.
4. **Lifecycle smoke.** `ts/parity/conversation_lifecycle_smoke.ts`, 64
   checks through the real front door, in CI.
5. **The eight flips**, three commits in the approved order, each with the
   seven-point checklist in the commit message and the ledger.

## For the Validation checkpoint

Run, in this order, from the repo root:

```bash
cd ts && npm test && npm run typecheck && npm run lint && cd ..   # 1215 TS tests
uv run pytest tests/ -q --ignore=tests/live                        # 2829 Python tests
uv run python scripts/check_oracle_drift.py
node --no-warnings ts/parity/conversation_lifecycle_smoke.ts       # 64 checks, real front door
MEMORY_ENV=test uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
for p in close_tail session_composites journey_repair_apply; do
  MEMORY_ENV=test uv run python ts/parity/write_parity.py --source-db tmp/parity/demo-memory.db --probe $p
done
```

Expected: all green; the smoke prints `all checks passed`. The plan's
acceptance behavior is met with two qualifications the Navigator should
accept or refuse explicitly:

- "every remaining conversation-logger subcommand answers from TS" — true for
  every subcommand; `repair-journeys --apply` is the flag-level exception
  above.
- "the LLM-call ledger match[es] the Python oracle" — true on the probes; the
  ledger's `cost_usd` is unpriced under TS (Python prices through
  `compute_cost`), which only diverges for models in Python's price table,
  i.e. a live run. Recorded as debt observation 5 for DS8.

The pre-existing local-only failure in
`tests/unit/memory/web/test_server.py::test_operations_run_api_executes_runtime_diagnose_through_controlled_command`
remains a local-environment artifact (CI green on the same tree); deselect
it locally.

## Debt Review inputs (plan.md, seven entries)

1–4 from earlier slices (unbounded orphan spend, the discarded second
summary call, re-close cost, stored-JSON byte divergences); 5–7 from slice F
(unpriced ledger under TS, `titleNeedsImprovement` by code unit,
`repair-journeys --apply` ported-not-routed). CR candidates the Navigator
may want captured rather than deferred: 6, and the local web-server test.

## Working rules this story earned (unchanged)

1. Mutation-test every golden and probe before trusting it. Slice F: 26
   mutations across the backfill ports, 4 on the accounting, 5 on the probes
   — every one caught only after a boundary fixture was added.
2. Goldens and probes must be hermetic and regeneration-stable. Slice D's
   generator went live through a developer's key for three days; pop
   `OPENROUTER_API_KEY` before importing `memory` in every generator.
3. Never `uv run --python X` in the project checkout — it replaces `.venv`.
   Use `UV_PROJECT_ENVIRONMENT=/tmp/venv310 uv run --python 3.10 …` for the
   3.10 determinism check.
