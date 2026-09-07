# Handoff — CV22.DS7.US10 (plateau: slice E complete, 2026-09-07)

**Ariad state:** active item `CV22.DS7.US10`, `last_delivery_event=plan_approved`,
no active checkpoint, no pending confirmation. Implementation is mid-flight;
nothing is validated or done. Resume with `/mm-build mirror-ts-core`.

---

## Where the story stands

| Slice | Scope | State |
|-------|-------|-------|
| **C′** | Close tail under replay | ✅ done |
| **B′** | Float metadata + `append` flip | ✅ done |
| **D** | Session composites | ✅ done |
| **E** | Diagnose/repair + backfills | ✅ done (2026-09-07) |
| **F** | The eight routing flips + E2E | ⬜ not started |

Every port the plan names now exists in `ts/src/conversation/`; nothing new
is routed. `conversation-logger` is still **7/15** with `conversations append`
on TS. The remaining work is slice F: wiring and flipping, one subcommand at a
time, through the seven-point checklist.

### Slice E, second half (what landed 2026-09-07)

- `sessionImport.ts` — `importClosedConversation`, the atomic seam with the
  in-transaction binding re-check (resolved decision 4B). Proven by a real
  second process holding `BEGIN IMMEDIATE`, binding the session, and keeping
  its binding while the backfill returns 0.
- `backfill.ts` — `backfillPiSessions` + `resolvePiSessionsDir` (argument →
  `PI_SESSIONS_DIR` → `~/.pi/agent/sessions`), `backfillCodexSession`.
- `transcriptBackfill.ts` — `backfillAssistantMessages` (+ `parseJsonl`,
  `assistantText`). TypeScript had **no** transcript backfill before this;
  US5's hook port only resolved the path.
- `logger.ts` — `handleSessionEndHook` now ends **then** backfills, including
  the session-less route. The order is pinned: the just-ended `ended_at`
  bounds the backfill, and reversing it fails two tests.
- `sessionComposites.ts` — `backfillPiSessions` is a **required** dep (the
  slice-D stub defaulting to 0 is gone). The composite still reads no
  environment; slice F's composition root resolves the directory.
- `util/pythonText.ts` — the code-point comparator that `append.ts` and
  `metadataLifecycle.ts` had each duplicated, plus code-point slicing and
  Python's `Path` component ordering. `generateTitle` (US5) was cutting by
  UTF-16 unit; fixed, pinned by the Codex emoji golden.
- `ts/test/fixtures/backfill/` + `backfill.golden.json` +
  `generate_backfill_golden.py`; `transcript_export.py` registered as an
  oracle; CI's determinism gate now regenerates all six US10 goldens on 3.10
  and 3.12 (it regenerated none of them before).

## Slice F — read before flipping anything

**Prerequisite gap.** `test-guide.md` names three write-parity probes
(`close_tail`, `session_composites`, `journey_repair_apply`) as flip
checklist item 2, and `ts/parity/write_parity.py` has none of them — only the
four US5-era probes. Either build them before the first flip or take an
explicit Navigator decision to substitute the state goldens plus the E2E smoke
for item 2. Do not flip with item 2 silently unmet.

**Composition root.** The front door needs a `MaintenanceDeps` builder:
`closeConversation` = `endConversation` + `createCloseHooks` under the replay
gate (as `sessionComposites.test.ts` wires it), `retitleConversation` =
`maybeGenerateTitle`, `runExtraction` = the DS5 orchestration,
`backfillPiSessions` = `backfillPiSessions(db, { sessionsDir:
resolvePiSessionsDir(null, process.env, homedir()) }, deps)`, `monotonic` =
`performance.now() / 1000`, `now` = `nowIso`. `loggerCli.ts` must grow the
eight subcommands and `routing.ts`'s `TS_CONVERSATION_LOGGER_SUBCOMMANDS`
must admit each only when it flips.

**Flip order (approved plan, do not reorder):**

- `switch`, `session-end-pi`, `session-end` — need C′ only (unblocked)
- `diagnose-journeys`, `repair-journeys`, `backfill-codex-session` — need E (unblocked now)
- `session-maintenance`, full `session-start` — need C′ + D + E (unblocked now)

Each flip: seven-point checklist in `test-guide.md`, `burn-down-ledger.md`
updated, `MIRROR_TS_CONVERSATION_LOGGER=0` exercised once.

---

## Verification (all green at this plateau)

```bash
cd ts && npm test && npm run typecheck && npm run lint && cd ..   # 1190 TS tests
uv run pytest tests/ -q --ignore=tests/live                        # 2829 Python tests (see below)
uv run python scripts/check_oracle_drift.py
uv run ruff check src/ tests/ && uv run ruff format --check src/ tests/

# Golden determinism — every generator must be a no-op on a clean tree
for g in metadata_lifecycle prompt_assembly close_tail session_composite journey_repair backfill; do
  MEMORY_ENV=test uv run python ts/parity/generate_${g}_golden.py >/dev/null
done
git diff --exit-code ts/test/goldens/
```

**Resolved:** the local-only failure in
`tests/unit/memory/web/test_server.py::test_operations_run_api_executes_runtime_diagnose_through_controlled_command`
is a local-environment artifact — CI was green at `47086b9` with the same
tree. Deselect it locally; it is not US10 scope.

---

## Two working rules this story earned the hard way

**1. Mutation-test every golden before trusting it.** Now four times: slice E's
second half went green first run with five boundaries untested (window start,
window end, conversation start, window end past the clock, user text blocks).
Each was found by a surviving mutation, never by reading. Deliberately break
the constant and confirm a test fails. If nothing fails, the evidence is
decorative.

**2. Goldens must be regeneration-stable.** Slice E's second generator had a
subtler version of the same bug: `memory.config` reads `DB_PATH` at import, so
re-pointing it between sections silently kept writing to the first fixture
database. Every logger call now passes `mirror_home` explicitly and the
fixture path is resolved through the same rule. Run any new generator 3+ times
and compare hashes — and check the counts make sense before believing them.

---

## Open items carried forward

- **Debt register** (`plan.md`) has four entries awaiting Debt Review:
  unbounded orphan spend, the discarded second summary call, the cost of
  re-closing a finalized conversation, and the stored-JSON byte divergences.
- **Code-point vs code-unit elsewhere.** `titleNeedsImprovement`
  (`metadataLifecycle.ts`) compares `title.length >= 55` where Python uses
  `len()`. Same class as the `generateTitle` fix; not touched because it sits
  under the slice-C′ goldens and no fixture has an astral character near the
  boundary. Worth a CR, not a silent edit.
- **Hook-race disposition** is resolved (decision 4, plan.md); no harness.
- **DS8 inputs:** TypeScript had no prompt assembly before this story;
  `close_stale_orphans` is unbounded; re-closing costs three calls.
