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

Slice A (verified 2026-09-02, copy-paste runnable). The TS route is gated, so
the smoke opts in explicitly with `MIRROR_TS_CONVERSATION_LOGGER=1`:

```bash
export SMOKE_HOME=$(mktemp -d)/mirror-smoke && mkdir -p "$SMOKE_HOME"
ts() { MEMORY_ENV=test MIRROR_TS_CONVERSATION_LOGGER=1 NODE_OPTIONS=--no-warnings \
  node ts/src/frontDoor/cli.ts "$@" --mirror-home "$SMOKE_HOME"; }

ts conversation-logger status                       # -> ACTIVE
echo '{"session_id":"smoke-1","prompt":"how does extraction work?"}' \
  | ts conversation-logger user-prompt              # -> silent, exit 0
echo '{"session_id":"smoke-1","prompt":"/mm-build x"}' \
  | ts conversation-logger user-prompt              # -> silent; must NOT log
ts conversation-logger mute                         # -> Conversation logging MUTED.
ts conversation-logger status                       # -> MUTED

sqlite3 "$SMOKE_HOME/memory_test.db" \
  "SELECT role, content FROM messages; SELECT title, metadata FROM conversations;"
```

Python comparison run. **Export `MIRROR_HOME`** — the hooks ignore
`--mirror-home` (see the plan's open decision), so relying on the flag alone
writes outside the disposable home:

```bash
export PY_HOME=$(mktemp -d)/mirror-py && mkdir -p "$PY_HOME"
py() { MEMORY_ENV=test MIRROR_HOME="$PY_HOME" MIRROR_USER="$(basename "$PY_HOME")" \
  uv run python -m memory "$@" --mirror-home "$PY_HOME"; }
# same five commands, then the same two SELECTs
```

- **Expected observation:** both runs produce `ACTIVE`, silence on both hook
  calls, `Conversation logging MUTED.`, `MUTED`; one user message (the slash
  command is never logged); conversation title `how does extraction work?`;
  metadata exactly
  `{"title_source": "first_user", "title_status": "provisional"}`.
- **Pass:** stdout strings, row states, and metadata bytes identical.
  *(Verified 2026-09-02: byte-identical on both sides.)*
- **Fail:** any divergence in output strings, row states, ordering, budget
  accounting, or a fallback subcommand behaving differently than before.

Later slices extend this with `session-start`, `session-end-pi`, and
`session-maintenance` once the LLM close tails land behind replay.

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

Slice A's route is gated by `MIRROR_TS_CONVERSATION_LOGGER`, so reverting is
unsetting it — no code change and no data migration:

```bash
# gate off: the same command must reach Python and behave identically
MEMORY_ENV=test MIRROR_HOME="$SMOKE_HOME" NODE_OPTIONS=--no-warnings \
  node ts/src/frontDoor/cli.ts conversation-logger status --mirror-home "$SMOKE_HOME"
grep 'conversation-logger' "$SMOKE_HOME/front-door.log" | tail -2   # route column: python
```

Export `MIRROR_HOME` for any hook subcommand on the reverted path, for the
reason above.

## Flip readiness checklist (all seven green before a subcommand flips)

1. Slice goldens green (incl. edge-case corpus + stdout goldens)
2. Real-DB-copy probe green
3. Hook-inclusive E2E smoke green
4. Regression pass over already-flipped families green
5. Redaction check green
6. Revertibility exercised once
7. Burn-down ledger updated

## Real-DB-copy write parity (slice A)

```bash
mkdir -p tmp/parity
MEMORY_ENV=test uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
MEMORY_ENV=test uv run python ts/parity/write_parity.py \
  --source-db tmp/parity/demo-memory.db --probe conversation_logger
```

Drives the real `log_user_message`/`log_assistant_message` on a copy, then
replays them through the TS logger on a second copy from the same seed with the
oracle's ids injected.

- **Expected observation:** `mutated_row_count: 4` (one conversation, two
  messages, one runtime session) and equal `python_state_hash` / `ts_state_hash`.
- **Pass:** `match: true` and `overall_match: true`.
  *(Verified 2026-09-02.)*
- **Fail:** any hash divergence — inspect with `--debug-sensitive-output` only
  on a disposable copy, never against a real database.
