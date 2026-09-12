# Plan — CV22.DS8.US3

## Objective

Flip the **ten** remaining replay-gated leaves to the live provider through
the transport US1 and US2 built, retire `MIRROR_TS_EXTERNAL_ROUTES` as a
routing input, and leave every provider-backed family on one precedence
(revert → replay → live) with one provider factory. Ten, not twelve: the
DS8 index says "twelve low-traffic leaves" but the ledger's replay-gated
table holds ten after US1 (−1) and US2 (−5) left it; the index is corrected
in this story.

The roadmap row reads as wiring. The code says otherwise. Four things the
tail exposes that the close tail did not, found in the terrain read:

1. **`consult ask` sends a two-message envelope** (`system` + `user`,
   Python's `cmd_ask`). `LiveLlmProvider` hard-codes one `user` message whose
   content is `request.prompt` — and `buildConsultLlmRequest` packs the
   messages into `request.prompt` as a JSON string, because that is what the
   replay digest and Python's `prompt` column pin. Wired as-is, live consult
   would send the JSON-encoded array as a single user message: every digest
   passes, the model reads a different conversation. This is the exact
   envelope-vs-content trap the US2 prompt-engineer review named.
2. **`mirror load --query` needs the reception tier** (10 s, Python's
   `LLM_TIMEOUT_RECEPTION`). `LiveLlmProvider` resolves the extraction tier
   (60 s) for every role.
3. **There is no live credit provider.** `consult credits` and `consult ask`'s
   real-cost lookup need `GET /credits` and `GET /generation?id=`; the
   client has only `postJson`.
4. **The tail writes no ledger rows.** Python logs `consolidation`,
   `shadow_scan`, `week_plan`, `journal_classification`, and the `embedding`
   rows behind `journal`, `soul harvest save`, and `consolidate apply`'s
   merge; the TS routes for all of them log nothing, and the reception row
   is written unpriced. Under replay no usage comes back, the goldens pin
   Python's rows but no TS test asserts TS's, so the gap has been invisible.
   Under live it is real spend absent from the table the burn-down and any
   future budget guard read as ground truth. CR075 is one instance of this;
   the story owns the class.

And one thing worse than a gap: **`soul harvest save` has no provider wired
at all.** `routing.ts` sends it to TS under `MIRROR_TS_SOUL_EMBEDDING_REPLAY`,
and `soulRoute`'s default `embed` then throws. The pure write is ported and
probed (US6 plateau 5); the front-door path cannot complete. Nobody sets that
variable in production, so nobody saw it.

The Plan review (2026-09-11; ai-engineer, prompt-engineer,
security-engineer, database-architect, quality-assurance) added two more
that the first draft under-stated, both folded in below: the three leaves
whose failure path is **swallowed** can pass a live smoke while proving
nothing about the model, and the **three prompt families that predate the
digest discipline** would go live with no oracle check on what the model
hears.

## Decisions taken at plan time

| Decision | Choice | Grounds |
|---|---|---|
| `descriptor` ledger gap | **Close it in TS** — one priced `descriptor` row per generated entity; `conversation_id` and `session_id` `NULL`; recorded in `decisions.md` as a deliberate divergence | 2026-08-13: TS is product authority for a ported command, Python compatibility-only. `descriptor generate` is the one command here that fans out per entity; a ledger blind to it blinds any future spend guard (ai-engineer, database-architect, security) |
| Cultivation revert shape | **Tail-only** — `MIRROR_TS_CULTIVATION=0` reverts `consolidate scan|apply` and `shadow scan`; `list`, `reject`, `show`, and `apply` without a merge stay on TS | US2's precedent for the close tail; no dissent |
| GET timeouts | **Bound each attempt** at the embedding tier (15 s) where Python's `urlopen` has none | The tier Python uses for its other cheap GET (`/models`); recorded in `decisions.md`; no dissent |
| New revert variables | `MIRROR_TS_CONSULT`, `MIRROR_TS_MIRROR_QUERY`, `MIRROR_TS_CULTIVATION` | Those families never had a revert — an external-routes gate plus a fixture is not one; DS8 done condition requires a single-variable revert per family |
| CR075 / CR077 closure | Through this story; **Driver and Delivery assigned by the Navigator at closure** | Collaboration protocol: never inferred |

## Scope

### 1. Transport gaps — `ts/src/providers/`

- **Envelope.** `LlmRequest` gains an optional `messages` (ordered
  `{ role: "system" | "user", content }[]`; the type admits nothing else, so
  a prefill or assistant turn cannot be added without a review).
  `LiveLlmProvider` sends `request.messages` when present, else
  `[{ role: "user", content: request.prompt }]` as today.
  `buildConsultLlmRequest` sets both: `messages` for the wire and `prompt`
  (the JSON envelope) for the digest and the `prompt` column. Hermetic test:
  consult's live request body carries two messages, `system` first, content
  byte-identical to `SYSTEM_PREAMBLE + context` and to the user prompt.
  Every other role keeps the single-message assertion US2 pinned. The
  envelope shape is also graded against Python in the prompt-assembly golden
  (§1a), not only asserted in a unit test.
- **Per-role timeout tier.** `LiveLlmProvider` resolves the tier from the
  request role through one data map: `reception` → `reception`, everything
  else → `extraction`. One place, no drift (the `LLM_ROLES` lesson). Stated
  latency bound for `mirror load --query`, the per-activation surface: with
  Python's retry arithmetic (`LLM_MAX_RETRIES` = 2 → three attempts) the
  worst case before the empty-result fallback is ≈ 3 × 10 s + backoff. Same
  as Python; written down here and reported by the smoke.
- **`getJson`** on `OpenRouterClient`: same redaction, same taxonomy, same
  timeout/retry options as `postJson`. `LiveCreditProvider` implements
  `getCredits` (`/credits`, `balance = total_credits − total_usage`) and
  `fetchGenerationCost` (`/generation?id=`, Python's polling loop: up to five
  attempts with 1/2/3/4 s sleeps, **every** exception swallowed, `null` when
  `total_cost` never appears — a poll for data OpenRouter exposes late, not a
  transport retry, so `maxRetries: 0` per attempt). `generation_id` is
  provider-supplied input crossing into a URL: shape-checked (non-empty, no
  whitespace) and `encodeURIComponent`-ed, with a test (security).
- **CR077.** `ProviderTransportSpec.replayVar` becomes `replayVars:
  readonly string[]`; `resolveProviderTransport` returns
  `mode: "incomplete_replay"` naming the missing half when some but not all
  are set. `routing.ts` maps it to `python` with the runtime's refusal reason
  and `loggerRuntime` drops its private pairing rule. Routing and runtime
  agree by construction; US3's two-fixture families inherit the rule. Half a
  fixture still never spends money. Consult is the one asymmetric family:
  `MIRROR_TS_CREDITS_REPLAY` alone is a complete fixture for `consult
  credits` and half a fixture for `consult ask` — the spec expresses that
  per leaf, and `ask` under credits-only **refuses**, never goes live for
  the LLM half (QA).

### 1a. Prompt pins for the pre-digest roles (prompt-engineer, blocking)

"Prompts are digest-pinned oracle artifacts" is true of the close tail, the
three US11 roles, and the soul voices — `prompt-assembly.golden.json` and
`soul-prompt.golden.json` pin them. It is **not** true of `reception` (US4),
`consolidation` and `shadow_scan` (US3), or consult's preamble: those
templates were ported before the digest discipline existed, their fixtures
pin no SHA, and `propose.test.ts` explicitly defers prompt-level behavior to
"DS8 + evals". At cutover the model would hear whatever TS assembles with
nothing comparing it to Python.

**Amended 2026-09-11, plateau 3 — a `plan_rule_conflict` stop.** The section
above assumed every pre-digest family already assembles Python's prompt in
TypeScript and merely lacks a SHA pin. Measured, that holds for `reception`
and for consult's preamble. It is **false** for `consolidation` and
`shadow_scan`: `propose.ts` sends a fenced Markdown dump of the memories — 121
and 209 bytes against Python's 2,247 and 1,598 — with no task statement, no
untrusted-input guard, and no JSON output contract. The deferral was
deliberate and recorded in that file's own header. Porting those two templates
became **CV22.DS8.TS2** and group C is gated on it; see
[Decisions](../../../../decisions.md#the-cultivation-prompt-templates-are-their-own-story-not-a-line-in-the-cutover).

What stays in this plateau, with no prompt text edited:

- extend `generate_prompt_assembly_golden.py` with `reception` scenarios
  (plain, unicode, injection probe — the close tail's three) and pin the
  assembled bytes; add the digest to the mirror replay fixture;
- pin consult's `SYSTEM_PREAMBLE` as a constant and the `[system, user]`
  envelope as a shape;
- **fix reception's assembly, which corrupts on `$` patterns.** TS uses
  `String.replace()` with a string pattern, so `$&`, `` $` ``, `$'`, and `$1`
  inside a persona description are substitution directives: a persona
  described as `Cost: $& per hour` assembles as `Cost: {personas} per hour`.
  Python's `str.format` has no such behavior. `pyFormat` already exists and is
  what the US11 templates use. A parity defect in a leaf this story flips,
  found by the pin work and fixed with it.

This is a **precondition for group A**. Group C's precondition is TS2.

### 2. One provider factory — `ts/src/providers/familyProviders.ts`

`resolveFamilyProviders(env, spec)` → `{ llm, embeddings, credits }` built
from the transport decision: replay providers from the spec's fixture
variables, live providers otherwise, refusal by name on
`incomplete_replay`, `null` on `python` (the route falls back, as
`loggerCli` does). Replaces the six inline `loadReplay*` blocks in `cli.ts`,
`mirrorModeRoute.ts`, `consultRoute.ts`, and the throwing default in
`soulRoute.ts`. `loggerRuntime.ts` migrates to it too — it is the family
that motivated CR077 and the proof the factory is general.

### 3. Family specs (data, `transport.ts`)

| Family | Leaves | Revert | Replay fixtures |
|---|---|---|---|
| `CONSULT_TRANSPORT` | `consult credits`, `consult ask` | **`MIRROR_TS_CONSULT`** (new) | `MIRROR_TS_CONSULT_LLM_REPLAY` + `MIRROR_TS_CREDITS_REPLAY` (credits alone suffices for `credits` only) |
| `MIRROR_QUERY_TRANSPORT` | `mirror load --query` | **`MIRROR_TS_MIRROR_QUERY`** (new; deterministic `mirror load` unaffected) | `MIRROR_TS_MIRROR_LLM_REPLAY` + `MIRROR_TS_MIRROR_EMBEDDING_REPLAY`; `MEMORY_RECEPTION=0` still skips the LLM half on both engines |
| `CULTIVATION_TRANSPORT` | `consolidate scan`, `consolidate apply`, `shadow scan` | **`MIRROR_TS_CULTIVATION`** (new; **tail-only**, decided) | `MIRROR_TS_CULTIVATION_LLM_REPLAY` + `MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY` |
| `SOUL_HARVEST_TRANSPORT` | `soul harvest save` | `MIRROR_TS_SOUL` (existing family switch) | `MIRROR_TS_SOUL_EMBEDDING_REPLAY` |
| `JOURNAL_TRANSPORT` | `journal` | `MIRROR_TS_JOURNAL` (existing) | `MIRROR_TS_JOURNAL_LLM_REPLAY` + `MIRROR_TS_JOURNAL_EMBEDDING_REPLAY` |
| `WEEK_PLAN_TRANSPORT` | `week plan` | `MIRROR_TS_WEEK` (existing; `week save`/`view` already ungated) | `MIRROR_TS_WEEK_LLM_REPLAY` |
| `DESCRIPTOR_TRANSPORT` | `descriptor generate` | `MIRROR_TS_DESCRIPTOR` (existing) | `MIRROR_TS_DESCRIPTOR_LLM_REPLAY` |

Existing variable names are kept; the three new revert variables exist
because those families never had one.

### 4. Ledger parity and the safety wrapper

Every flipped leaf writes what Python writes, priced through `computeCost`
(bodies withheld unless `MEMORY_LOG_LLM_CALLS=full`):

| Leaf | Python rows | TS today | US3 |
|---|---|---|---|
| `consult ask` | `consult`, fetched cost, else `compute_cost` estimate | row; `JSON.stringify` prompt; `NULL` cost when the poll fails | **`pythonJsonDumps`** for the `prompt` column (Python's `", "`/`": "` separators — the column must mean one thing, US2's rule); **`cost ?? computeCost(model, tokens)`** so `NULL` keeps meaning "unknown", not "poll failed" (database-architect) |
| `mirror load --query` | `reception` (priced) | row, **unpriced** | priced |
| `consolidate scan` | `consolidation` × clusters | none | wired |
| `shadow scan` | `shadow_scan` | none | wired |
| `consolidate apply` (merge) | `embedding` | hook exists, **not wired** | wired |
| `journal` | `journal_classification` + `embedding` | none | wired; embedding through `generateEmbeddingSafely` (**CR075**) |
| `soul harvest save` | `embedding` | none, **no provider** | provider wired; safety wrapper; row |
| `week plan` | `week_plan` | none | wired |
| `descriptor generate` | none (Python gap) | none | **one priced `descriptor` row per entity** (decided; documented divergence — the golden test becomes "Python zero, TS one per entity") |

Adjacent question from CR075 answered: `soul harvest save` shares the
bypass (it has nothing to bypass with), `consolidate apply` half-shares it
(wrapper yes, ledger no). All three go through the wrapper with the ledger
hook, as `memorySearch` does. Under replay the rows exist with `null` cost
(no usage), which is the shape Python's stubbed goldens already pin — the TS
tests start asserting TS's rows against them.

**Invariant, named because the factory and wrapper refactor touches every
write route:** ledger rows are never inside a write transaction. A failed
insert must not roll back the record of money spent. Pinned for `journal`
(the golden's embed-before-insert case), `soul harvest save` (§5), and the
`consolidate apply` merge (new test: embedding row persists when the merge
insert fails).

### 5. Failure-mode parity and the outcome seam

Live makes the failure branches reachable for the first time. Each is pinned
hermetically with the injected client:

| Leaf | Python on transport failure | TS must |
|---|---|---|
| `consolidate scan`, `shadow scan` | swallow → cluster skipped / `[]` | same, plus **no partial spend hidden**: rows for calls that succeeded stay |
| `mirror load --query` reception | swallow → empty result | same; query embedding degrades through the wrapper |
| `consult ask`, `consult credits` | `RuntimeError` without key; SDK/urllib error propagates | exit 1, stderr carries kind + fixed phrase, **never** a body or the key. Consult's stdout lands in the Pi transcript that the close tail logs and extracts — the same persistence boundary US2 named for the hook's stderr — so `credits` is covered, not only `ask` (security) |
| `journal`, `week plan` | exception propagates, nothing written | same; journal keeps embed-before-insert |
| `descriptor generate` | `generate_descriptor` → `""` → "skipped (empty response)" | same per entity; loop continues |
| `soul harvest save` | `generate_embedding` failure propagates from `add_memory` | same; fruit **not** cleared on failure; the failed round-trip visible in the ledger |

**Outcome seam (ai-engineer, blocking).** On the three swallow-path leaves a
transport error, a `parse_failed`, and an honest "no action" all render the
same on both engines — correct parity, and it means a live run can pass
every verdict while proving nothing about the model. Each of those routes
exposes a structured per-call outcome and surfaces it into the front-door
log the way `searchRoute` surfaces `embedding_degraded kind=`:

- `consolidate scan` / `shadow scan`: an outcome per call, plus `calls=N` for
  the invocation;
- reception: the same, for its one call;
- `descriptor generate`: `calls=N` for the fan-out (§6).

**One taxonomy, not one per surface** (amended during plateau 5). The plan
sketched `proposed|no_action|…` for cultivation and `ok|empty|…` for
reception; two vocabularies is two maps to keep in step, which is the
`LLM_ROLES` shape this story keeps meeting. The implemented union is
`answered | empty | parse_failed | transport_failed`, and the log line already
names the surface, so the outcome only has to name the SHAPE of what happened:

```text
consolidation outcome=parse_failed
consolidation calls=3 answered=2 parse_failed=1
```

One summary line per invocation, always — it carries `calls=N` and the full
distribution. Plus one line per non-`answered` call, because only those carry
a `kind=`; a line per successful call would triple the log for no diagnostic
gain. Category only, never content. The smoke reads outcomes, not counts (§7).
Cost: none — it is a seam, not a call.

### 6. Route flips and gate retirement — `routing.ts`

Every family decision reads `resolveProviderTransport`. `externalRoutesEnabled`
is deleted; `MIRROR_TS_EXTERNAL_ROUTES` leaves `RouteEnvironment`, and a test
proves a stale `=1` in someone's shell is **inert** in both directions.
`ts/README.md`, `conversation_lifecycle_smoke.ts`, and the four test files
that still set it are updated. Route reasons name the story and the family.

Fan-out visibility (security): `descriptor generate` without
`--layer/--key` makes one call per persona and per journey, each with the
retry ceiling — the largest single-command spend in this story, reached from
a skill. The front-door log records `calls=N` for `descriptor generate` and
`consolidate scan`, and the filtered form is the documented and smoke-tested
norm.

Flip order is by exposure, each group with its own Navigator observation:

- **Group A — attended, read-mostly, cheapest:** `consult credits` (one
  GET, no spend), `consult ask` (one call + cost poll), `mirror load
  --query` (reception + one embedding; both degrade). Requires §1a.
- **Group B — attended single writes:** `journal`, `soul harvest save`,
  `week plan`, `descriptor generate --layer … --key …` (one entity).
- **Group C — multi-call:** `consolidate scan` (one call per cluster,
  bounded by `--limit`) and `shadow scan`. **Blocked on CV22.DS8.TS2** (the cultivation prompt templates). Everything
  else this story does for that family — the transport spec, the factory, the
  ledger rows, the outcome seam, the revert variable, the gate retirement —
  lands here; only the route flip waits. If TS2 has not landed when the rest
  of US3 is validated, the two scan leaves stay replay-gated, US3 closes
  without them, and the burn-down ledger says so.

  `consolidate apply` moved to **group B** on 2026-09-11: it sends no prompt —
  a `merge` embeds the merged content, an `identity_update` makes no provider
  call — so TS2 does not gate it. The plan and the ledger both said "the three
  cultivation leaves"; measured, it is two.

### 7. Live long-tail smoke — `ts/parity/live_long_tail_smoke.ts`

Navigator-run, never CI, copy-guarded like US2's. One subcommand per leaf,
each reporting **structural verdicts and outcomes**, with latency and cost
per call:

- `credits` → three finite numbers, `balance = total − usage`, no ledger row;
- `ask` → non-empty content, `generationId`, cost `number|null` with the poll
  count, one `consult` row;
- `mirror-query` → `reception=ok|empty` (never `parse_failed` /
  `transport_failed`), attachment ranked, one priced `reception` row,
  latency reported against the stated bound;
- `journal` → memory row with 1536-dim vector, two priced rows, receipt
  within caps;
- `harvest` → journal row, fruit cleared, one row (the smoke seeds fruit on
  the copy when asked);
- `week-plan` → pending file written, items parsed as a list, one row;
- `descriptor` → one entity upserted, non-empty, one priced row;
- `consolidate-scan` → `calls=N`, N rows, **≥ 1 `answered`, zero
  `parse_failed`** — the smoke seeds a cluster that should merge when the
  copy's real data offers none, so a zero-proposal run cannot pass
  (US2's "zero live calls" lesson);
- `shadow-scan` → one row, outcome `answered` or `empty`, never
  `parse_failed`.

Key absent from all output — the smoke captures its own stdout and stderr
for the hygiene grep. A `parse_failed` outcome fails the verdict and routes
to the prompt layer, not the transport.

### 8. Documentation

Burn-down ledger (replay-gated table → **empty**; the ten leaves move to
their family rows as flipped-ungated with their revert; the "Production
reality" note is retired), `docs/reference/configuration.md` (three new
revert variables; `MIRROR_TS_EXTERNAL_ROUTES` removed), `ts/README.md`,
`decisions.md` (descriptor row and its attribution; GET timeouts), DS8 index
(count corrected; US3 row), CR075 and CR077 to `done` through this story
(Driver and Delivery assigned by the Navigator), story package handoff.

## Non-Goals

- **CV22.DS8.TS1** (`eval` ownership) — its own decision story.
- **CV22.DS8.TS2** — porting `CONSOLIDATION_PROMPT` and `SHADOW_SCAN_PROMPT`
  into TypeScript and threading `userName`/`identityContext` from the
  cultivation route. Split out of this story on 2026-09-11; group C's flip
  waits on it.
- **CR074** (`week plan` pending-file hardening) — changes both engines;
  not a cutover concern. **CR076** (collapse the three close-tail calls),
  **CR057** (discarded summary) — prompt-layer economics, US2 territory.
- Any prompt text change. Prompts are oracle artifacts; §1a pins the
  un-pinned ones, it does not edit them. Considered and excluded: teaching
  the swallow-path prompts an explicit "no action" token so the outcome
  seam could read it from the model — a behavior change under an oracle,
  for a later story with an eval behind it.
- `inspect llm-calls` and the rest of TS4; `extensions` API `send_to_model`
  (extension context runtime, TS2/TS4).
- Streaming, tool calls, provider fallback, model routing, spend/budget
  guards (AI-19 → DS9). Per-run spend is bounded only by argument limits
  (`--limit`, `--layer/--key`) and Python's same retry arithmetic; `calls=N`
  makes a runaway visible after the fact, it does not prevent one.
- Live exercise of `timeout`/`auth`/`rate_limit`/`provider_error` (hermetic
  only, as US1/US2).
- Python changes.
- Closing the Python side of the `descriptor` gap.

## Acceptance Behavior

```text
Given OPENROUTER_API_KEY set and no MIRROR_TS_* variable in the environment
When any of the ten leaves runs through the front door
Then the front-door log shows engine=ts with a DS8.US3 reason
And the llm_calls rows Python would write exist, priced, bodies withheld
And no output, log line, ledger row, or smoke capture contains the key

Given `consult <family> <question>` live
When the request leaves the client
Then the body carries two messages, system then user, contents byte-identical
    to Python's envelope, and the ledger prompt column holds Python's json.dumps bytes
And the cost column holds the fetched cost, else the computeCost estimate, else NULL

Given `mirror load --query "…"` live
When reception runs
Then the request is bounded by the reception tier (10 s default), not extraction
And the front-door log carries reception=ok|empty|parse_failed|transport_failed

Given `consolidate scan` or `shadow scan` live
When the calls complete
Then the front-door log carries calls=N with the outcome distribution
And a transport failure is distinguishable from a parse failure and from
    an honest "nothing to propose", none of which the swallow can tell apart
And a call that failed at the transport leaves no proposal and hides no paid row

Given a fixture for only one half of a two-fixture family
When the leaf runs
Then routing and runtime both report incomplete_replay naming the missing half,
    it routes to Python, and no live call is made
And MIRROR_TS_CREDITS_REPLAY alone serves `consult credits` from replay
    and refuses `consult ask`

Given MIRROR_TS_EXTERNAL_ROUTES=1 (or =0) left in a shell
When any command runs
Then routing is unchanged in both directions

Given MIRROR_TS_CONSULT=0 / MIRROR_TS_MIRROR_QUERY=0 / MIRROR_TS_CULTIVATION=0
When the family's provider-crossing leaf runs
Then it routes to Python, and the family's deterministic leaves stay on TS

Given `soul harvest save` with harvested fruit and a live embedding failure
When the save runs
Then no journal row is written, the fruit is NOT cleared, exit 1,
    and the failed round-trip is visible in the ledger

Given a `consolidate apply` merge whose insert fails after the embedding succeeded
When the command exits
Then the embedding row remains in the ledger

Given the injected client receives 401 / 429×3 / 500,500,200 / abort / empty data
When LiveCreditProvider.getCredits runs
Then auth / rate_limit / success / timeout / malformed_output, no body in any error
And fetchGenerationCost returns null after its poll budget without throwing
And a generation id with whitespace is refused before any request is built
```

## Validation Route

### Automated (CI, hermetic — `OPENROUTER_API_KEY` asserted unset)

- `cd ts && npm run typecheck && npm run lint && npm test`.
- `llm.test.ts`: consult envelope on the wire; `messages` type admits only
  `system`/`user`; single-message assertion kept for every other role;
  timeout tier by role.
- `credits.test.ts` (new live section): `/credits` arithmetic and taxonomy;
  `/generation` poll — `total_cost` on attempt 3 after two empties, sleeps
  1 s then 2 s (injected), `null` after five, exceptions swallowed; id
  shape check and encoding.
- `promptAssembly.test.ts` + regenerated `prompt-assembly.golden.json`:
  `reception`, `consolidation`, `shadow_scan` byte-identical to Python across
  plain/unicode/injection scenarios; consult preamble constant and envelope
  shape; fixtures now pin digests for those roles.
- `transport.test.ts`: `replayVars` pairing, `incomplete_replay` names the
  missing variable, consult's per-leaf asymmetry, US2's family still
  resolves identically, stale `MIRROR_TS_EXTERNAL_ROUTES` ignored.
- `familyProviders.test.ts`: all four modes per family; live builds live;
  `python` yields `null`.
- `routing.test.ts`: ten leaves live with nothing set; each revert reverts
  its own leaves and no others; every replay path still selects replay.
- Ledger tests per leaf, graded against the existing goldens' `llm_calls`
  (journal 2 rows and the embed-before-insert case; consolidate/shadow/week
  row per call; harvest one row; reception priced; consult `prompt` bytes
  under `full` and the cost fallback; descriptor one per entity; merge row
  persists on insert failure).
- Outcome seam tests: each of `answered|empty|parse_failed|transport_failed`
  reaches the front-door log with `calls=N`; reception's four outcomes; the
  two zero-proposal runs (healthy vs broken) are legible apart; content never
  present.
- Failure-mode tests per the §5 table, with the fixed-phrase stderr rule for
  `consult credits`, `consult ask`, `journal`, `week plan`, `harvest save`.
- Regression: every golden and both lifecycle smokes byte-identical under
  replay.

### Navigator-run (never CI), in this order

1. `live_long_tail_smoke.ts credits` on `tmp/parity/real-copy.db` — the
   cheapest live check, no spend. **Gate for group A.**
2. `ask`, then `mirror-query` on the copy; compare `SELECT role, cost_usd IS
   NULL FROM llm_calls` shape with the same commands through Python on a
   second copy; read reception's outcome and latency.
3. Group A on the real home **through the skills, not a shell**: `/mm-consult`
   for `credits` and one question; `/mm-mirror` with a query — the ledger
   shows zero `reception` rows on this home, so the query path has never
   been exercised live here through either engine, and the revert variables
   are read when Pi launches, so the skill path is the only check that
   matches production (QA).
4. Group B on the copy (`journal`, `harvest`, `week-plan`, `descriptor` for
   one entity), then on the real home under the acceptance lines below.
   **Gate for group C.**
5. Group C on the copy: `consolidate scan --limit 10` (seeded mergeable
   cluster), `shadow scan --limit 5`, `consolidate apply` on one `merge`
   proposal; then `scan --limit 5` once on the real home.
6. Reverts: each of the three new variables and the four existing ones;
   half-fixture refusal for the three two-fixture families **and** the
   credits-only-with-`ask` edge.
7. Key hygiene: `grep -c "<key>"` over the front-door log, the `llm_calls`
   bodies, and the smoke's captured stdout/stderr → all `0`.

**Real-home acceptance lines (QA).** Step 4 writes real product data with
real model output: a `journal` entry on the real home is a memory retrieval
will surface for years — write one you mean. `descriptor generate`
**overwrites** the entity's descriptor, and the front door's pre-write backup
is a fixed-name last-write undo that the next write replaces — pick an entity
you would accept regenerating, or restore immediately if the result is
worse. `week plan` leaves a pending file and `consolidate scan` leaves
pending proposals — consume, reject, or keep them consciously, and record
which in the evidence.

E2E decision: **required, staged.** Nine of ten leaves write; three are
interactive and the rest are invoked by skills the Navigator runs. A
fixture cannot show that a real model, given digest-graded prompts, returns
something each parser can use.

## Implementation Contract

- TDD: transport branches, factory modes, routing precedence, ledger rows,
  and outcome seams red first.
- Plateaus, each committable: (1) **CR077 spec generalization + factory**,
  US2 family migrated, no behavior change, suite green; (2) transport gaps
  — envelope, timeout tier, `getJson` + `LiveCreditProvider` with the id
  boundary; (3) **prompt pins for the pre-digest roles** (§1a); (4) **ledger
  parity + safety wrapper** for the whole tail, including the harvest
  provider wiring, consult's column bytes and cost fallback, the descriptor
  row, graded under replay against the goldens; (5) outcome seam + `calls=N`
  in the front-door log; (6) family specs + route decisions + gate
  retirement, replay still reachable; (7) smoke script; (8) **flip group A +
  Navigator steps 1–3**; (9) group B + step 4; (10) group C + step 5;
  (11) reverts, hygiene, docs, ledger, `decisions.md`, CR075/CR077 closure.
  A session that stops between plateaus records it in the package.
- **Plateau 10 (group C) is gated on CV22.DS8.TS2.** Its non-flip work — the
  cultivation ledger rows, the outcome seam, the revert variable, and the
  factory migration — belongs to plateaus 4–6 and is not gated.
- Plan review (2026-09-11) findings folded in: ai-engineer (outcome seam,
  zero-proposal guard, stated latency bound, descriptor gap closed),
  prompt-engineer (digest pins for `reception`/`consolidation`/`shadow_scan`
  and consult's preamble + envelope as a precondition for groups A and C;
  no text changes), security-engineer (`calls=N` fan-out visibility,
  `generation_id` URL boundary, consult stdout as a persistence boundary),
  database-architect (`pythonJsonDumps` for consult's `prompt`, cost
  fallback, descriptor row attribution, ledger-outside-transaction
  invariant), quality-assurance (real-home acceptance lines, skill-path
  validation, credits-only edge, smoke output in the hygiene grep).
  Engineer and devops-engineer lenses were not requested for this review;
  the DS8 mandatory pair (security + ai-engineer) is satisfied. Handoff
  review after validation.
- No prompt text changes; no Python changes; `uv run` for Python;
  story-scoped `git add`; English commit messages explaining why.

## Stop Conditions

- scope_change_detected — a leaf needs a request shape Python does not
  send, or a Python change becomes necessary.
- plan_rule_conflict — a golden or prompt digest moves under replay; the
  §1a regeneration reveals a TS prompt that already drifted from Python
  (that is a parity defect to fix before any flip, not a golden to
  re-pin).
- failing_required_check_without_clear_fix.
- navigator_decision_needed — step 2 shows a ledger shape Python does not
  produce; CR075/CR077 Driver and Delivery at closure.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- the multi-persona Plan review (security + ai-engineer mandatory) ran on
  2026-09-11 and its findings are folded in above; approval is now the
  Navigator's call.
