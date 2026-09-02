# Test Guide — CV22.DS7.US5 Extraction Lifecycle

Navigator-runnable validation routes. All commands from the repo root; nothing
here touches the live production database.

## Automated (CI-shaped, local)

```bash
# TS suite (slice tests land under ts/test/conversation/ and ts/test/extraction/)
cd ts && npm test && npm run typecheck && npm run lint && cd ..

# Python suite (non-live) — oracle side must stay green and undrifted
uv run pytest tests/ -q --ignore=tests/live
uv run python scripts/check_oracle_drift.py

# Golden determinism — regeneration must be a no-op on a clean tree
MEMORY_ENV=test uv run python ts/parity/generate_conversation_logger_golden.py   # added in slice A
MEMORY_ENV=test uv run python ts/parity/generate_conversation_append_golden.py   # added in slice B
MEMORY_ENV=test uv run python ts/parity/generate_extraction_driver_golden.py     # added in slice C
MEMORY_ENV=test uv run python ts/parity/generate_prompt_assembly_golden.py       # added in slice C (persona review)
git diff --exit-code ts/test/goldens/
```

## Real-DB-copy parity (redacted, portable)

```bash
mkdir -p tmp/parity
MEMORY_ENV=test uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
MEMORY_ENV=test uv run python ts/parity/real_db_copy_parity.py --source-db tmp/parity/demo-memory.db
```

Expected: new `conversation_logger_*` and `extraction_*` probe families report
`match: true`; `overall_match: true`.

## E2E smoke (required before any routing flip)

Disposable home; replay transport; no live provider calls.

> **QA amendments:** (1) this block must be copy-paste runnable before the
> first flip — placeholders like `<session>` are authoring-time only; (2) the
> smoke must also invoke the `user-prompt` and `session-end` **hook entries**
> through the runtime's env/stdin contract (hot path), not only the direct
> subcommands; (3) after any routing flip, re-run the front-door routing suite
> and the smokes of the already-flipped families (US1–US4, TS2).

```bash
export SMOKE_HOME=$(mktemp -d)/mirror-smoke && mkdir -p "$SMOKE_HOME"
# 1. session lifecycle through the TS front door
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts conversation-logger session-start --mirror-home "$SMOKE_HOME"
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts conversation-logger log-user <session> "hello" --mirror-home "$SMOKE_HOME"
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts conversation-logger session-end-pi <session> --mirror-home "$SMOKE_HOME"
# 2. budgeted extraction under replay
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts conversation-logger session-maintenance --mirror-home "$SMOKE_HOME"
# 3. observable end-state
uv run python -m memory memories --mirror-home "$SMOKE_HOME"
```

- **Expected observation:** the logged conversation exists, ends, extracts under
  replay into visible memories; maintenance report matches Python's string shape.
- **Pass:** identical observable output vs the same sequence run through the
  Python entry point on a copy of the same starting home.
- **Fail:** any divergence in output strings, row states, ordering, budget
  accounting, or a fallback subcommand behaving differently than before.

## Redaction check (per newly-routed subcommand)

```bash
grep -R "hello" "$SMOKE_HOME"/logs/ && echo "FAIL: payload logged" || echo "PASS: payloads redacted"
```

## Regression pass (per flip)

```bash
cd ts && node --test "test/frontDoor/**/*.test.ts" && cd ..
# plus the flipped families' existing smoke routes (US1–US4, TS2 test guides)
```

## Revertibility check

Flip the slice's `routing.ts` entry back to Python fallback, rerun the E2E
sequence: behavior must be identical with no data migration.

## Flip readiness checklist (all seven green before a subcommand flips)

1. Slice goldens green (incl. edge-case corpus + stdout goldens)
2. Real-DB-copy probe green
3. Hook-inclusive E2E smoke green
4. Regression pass over already-flipped families green
5. Redaction check green
6. Revertibility exercised once
7. Burn-down ledger updated
