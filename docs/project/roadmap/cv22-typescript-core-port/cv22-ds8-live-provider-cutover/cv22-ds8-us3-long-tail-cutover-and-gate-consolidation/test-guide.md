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
| Outcome seam | `cultivationCli`, `mirrorModeCli` tests | `outcome=answered|empty|parse_failed|transport_failed kind=…` per non-answered call and a `calls=N` summary with the outcome distribution per invocation, for `consolidate scan` / `shadow scan` / `mirror load --query` / `descriptor generate`; a healthy zero-proposal run and a `parse_failed` one are legible apart; never content |
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
`cp ~/.mirror-minds/vinicius-ts/memory.db tmp/parity/real-copy.db`.

Every probe is one subcommand of one script:

```bash
node --env-file=.env ts/parity/live_long_tail_smoke.ts --db tmp/parity/real-copy.db <probe>
```

with `<probe>` one of `credits`, `ask`, `mirror-query`, `journal`, `harvest`,
`week-plan`, `descriptor`, `apply`, `consolidate-scan`, `shadow-scan`. The
script refuses to run without a key, without `--db`, or against a live
`memory.db`; it checks the key never appears in its own output; and it prints
verdicts, counts, latencies, costs, and outcome CLASSES only — never a prompt,
a model response, a memory's content, or the identity context, because this
output is pasted into the story package.

Probe-specific arguments:

| Probe | Argument | Why |
|---|---|---|
| `ask` | `--question "…"` | optional; sends NO identity context — the envelope's shape is what is under test |
| `mirror-query` | `--query "…"` | optional |
| `journal` | `--text "…"` | optional; **writes a real memory** to the copy |
| `harvest` | `--session-id <id>` | required; the session must already hold harvested fruit (`soul harvest set`) |
| `week-plan` | `--text "…"`, `--pending <path>` | the pending file defaults into the copy's directory, never the shared one |
| `descriptor` | `--layer persona --key <one>` | **`--key` is required**, to bound the fan-out to a single entity |
| `apply` | `--proposal <id>` | required; a `pending` merge proposal in the copy |

`consolidate-scan` and `shadow-scan` read the ROUTE before spending: while
CV22.DS8.TS2 is open they print `SKIPPED` with the route's reason and make no
call. They begin working the day TS2 removes the block — no edit to the script.

**Revert-first rule.** Nothing here runs unattended, but the rule from US2
holds: if a leaf misbehaves on the real home, set its revert variable first
and read the front-door log's `kind=` / `outcome=` line second.

**Holding the real home back while validating on a copy.** The Pi extension
invokes `ts/src/frontDoor/cli.ts` from the repository root with
`--env-file-if-exists=.env`, so a flip in the working tree is live for the
running session immediately. Put the revert variables in `.env` (gitignored,
read per invocation, no relaunch needed) before starting, and remove them one
group at a time.

**Lifting the holdback for one command:** `--env-file` fills only variables
that are UNSET — a value already in the environment wins — so `env -u VAR`
does not work: it unsets the shell copy and the file supplies `=0` again. SET
the variable instead, `VAR=1`, which routes live because only an exact `"0"`
reverts.

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
| 5 | Group C on the copy: `consolidate-scan --limit 10`, `shadow-scan --limit 5`, `consolidate apply <merge-id>`; then `consolidate scan --limit 5` once on the real home | scan: `calls=N`, N `consolidation` rows, **≥ 1 `answered`, zero `parse_failed`**; shadow: 1 row, `answered` or `empty`; merge: memory with vector + 1 `embedding` row | match | zero `proposed` on the seeded copy; any `parse_failed`; fewer rows than calls; unpriced |
| 6 | Reverts: `MIRROR_TS_CONSULT=0`, `MIRROR_TS_MIRROR_QUERY=0`, `MIRROR_TS_CULTIVATION=0`, and the existing `MIRROR_TS_SOUL|JOURNAL|WEEK|DESCRIPTOR=0`; then one fixture variable alone for mirror, cultivation, journal; then `MIRROR_TS_CREDITS_REPLAY` alone with `consult credits` **and** with `consult ask` | each reverts only its leaves (`consolidate list`, `mirror load`, `week view` stay `ts`); half fixture refuses by name, no row; credits-only serves `credits` from replay and **refuses** `ask` | as stated | a live call under a half fixture; a deterministic leaf reverted; `ask` going live under credits-only |
| 7 | `grep -c "<key>"` over `~/.mirror-minds/vinicius-ts/front-door.log`, `llm_calls WHERE prompt LIKE '%<key>%' OR response LIKE '%<key>%'`, **and the smoke's captured stdout/stderr** | `0` / `0` / `0` | all zero | anything else |

**Stop rule.** If step 2 shows a ledger shape Python does not produce, or
step 5 on the seeded copy yields zero `answered`, do not flip on the real
home; `navigator_decision_needed`.

## Validation Evidence

Pending implementation and validation.
