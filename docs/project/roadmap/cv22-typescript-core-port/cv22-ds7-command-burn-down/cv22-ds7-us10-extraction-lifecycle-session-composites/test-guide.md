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

# Golden determinism — regeneration must be a no-op on a clean tree
MEMORY_ENV=test uv run python ts/parity/generate_metadata_lifecycle_golden.py   # landed (slice C′)
MEMORY_ENV=test uv run python ts/parity/generate_prompt_assembly_golden.py      # landed (slice C′, all six surfaces)
MEMORY_ENV=test uv run python ts/parity/generate_close_tail_golden.py           # landed (slice C′, call sequences)
MEMORY_ENV=test uv run python ts/parity/generate_session_composite_golden.py    # (lands in slice D)
MEMORY_ENV=test uv run python ts/parity/generate_journey_repair_golden.py       # (lands in slice E)
git diff --exit-code ts/test/goldens/
```

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

```bash
mkdir -p tmp/parity
MEMORY_ENV=test uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db

# Close tail end-state: extraction + close-time finalization (slice C′)
MEMORY_ENV=test uv run python ts/parity/write_parity.py \
  --source-db tmp/parity/demo-memory.db --probe close_tail

# Session composites end-state (slice D)
MEMORY_ENV=test uv run python ts/parity/write_parity.py \
  --source-db tmp/parity/demo-memory.db --probe session_composites

# repair-journeys --apply before/after (slice E) — mutating repair on copies
MEMORY_ENV=test uv run python ts/parity/write_parity.py \
  --source-db tmp/parity/demo-memory.db --probe journey_repair_apply
```

- **Expected observation:** each probe reports equal `python_state_hash` /
  `ts_state_hash`; the `journey_repair_apply` probe additionally asserts the
  dry-run findings equal the pre-apply state and the post-apply state matches
  Python's.
- **Pass:** `match: true` per probe, `overall_match: true`.
- **Fail:** any hash divergence — inspect with `--debug-sensitive-output` only
  on a disposable copy.

## E2E smoke — full lifecycle (required before any slice-F flip)

Disposable home; replay transport; no live provider calls. Hook entries are
driven through the runtime's env/stdin contract (hot path), per the US5 QA
amendment.

```bash
export SMOKE_HOME=$(mktemp -d)/mirror-smoke && mkdir -p "$SMOKE_HOME"
ts() { MEMORY_ENV=test NODE_OPTIONS=--no-warnings \
  node ts/src/frontDoor/cli.ts "$@" --mirror-home "$SMOKE_HOME"; }

# (lands in slice F; exact replay-gate env vars are fixed when C′ wires the gate)
ts conversation-logger session-start --fast          # -> ACTIVE. Maintenance deferred.
echo '{"session_id":"smoke-1","prompt":"question one"}' | ts conversation-logger user-prompt
ts conversation-logger log-assistant smoke-1 "answer one"
echo '{"session_id":"smoke-1","prompt":"question two"}' | ts conversation-logger user-prompt
ts conversation-logger log-assistant smoke-1 "answer two"
echo '{"session_id":"smoke-1"}' | ts conversation-logger session-end   # close tail under replay
ts conversation-logger session-maintenance           # -> report, timings normalized
ts conversation-logger session-maintenance           # -> idempotent re-run: zero new LLM calls

sqlite3 "$SMOKE_HOME/memory_test.db" \
  "SELECT role FROM messages ORDER BY created_at;
   SELECT title, summary, metadata FROM conversations;
   SELECT type, title FROM memories ORDER BY created_at;
   SELECT role FROM llm_calls ORDER BY created_at;"
```

Python comparison run on the same starting state (export `MIRROR_HOME`; hook
subcommands resolve the module-level home):

```bash
export PY_HOME=$(mktemp -d)/mirror-py && mkdir -p "$PY_HOME"
py() { MEMORY_ENV=test MIRROR_HOME="$PY_HOME" MIRROR_USER="$(basename "$PY_HOME")" \
  uv run python -m memory "$@" --mirror-home "$PY_HOME"; }
# same command sequence, then the same SELECTs
```

- **Expected observation:** conversations, messages, memories, embeddings, and
  LLM-call ledger rows identical on both sides in order and count; maintenance
  report string-identical after timing normalization — the normalizer first
  **validates** each timing token against the exact grammar ` (N.Ns)` (one
  digit after the decimal, parentheses, trailing `s`) and only then replaces
  the value, so grammar drift still fails; close-time metadata
  (title/tags/summary provenance) byte-identical; the re-run adds zero ledger
  rows.
- **Pass:** all compared surfaces identical; extraction ran under replay (no
  network); finalization present even for the failure-injection variant.
- **Fail:** any divergence in row states, ordering, ledger roles, report
  grammar or counts, or a fallback subcommand behaving differently.

### Session-less backfill path (slice E)

```bash
echo '{"session_id":"","transcript_path":"'$SMOKE_HOME'/transcript.jsonl"}' \
  | ts conversation-logger session-end
# Expected: assistant backfill runs with no session; exit 0; silent.
```

## Redaction check (per newly-routed subcommand)

```bash
grep -R "question one" "$SMOKE_HOME"/logs/ && echo "FAIL: payload logged" || echo "PASS: payloads redacted"
grep 'conversation-logger' "$SMOKE_HOME/front-door.log" | tail -5   # names + route only
```

## Regression pass (per flip)

```bash
cd ts && node --test "test/frontDoor/**/*.test.ts" && cd ..
# plus the flipped families' smoke routes: US1–US4, TS2, US5 slice A test guides
```

## Revertibility check (per flip)

```bash
MEMORY_ENV=test MIRROR_TS_CONVERSATION_LOGGER=0 MIRROR_HOME="$SMOKE_HOME" \
  NODE_OPTIONS=--no-warnings \
  node ts/src/frontDoor/cli.ts conversation-logger session-maintenance --mirror-home "$SMOKE_HOME"
grep 'conversation-logger' "$SMOKE_HOME/front-door.log" | tail -2   # route column: python
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
