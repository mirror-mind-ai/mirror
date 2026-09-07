# Test Guide — CV22.DS7.US10 Session Composites & LLM-Tail Flips

Navigator-runnable validation routes. All commands from the repo root; nothing
here touches the live production database. Inherits the US5
[test-guide](../cv22-ds7-us5-extraction-lifecycle/test-guide.md) recipes; this
guide adds the close-tail, composite, and flip routes. Blocks marked *(lands
in slice X)* are authoring-time until that slice lands and must be copy-paste
runnable before the first slice-F flip.

## Automated (CI-shaped, local)

```bash
# TS suite
cd ts && npm test && npm run typecheck && npm run lint && cd ..

# Python suite (non-live) — oracle must stay green and undrifted
uv run pytest tests/ -q --ignore=tests/live
uv run python scripts/check_oracle_drift.py

# Golden determinism — regeneration must be a no-op on a clean tree.
# CI runs the same six on Python 3.10 and 3.12 (gate extended 2026-09-07;
# until then only the pre-US10 generators were regenerated in CI).
MEMORY_ENV=test uv run python ts/parity/generate_metadata_lifecycle_golden.py   # landed (slice C′)
MEMORY_ENV=test uv run python ts/parity/generate_prompt_assembly_golden.py      # landed (slice C′, all six surfaces)
MEMORY_ENV=test uv run python ts/parity/generate_close_tail_golden.py           # landed (slice C′, call sequences)
MEMORY_ENV=test uv run python ts/parity/generate_session_composite_golden.py    # landed (slice D)
MEMORY_ENV=test uv run python ts/parity/generate_journey_repair_golden.py       # landed (slice E)
MEMORY_ENV=test uv run python ts/parity/generate_backfill_golden.py             # landed (slice E: Pi/Codex/transcript + hook routes)
git diff --exit-code ts/test/goldens/
```

## Backfill state goldens (slice E)

The three backfills and the four `hook_session_end` routes are graded as
resulting database state over the committed corpus in
`ts/test/fixtures/backfill/`. The import-vs-live-hook race (resolved decision
4B) is proven with a real second process holding the write lock.

```bash
cd ts && node --test test/conversation/backfill.test.ts \
  test/conversation/transcriptBackfill.test.ts test/conversation/logger-hooks.test.ts && cd ..
```

- **Pass:** counts and full state (conversations, messages, runtime sessions
  in insertion order) equal the oracle's; the Pi walk order is `a/b.jsonl`
  before `a-x/c.jsonl`; the race test leaves the live binding active with
  count 0.
- **Fail:** any state divergence, a string-ordered walk, or a clobbered
  binding. Mutation-check: flip `<=` to `<` on any bound in
  `transcriptBackfill.ts` — a fixture sits on every boundary, so one test
  must fail.

## Replay prompt-digest assertion (slice C′)

Every extraction/title/tags/summary replay fixture carries an
assembled-prompt digest, with assembly goldens enumerated **per branch**
(title-improvement variant; tags from generated vs. refinement summary —
2026-09-03 panel). Tamper check — corrupting one digest must fail loudly:

```bash
cd ts && node --test test/conversation/extraction*.test.ts && cd ..
# then flip one digest byte in a fixture copy and re-run: expect a hard failure
# naming the mismatched request, not a silent replay.
```

## LLM-call sequence goldens (slice C′, panel-blocking)

The ledger is graded as an **ordered per-scenario call sequence**, not row
presence: happy path, conditional double-summary branch,
extraction-failure-then-finalize, and the idempotent re-run.

```bash
cd ts && node --test test/conversation/closeTail.test.ts && cd ..
```

- **Pass:** each scenario's surface sequence matches Python's exact order and
  count. Landed 2026-09-03 with five scenarios, including the
  `double_summary_when_generation_is_blank` branch (four calls, zero bytes
  changed) and `rerun_over_finalized_conversation` (six calls — re-closing is
  not free).
- **Fail:** same end state with a different call count or order — that is a
  diverged call graph, not a pass.

The **zero-call idempotent re-run** assertion belongs to slice D, not here: it
is a `session-maintenance` property (`extract_pending` finds nothing eligible),
not a close-tail property. The close tail legitimately regenerates on re-close,
which `rerun_over_finalized_conversation` pins.

## Real-DB-copy write parity (redacted, portable)

The Python CLI has no replay transport — its close tail either goes live
through a key or fails — so the only Python-vs-TS comparison on the same
starting state for the LLM-crossing subcommands is in-process, with both
cores answered by the same stub. That is what these probes are
(`ts/parity/write_parity_lifecycle.py`); they also run in the CI parity job.

```bash
mkdir -p tmp/parity
MEMORY_ENV=test uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db

# Close tail end-state: extraction + close-time finalization + ledger (slice F)
MEMORY_ENV=test uv run python ts/parity/write_parity.py \
  --source-db tmp/parity/demo-memory.db --probe close_tail

# Session composites end-state + the report with timings normalized (slice F)
MEMORY_ENV=test uv run python ts/parity/write_parity.py \
  --source-db tmp/parity/demo-memory.db --probe session_composites

# repair-journeys dry run then --apply, before/after (slice F)
MEMORY_ENV=test uv run python ts/parity/write_parity.py \
  --source-db tmp/parity/demo-memory.db --probe journey_repair_apply
```

- **Expected observation:** each probe reports equal `python_state_hash` /
  `ts_state_hash`. `close_tail` grades 17 rows (conversation, messages,
  memory with its embedding digest, summary embedding, task, seven ledger
  rows keyed by insertion order); `session_composites` grades 47 (five
  conversations, their messages, the extracted memory and task, fifteen
  ledger rows, the bound session, and `report:session_maintenance`);
  `journey_repair_apply` grades the dry-run and applied findings, the
  journey column before and after each, and the rendered stdout.
- **Pass:** `match: true` per probe, `overall_match: true`.
- **Fail:** any hash divergence — inspect with `--debug-sensitive-output` only
  on a disposable copy. Mutation-check: change `STUB_COMPLETION_TOKENS` or
  `EMBEDDING_VALUE` in `ts/src/parity/lifecycleProbes.ts`; `close_tail` must
  fail.

## E2E smoke — full lifecycle (required before any slice-F flip)

Landed as a runnable script, and it is what the flips were proven with. It
drives every subcommand through the real front door — one process per
command, hook payloads over stdin — on a disposable home whose replay
fixtures it writes itself, and grades stdout, the route each command took
(from the front-door log), the rows left behind, redaction, and the kill
switch. Subcommands routed to Python run through the real fallback, so the
Python side reads rows TypeScript wrote.

```bash
node --no-warnings ts/parity/conversation_lifecycle_smoke.ts
```

- **Expected observation:** 64 `PASS` lines and `all checks passed`. Among
  them: the four turns logged in order; after the `session-end` hook the
  conversation carries the replayed title, tags, and summary, `extracted`
  metadata with close-time provenance, one memory, one summary embedding,
  and the ledger sequence `extraction, task_extraction, embedding, embedding,
  conversation_title, conversation_summary, conversation_tags`; the ledger
  withholds bodies; the maintenance re-run adds zero ledger rows; the
  session-less `session-end` backfills an assistant turn without ending a
  session; `switch` prints the new id and closes the previous conversation;
  `session-end-pi` is silent; `repair-journeys --apply` routes to Python;
  the front-door log carries no payload text; `MIRROR_TS_CONVERSATION_LOGGER=0`
  routes `status` to Python.
- **Fail:** any `FAIL` line; the script exits 1 and keeps the home for
  inspection (`home:` is printed first).

The manual sequence the earlier draft of this guide listed is what the
script runs; the replay transport it needs is:

```bash
MIRROR_TS_EXTERNAL_ROUTES=1
MIRROR_TS_CONVERSATION_LLM_REPLAY=<path to a kind=llm fixture>
MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY=<path to a kind=embedding fixture>
```

Without all three, the five LLM-crossing subcommands (`switch`,
`session-end-pi`, `session-end`, full `session-start`, `session-maintenance`)
keep the Python fallback by design.

## Redaction check (per newly-routed subcommand)

Run by the smoke; by hand, with `$SMOKE_HOME` set to the home it prints:

```bash
grep -R "question one" "$SMOKE_HOME" --include=front-door.log && echo "FAIL: payload logged" || echo "PASS: payloads redacted"
grep 'conversation-logger' "$SMOKE_HOME/front-door.log" | tail -5   # names + route only
sqlite3 "$SMOKE_HOME/memory_test.db" "SELECT COUNT(*) FROM llm_calls WHERE prompt != '' OR response != ''"   # 0
```

## Regression pass (per flip)

```bash
cd ts && node --test "test/frontDoor/**/*.test.ts" && cd ..
# plus the flipped families' smoke routes: US1–US4, TS2, US5 slice A test guides
```

## Revertibility check (per flip)

Two controls, both exercised by the smoke and the routing tests:

```bash
# The family switch: everything back to Python, no code change.
MEMORY_ENV=test MIRROR_TS_CONVERSATION_LOGGER=0 NODE_OPTIONS=--no-warnings \
  node ts/src/frontDoor/cli.ts conversation-logger status --mirror-home "$SMOKE_HOME"
grep 'conversation-logger' "$SMOKE_HOME/front-door.log" | tail -1   # route column: python

# The replay gate: unsetting either fixture path sends only the five
# LLM-crossing subcommands back to Python; the deterministic ten stay on TS.
```

## `conversations append` flip (slice B′)

After the float-metadata decision lands:

```bash
# Legacy-bytes tolerance: a batch stored with `1.0` metadata by Python must
# replay through TS without idempotency_conflict (and vice versa).
cd ts && node --test test/conversation/append.test.ts && cd ..
uv run pytest tests/ -q -k append
```

- **Pass:** cross-core replay of the same batch is idempotent in both
  directions, including legacy integer-valued-float metadata.
- **Fail:** any `idempotency_conflict` on a semantically-identical batch.

## Flip readiness checklist (all seven green before a subcommand flips)

1. Slice goldens green (incl. edge-case corpus + stdout goldens)
2. Real-DB-copy probe green
3. Hook-inclusive E2E smoke green
4. Regression pass over already-flipped families green
5. Redaction check green
6. Revertibility exercised once
7. Burn-down ledger updated
