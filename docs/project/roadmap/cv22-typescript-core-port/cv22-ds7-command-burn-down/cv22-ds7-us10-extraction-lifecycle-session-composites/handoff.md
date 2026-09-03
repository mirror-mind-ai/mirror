# Handoff — CV22.DS7.US10 (paused 2026-09-03)

**Ariad state:** active item `CV22.DS7.US10`, `last_delivery_event=plan_approved`,
no active checkpoint, no pending confirmation. Implementation is mid-flight;
nothing is validated or done. Resume with `/mm-build mirror-ts-core`.

**Branch state:** working tree clean, 11 commits ahead of `90bb5f4` (US5 closure).
Nothing pushed yet — see *Before anything else* below.

---

## Where the story stands

| Slice | Scope | State |
|-------|-------|-------|
| **C′** | Close tail under replay | ✅ done |
| **B′** | Float metadata + `append` flip | ✅ done |
| **D** | Session composites | ✅ done |
| **E** | Diagnose/repair + backfills | 🔵 half done |
| **F** | The eight routing flips | ⬜ not started |

### Slice E remaining (the next work)

1. **`backfill_pi_sessions`** — `src/memory/cli/conversation_logger.py:596`.
   Source-dir resolution order is part of the contract: explicit argument →
   module override → `PI_SESSIONS_DIR` → `~/.pi/agent/sessions`. JSONL parsing,
   `>= 2` message gate, provisional title from the first user line truncated to
   60 chars, runtime-session upsert with `closed_at`. Slice D currently injects
   this as `backfillPiSessions` returning 0; wire the real one in
   `sessionComposites.ts`.
2. **`backfill_codex_session`** — same file, line 673. Note it titles via
   `_generate_title` (deterministic truncation), **not** `set_provisional_title`
   like the Pi backfill. That asymmetry is Python's; reproduce it.
3. **The session-less backfill path** in `hook_session_end` (line 994): when
   `session_id` is empty but a transcript exists, Python still backfills. US5's
   hook port deliberately left this out.

### Slice F flip order (from the approved plan, do not reorder)

- `switch`, `session-end-pi`, `session-end` — need C′ only (**unblocked now**)
- `diagnose-journeys`, `repair-journeys`, `backfill-codex-session` — need E
- `session-maintenance`, full `session-start` — need C′ + D + E's `backfill-pi-sessions`

Each flip goes through the seven-point checklist in `test-guide.md` and updates
`burn-down-ledger.md`. `conversation-logger` is at **7/15**; `conversations
append` is already TS with revert control `MIRROR_TS_CONVERSATION_APPEND=0`.

---

## Before anything else

Nothing has been pushed. Push and verify CI before starting new work — this
branch changed Python behavior (the append contract) and CI covers 3.10 and
3.12, which is exactly where that change needs proving on someone else's
machine.

```bash
git push
gh run list --limit 1
gh run watch
```

There is one **pre-existing, unrelated** local failure:
`tests/unit/memory/web/test_server.py::test_operations_run_api_executes_runtime_diagnose_through_controlled_command`.
Confirmed failing on clean HEAD with all US10 work stashed. It spawns
`python -m memory runtime diagnose` as a subprocess and the test's wait window
expires locally. **Check whether it also fails in CI** — if it does not, it is a
local-environment artifact; if it does, it deserves its own CR. Not US10 scope
either way.

---

## Verification (all green at pause, except the above)

```bash
cd ts && npm test && npm run typecheck && npm run lint && cd ..   # 1169 TS tests
uv run pytest tests/ -q --ignore=tests/live                        # 2826 Python tests
uv run python scripts/check_oracle_drift.py
uv run ruff check src/ tests/ && uv run ruff format --check src/ tests/

# Golden determinism — every generator must be a no-op on a clean tree
MEMORY_ENV=test uv run python ts/parity/generate_metadata_lifecycle_golden.py
MEMORY_ENV=test uv run python ts/parity/generate_prompt_assembly_golden.py
MEMORY_ENV=test uv run python ts/parity/generate_close_tail_golden.py
MEMORY_ENV=test uv run python ts/parity/generate_session_composite_golden.py
MEMORY_ENV=test uv run python ts/parity/generate_journey_repair_golden.py
git diff --exit-code ts/test/goldens/
```

---

## Two working rules this story earned the hard way

**1. Mutation-test every golden before trusting it.** Three times a suite went
green on the first run and was still weak. Each time the gap was a *boundary*,
not a branch:

- C′: substance threshold `>= 4` and the medium/low confidence split `>= 10`
  survived mutation because no scenario sat on either boundary (12 boundary
  scenarios added).
- D: the stale-orphan threshold survived `30 → 60` because every fixture was
  three hours idle (29- and 31-minute fixtures added).
- E: an "ambiguous aliases" fixture compared lengths 9 and 8, so the ambiguity
  branch was never exercised at all.

Deliberately break the constant and confirm a test fails. If nothing fails, the
evidence is decorative.

**2. Goldens must be regeneration-stable, and two were not.** Slice D stored raw
wall-clock seconds; slice E stored Python's set-iteration order, which string
hash randomization varies *per process*. Both were fixed by moving the check
into the generator (raise on non-conforming input) and storing only normalized
values. Run any new generator 3+ times and compare hashes before committing.

---

## Open items carried forward

- **Debt register** (`plan.md`) has four entries awaiting this story's Debt
  Review: unbounded orphan spend, the discarded second summary call, the cost of
  re-closing a finalized conversation, and the stored-JSON byte divergences.
- **Slice D hook-race disposition** is still undecided (resolved decision 3):
  prove concurrent hook get-or-create on copies with the 8-process pattern, or
  record it as an accepted risk with rationale. Decide it explicitly.
- **DS8 inputs found here, worth carrying into that story's plan:** TypeScript
  had no prompt assembly at all before this story (a live provider would have
  sent a bare transcript with no instructions); `close_stale_orphans` is
  unbounded; and re-closing a conversation costs three extra model calls.
