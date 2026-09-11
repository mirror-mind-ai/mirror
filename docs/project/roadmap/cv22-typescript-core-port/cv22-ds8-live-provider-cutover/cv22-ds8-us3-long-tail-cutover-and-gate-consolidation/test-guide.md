[< Story](index.md)

# Test Guide — CV22.DS8.US3

## Automated Validation

All hermetic; `fetch` injected everywhere; the TS job asserts
`OPENROUTER_API_KEY` is unset (US2 property, unchanged).

```bash
cd ts && npm run typecheck && npm run lint && npm test
```

| Area | File | What it pins |
|------|------|--------------|
| Envelope | `ts/test/providers/llm.test.ts` | consult's live body carries two messages, `system` then `user`, contents byte-identical to Python's; the `messages` type admits only those two roles; every other role still exactly one `user` message; timeout tier `reception` for the reception role, `extraction` otherwise |
| Live credits | `ts/test/providers/credits.test.ts` | `/credits` → `balance = total − usage`; taxonomy per status; `/generation` poll: cost on attempt 3 after two empties with injected sleeps 1 s, 2 s; `null` after five attempts; exceptions swallowed; a generation id with whitespace is refused before a request is built; the id is URL-encoded; no body in any error |
| Prompt pins | `ts/test/planning/promptAssembly.test.ts` + `prompt-assembly.golden.json` | `reception`, `consolidation`, `shadow_scan` assembled bytes identical to Python across plain / unicode / injection-probe scenarios; consult `SYSTEM_PREAMBLE` constant and `[system, user]` envelope shape; the cultivation and mirror fixtures pin digests for those roles |
| Transport spec | `ts/test/providers/transport.test.ts` | `replayVars` pairing; `incomplete_replay` names the missing variable; consult's per-leaf asymmetry (credits-only serves `credits`, refuses `ask`); US2's family resolves as before; stale `MIRROR_TS_EXTERNAL_ROUTES` ignored |
| Factory | `ts/test/providers/familyProviders.test.ts` | per family: `python` → `null`, `replay` → replay providers from the fixtures, `incomplete_replay` → refusal by name, `live` → live providers; `loggerRuntime` through the factory unchanged |
| Routing | `ts/test/frontDoor/routing.test.ts` | ten leaves `ts` with nothing set; `MIRROR_TS_CONSULT=0` / `MIRROR_TS_MIRROR_QUERY=0` / `MIRROR_TS_CULTIVATION=0` revert only their provider-crossing leaves; the existing family switches still revert theirs; replay paths still select replay |
| Ledger parity | `journal`, `cultivation`, `weekPlan`, `soul`, `mirrorMode`, `consult` tests | rows per leaf graded against the goldens' `llm_calls` (journal: 2 rows and the embed-before-insert case); reception priced; harvest one `embedding` row; consult `prompt` column holds `pythonJsonDumps` bytes under `full` and `cost_usd` falls back to `computeCost`; descriptor one priced row per entity ("Python zero, TS one" — documented divergence); merge embedding row persists when the merge insert fails |
| Outcome seam | `cultivationCli`, `mirrorModeCli` tests | `outcome=proposed|no_action|parse_failed|transport_failed kind=…` per call and `calls=N` per invocation reach the front-door log for `consolidate scan` / `shadow scan`; `reception=ok|empty|parse_failed|transport_failed` for `mirror load --query`; `calls=N` for `descriptor generate`; never content |
| Failure modes | route/CLI tests per leaf | §5 table of the plan: swallow where Python swallows, propagate where it propagates; `harvest save` leaves the fruit uncleared; stderr is kind + fixed phrase for `consult credits`, `consult ask`, `journal`, `week plan`, `harvest save` |
| Regression | existing | every golden and both lifecycle smokes byte-identical under replay |

## E2E Decision

**Required, staged.** Nine of the ten leaves write. A fixture cannot show
that a real model, given the digest-graded prompts, returns something each
parser can use; a `parse_failed`-everywhere run passes every unit test, and
on the swallow-path leaves it would even pass a count-based smoke — which
is why the smoke reads outcomes.

## Navigator Validation

Preconditions: real key in `.env`; a fresh copy
`cp ~/.mirror-minds/vinicius-ts/memory.db tmp/parity/real-copy.db`; for
`harvest`, a runtime session on the copy with harvested fruit (the smoke
seeds one when asked); for `consolidate-scan`, the smoke seeds a cluster
that should merge when the copy's real data offers none; for `consolidate
apply`, a `merge` proposal from that scan.

**Revert-first rule.** Nothing here runs unattended, but the rule from US2
holds: if a leaf misbehaves on the real home, set its revert variable first
and read the front-door log's `kind=` / `outcome=` line second.

**Real-home acceptance lines — read before step 4.** These are real writes
with real model output. `journal`: a memory retrieval will surface for
years — write an entry you mean. `descriptor generate`: **overwrites** the
entity's descriptor; the front door's pre-write backup is a fixed-name
last-write undo that the next write replaces — pick an entity you would
accept regenerating, or restore at once if the result is worse. `week
plan`: leaves a pending file — consume or discard it. `consolidate scan`:
leaves pending proposals — reject or keep them consciously. Record which in
the evidence.

| # | Route | Expected | Pass | Fail |
|---|-------|----------|------|------|
| 1 | `node --env-file=.env ts/parity/live_long_tail_smoke.ts --db tmp/parity/real-copy.db credits` | three finite numbers, `balance = total − usage`, no ledger row, key absent | `PASS` | any `FAIL`; key in output |
| 2 | `… ask` then `… mirror-query` on the copy; same two commands through Python on a second copy; compare `SELECT role, cost_usd IS NULL FROM llm_calls ORDER BY called_at` | consult: content, generationId, cost `number|null` with the poll count, one `consult` row; mirror: `reception=ok|empty`, latency within the stated bound, one priced `reception` row; shapes match Python's | match | shape differs; `reception=parse_failed|transport_failed`; unpriced; body persisted |
| 3 | **Real home, group A, through the skills:** `/mm-consult credits`; one `/mm-consult <family> "<question>"`; one `/mm-mirror` activation with a query | front-door log `ts` with a DS8.US3 reason for each; rows priced; `reception=ok|empty` | all three | `python` route; unpriced; `parse_failed`; error |
| 4 | Group B on the copy: `journal`, `harvest`, `week-plan`, `descriptor --layer persona --key <one>`; then each once on the real home under the acceptance lines | journal: memory with 1536-dim vector, 2 priced rows; harvest: journal row + fruit cleared + 1 row; week: pending file, list parsed, 1 row; descriptor: one entity upserted, `calls=1`, 1 priced row | every verdict `ok` | `parse_failed` (prompt layer — route to prompt-engineer); missing row; body persisted |
| 5 | Group C on the copy: `consolidate-scan --limit 10`, `shadow-scan --limit 5`, `consolidate apply <merge-id>`; then `consolidate scan --limit 5` once on the real home | scan: `calls=N`, N `consolidation` rows, **≥ 1 `proposed`, zero `parse_failed`**; shadow: 1 row, `proposed|no_action`; merge: memory with vector + 1 `embedding` row | match | zero `proposed` on the seeded copy; any `parse_failed`; fewer rows than calls; unpriced |
| 6 | Reverts: `MIRROR_TS_CONSULT=0`, `MIRROR_TS_MIRROR_QUERY=0`, `MIRROR_TS_CULTIVATION=0`, and the existing `MIRROR_TS_SOUL|JOURNAL|WEEK|DESCRIPTOR=0`; then one fixture variable alone for mirror, cultivation, journal; then `MIRROR_TS_CREDITS_REPLAY` alone with `consult credits` **and** with `consult ask` | each reverts only its leaves (`consolidate list`, `mirror load`, `week view` stay `ts`); half fixture refuses by name, no row; credits-only serves `credits` from replay and **refuses** `ask` | as stated | a live call under a half fixture; a deterministic leaf reverted; `ask` going live under credits-only |
| 7 | `grep -c "<key>"` over `~/.mirror-minds/vinicius-ts/front-door.log`, `llm_calls WHERE prompt LIKE '%<key>%' OR response LIKE '%<key>%'`, **and the smoke's captured stdout/stderr** | `0` / `0` / `0` | all zero | anything else |

**Stop rule.** If step 2 shows a ledger shape Python does not produce, or
step 5 on the seeded copy yields zero `proposed`, do not flip on the real
home; `navigator_decision_needed`.

## Validation Evidence

Pending implementation and validation.
