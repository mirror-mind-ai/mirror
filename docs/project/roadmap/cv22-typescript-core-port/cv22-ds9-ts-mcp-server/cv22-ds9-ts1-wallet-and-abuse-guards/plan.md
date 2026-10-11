# Plan — CV22.DS9.TS1

## Objective

Bound what one agent can spend and extract through the MCP server: a per-tool call-rate
guard on the two embedding-crossing tools, counted from the cross-process `llm_calls`
ledger; argument validation at the boundary with per-tool `limit` caps; and refusals that
are terminal, agent-readable `isError` results rather than protocol failures or invitations
to retry. None of this exists in Python. This is the one DS9 story with **no oracle** — its
correctness is argued and measured, not diffed — so every divergence is named, gated, and
revertible on its own.

---

## Terrain (facts read from code and measured, not from the index)

1. **The guard has something to count, but only for one of the two paid tools.** TS2 made
   `search_memories(query)` write its `llm_calls` row through the sink. `mirror_context
   (query)` embeds through `relevantAttachments` → `generateEmbeddingSafely(provider,
   query)` with **no `onAttempt`** — no ledger row. **Python has the same hole**:
   `attachment.py` calls `generate_embedding(query)` with no `on_llm_call` on both query
   paths (lines 83, 115). So the oracle's own `mirror_context` is unrecorded spend, and a
   guard that reads only the ledger is blind to half the paid surface unless TS1 records it.
2. **Every embedding row in the real ledger is unattributed.** 225 of 225 `role='embedding'`
   rows have `session_id NULL`; `conversation_id` is null for all of them. Nothing in Python
   reads `llm_calls.session_id` except `inspect llm-calls --session <id>`, an equality
   filter. A marker in that column collides with nothing and breaks nothing.
3. **Without attribution, a global embedding count refuses the wrong caller.** Extraction
   embeds every memory it creates; a session close can write dozens of embedding rows in a
   minute. A guard counting *all* embedding rows would then refuse the agent because the
   *user's* session just ended. Attribution is not a nicety; it is what makes the guard
   count the actor it is guarding.
4. **The money is small; the rate is the risk.** Measured on the owner's ledger: an
   embedding costs ~$0.000002; the whole account made 44 embedding calls in 7 days for
   $0.0001, and $0.10 across all roles. One dollar of embedding spend is ~500,000 calls. A
   USD ceiling on embeddings alone is therefore not a control unless set absurdly low. What
   a loop actually does is hit the provider's rate limit (429s that then land on the user's
   *other* work), stall the agent at ~2 s per call, and burn the agent's own context. The
   **call-rate guard is the control**; the USD ceiling is a backstop that only matters
   because `mirror_context.query` fans out to extensions whose own outbound calls are
   neither priced nor recorded here.
5. **The oracle's `limit` quirks are pinned in the golden.** `recall_conversation` with
   `limit=0` returns the whole transcript (`messages[-0:]`), `search_memories` filter with
   `limit=0` returns nothing, negative limits slice oddly, and `"5"` is accepted because
   `int("5")` is. US2 recorded all of it in `mcp-tools.golden.json` — deliberately, so TS1's
   refusal would be a visible divergence from a recorded fact rather than a silent one.
6. **The golden tests call the tool functions directly.** `recallConversationTool(db,
   args)` — not through the registry. So validation placed *inside* the tools would break
   the parity golden; validation placed as a **wrapper at registry construction** leaves the
   tools Python-faithful and lets the two tests sit side by side: the golden records the
   quirk, the guard test records the refusal. The spawned two-engine transcript carries no
   `limit` case at all, so the process-level diff is unaffected either way.
7. **A refusal must be a result, not a protocol error.** `protocol.ts` already turns a
   thrown handler error into `{ content: [{ text: "Error: …" }], isError: true }`. A guard
   that throws lands exactly where US1 designed tool errors to land, and the session
   continues. TS2's session proved a thrown tool error does not take the server down.
8. **Attempts land rows, not just successes.** `ledgerHooks` writes a row even when the
   provider fails ("money may already have been spent, and a vanished row would hide it").
   So a rate guard reading the ledger counts *attempts*, which is what it should count — a
   loop of failing calls still hammers the provider.
9. **The ledger read is cheap today and unindexed on the columns it needs.** `llm_calls`
   has indexes on `conversation_id` and `role`, none on `called_at` or `session_id`. At 552
   rows a window query is sub-millisecond; adding an index is a TS-authored migration with
   the DS6 machinery, which is more than this story should spend on a table this size.
10. **`journey_status` with no slug is 226,573 bytes**, measured on the real database: 21
    journeys × (identity 12.9 KB + journey_path 13.2 KB + 10 memories 6.7 KB + 10
    conversations 4.2 KB). The bulk is two document-sized fields per journey. Its
    description promises "overall status when no slug is given"; the payload delivers every
    journey's full document. That is a *shape* question about what a model should receive,
    not a `limit` to cap — there is no count argument to bound.
11. **`called_at` is microsecond ISO UTC on both engines** (`nowIso` →
    `toMicrosecondIso`), so a window lower bound computed as an ISO string compares
    lexically and correctly.
12. **The gate can be in-process.** Unlike `MIRROR_TS_MCP`, a guard gate is read by the
    server itself, after node has loaded `.env` through the launcher's
    `--env-file-if-exists`. No launcher change; `.env` works for free.

---

## Decisions Taken At Plan Time

**D1 — Both paid tools are recorded, so both can be counted.** `mirror_context(query)`
gains the same ledger sink `search_memories(query)` got in TS2, through `relevantAttachments`
accepting an optional `onAttempt`. This diverges from Python, whose `mirror_context` embeds
without a row — but Python's omission is a defect against its own AI-09 rule ("every
model-in-the-loop call site logs"), not a contract, and DS10 deletes it. Recorded as an
oracle finding; no port obligation. The recording is **not** behind the guard gate: it is
observability, and observability stays on when refusals are turned off.

**D2 — Attribution is `session_id = "mcp"`, one fact in one column.** *Decided
2026-09-18: the Navigator accepted the recommendation — constant marker, one global MCP
rate, deviation from the rider's "per-tool" wording recorded.* The guard must count the actor it guards (terrain 3).
Options: a new column (a schema migration for a marker Python would never write —
rejected); `role` (it is the *kind* of call, and cost-by-role summaries depend on it —
rejected); `conversation_id` (a foreign key — rejected); `session_id`, free text, null on
every embedding row that exists, semantically "the session that made the call" — and an MCP
server process *is* a client's session. The value is the constant `"mcp"`, read by
equality. The first draft encoded the tool too (`"mcp:search_memories"`) to honour the
rider's *per-tool* phrasing; the database-architect lens rejected two facts in one column
for a granularity that, measured, buys nothing — both tools cost one embedding per call, the
fan-out cost is unrecorded either way, and a global cap bounds the harm identically. If
per-tool attribution is ever needed, it is a real column with a real migration, not a
delimiter. The marker is written by the sink `main.ts` builds
(`embeddingLedgerHook(ledgerDb, { sessionId: "mcp" })` — the hook already accepts it), so
the tools never see it. A side effect worth having: MCP spend becomes filterable in
`inspect llm-calls --session mcp`, which is the operator's view of this surface.

**D3 — One global MCP rate, sliding-window, across both paid tools and every MCP
process.** Defaults, sized from terrain 4: **30 embedding calls per 10 minutes** across
`search_memories(query)` and `mirror_context(query)` together. A human-driven session rarely
sustains 3 searches a minute; a loop at the measured ~2 s per search reaches 30 in one
minute. The window is read from `llm_calls WHERE session_id = 'mcp' AND role = 'embedding'
AND called_at >= <now − window>` — the marker is what makes this count the agent rather than
the user's session close. *Deviation from the AI-19 rider recorded:* the rider said
"per-tool"; the guard is per-surface, for the reason in D2.

A refusal is decided **before** the provider is called and writes **no** row (nothing was
attempted). It is logged to stderr as one metadata-only line — `guard refused
tool=<name> reason=rate_limit` — never the query, never an argument value (RS005). Those
lines are also the measurement: after a first refusal, every further line is a retry the
agent made into the wall, which the ledger cannot see because a refusal writes no row.

**D4 — Optional daily USD ceiling, off by default.** `MIRROR_MCP_DAILY_USD_CEILING`,
unset = no ceiling. When set, the guard sums `cost_usd` over MCP rows in the trailing 24 h
and refuses at or above the ceiling; unpriced rows (`cost_usd NULL`, a failed attempt) count
as zero and are reported in the refusal so the number is honest. Off by default because at
measured prices a ceiling that bites would have to be set at cents, and a default that
never bites is a belief the user holds about being protected. The rate guard is the
default protection; the ceiling is for a user who has decided what an MCP surface may
cost them per day.

**D5 — Arguments are validated at the boundary, and `limit` is capped per tool.** A
wrapper at `wiredRegistry` (terrain 6) validates arguments before dispatch from a small
**table of per-tool rules** — not a JSON-Schema validator; seven declarations do not earn
one. `limit` must be an integer-valued number or a numeric string (Python's `int("5")`
tolerance kept — clients do send it), **≥ 1**, and **≤ cap**: `search_memories` 50 (default
5), `list_conversations` 100 (default 20), `recall_conversation` 200 (default 50). Query
text for `search_memories`, `mirror_context`, and `detect_persona` is capped at **4,000
characters** — embedding cost is proportional to tokens, and no legitimate agent query
approaches it. Out of range → refusal naming the bound; the tool is never entered. The
Python golden keeps `limit_zero_returns_all` and `filter_limit_zero` exactly as they are; a
new TS test asserts the refusal for the same arguments through the wired registry. Both
sides visible, as DS9's D4 required.

Two things said plainly, from the security lens. **A cap bounds one call, not total
extraction**: an agent can still page a transcript in five calls of 200, because
`recall_conversation` is a free read and this story rate-limits only paid calls. Bounding
extraction *rate* on free reads would punish legitimate use and is a product decision, not a
guard — recorded, not absorbed. And **a refusal never echoes a text argument**: a numeric
`limit` may be quoted back (`received 0`), a query never is — it is agent-authored text and
the refusal travels back into the model's context and into the client's log.

**D6 — Two refusal intents, two shapes of text.** The prompt-engineer lens split what the
first draft had conflated. A **spend refusal** wants the agent to *stop* — its text is
terminal, leads with the instruction, and names the alternative and the human escalation,
with the instruction last because what comes last is what a model follows in the moment.
An **argument refusal** is an ordinary validation error — the agent *should* retry with a
corrected value, so the text states the valid range and nothing about retrying. The first
draft's "until the window passes" was a deferred invitation dressed as a refusal; a model
that reads it plans to come back. The window belongs in the docs, for the human.

- rate: `Error: search_memories is rate-limited (30 calls in 10 minutes). Use a filter
  instead — journey, layer, or type — or ask the user to raise
  MIRROR_MCP_EMBED_RATE_LIMIT. Do not retry this tool.`
- ceiling: `Error: search_memories is over the MCP spend ceiling the user set for today.
  Ask the user before continuing. Do not retry this tool.`
- argument: `Error: recall_conversation: limit must be an integer from 1 to 200
  (received 0).`

The text is produced by the pure function (D10) so it is under test, and the E2E measures
whether a real model obeys it.

**D7 — One gate reverts every refusal: `MIRROR_TS_MCP_GUARDS=0`.** Read in-process
(terrain 12) through the same `gateWithDefault` parse `routing.ts` exports, so it works
from the environment or from `.env` and reads like every other gate. With the gate off, the
wrapper is not installed and the server behaves exactly as TS2 left it — the recording from
D1 and the marker from D2 stay on, because they are observability, not guards. Tunables:
`MIRROR_MCP_EMBED_RATE_LIMIT` (default 30), `MIRROR_MCP_EMBED_RATE_WINDOW_MINUTES`
(default 10), `MIRROR_MCP_DAILY_USD_CEILING` (unset). A malformed tunable fails loudly at
startup rather than silently reverting to a default — the DS8 rule — which means a typo in
`.env` takes the MCP surface down with a named reason in the client's log rather than
leaving it silently unguarded. `configuration.md` documents the tunables, where to set
them for the plugin (the repository `.env`, which the launcher passes to node), what a
refusal looks like in the MCP log, and how to see MCP spend (`inspect llm-calls` with the
`mcp` session) — the operator's view, so the guard is visible before it bites.

**D8 — The guard reads through the tools' read-only handle.** One `SELECT COUNT(*),
SUM(cost_usd)` per paid call, on a WAL reader that blocks nothing. No index in this story
(terrain 9); revisit trigger recorded.

**D9 — `journey_status` is not capped here; its shape is a CR.** *Decided 2026-09-18:
the Navigator accepted the recommendation — no cap in TS1, the summary-shape question
captured as a Change Request at Debt Review.* Terrain 10: the exposure is context-fill of the agent's own
window, the payload has no count argument to bound, and the honest fix is a summary shape
for the unslugged call — a product decision about what a model should receive from a tool
whose description says "status". A byte cap with a truncation marker would invent a third
shape nobody designed. Recommendation: capture a CR ("`journey_status` without a slug
should return a per-journey summary, not every journey's full document"), keep the
payload as US2's D1 left it, and let the rate of *that* call be bounded by nothing in TS1
— it is a deterministic read and not a paid one.

**D10 — The pure core is a function; the ledger is at the edge.** `decideSpend(state,
policy) → { allow: true } | { allow: false, reason, text }` takes counts and sums already
read; a thin adapter reads them. The decision is unit-tested against synthetic states
without a database; the adapter is tested against a seeded ledger. The refusal *text* is
produced by the pure function so the prompt-engineer's wording is under test, not in a
comment.

---

## Scope

Four plateaus.

**Plateau 1 — Record the other paid tool, with attribution.** `relevantAttachments` and
`loadMirrorContext` accept an optional `embeddingLedger` sink — the same name `ToolRuntime`
uses, so the concept has one name across the three modules; `mirrorContextTool` passes
`runtime.embeddingLedger`; `main.ts` builds one sink writing `session_id = "mcp"`. Tests:
`mirror_context(query)` on a fixture *with* attachments writes exactly one row with the
marker; without attachments writes none (no embedding happens); `search_memories(query)`'s
row now carries the marker. **Two assertions flip deliberately, in the same commit, with
the reason in the message**: TS2's `ledgerRow.test.ts` (`unattributed`) and the real-copy
probe's ledger check (`unattributed=True`) — both were pinning Python's shape, and this
story is the recorded divergence from it.

**Plateau 2 — The pure guard and its adapter.** `ts/src/mcp/guards.ts`: `decideSpend`
(pure), `readSpendState(db, tool, policy)` (adapter), `policyFromEnv(env)` (tunables, loud
on malformed). Tests: decision table over synthetic states — under limit, at limit, over
limit, ceiling unset, ceiling reached with unpriced rows, window boundary; adapter against
a seeded ledger with rows inside and outside the window and with other callers' rows
(extraction, front door) present and **not counted**. Mutation: a guard that counts
unattributed rows must fail; a boundary off by one must fail.

**Plateau 3 — The boundary wrapper.** `ts/src/mcp/boundary.ts`: `guardedRegistry(inner,
{ db, policy })` wraps every handler with argument validation and, for the two paid tools,
the spend decision. `main.ts` installs it unless `MIRROR_TS_MCP_GUARDS=0`. Tests: each
validation rule refuses through the wired registry with the D6 text while the golden's
direct-call cases stay byte-identical; a refused paid call reaches **no provider** (the
replay provider counts calls) and writes **no row**; the 31st call in a window is refused
and the 32nd after the window passes is allowed; stderr carries the metadata line and
never the query; gate off restores every TS2 test.

**Plateau 4 — Cross-process and the agent.** Two server processes spawned on the same
fixture copy, calls alternated, refusal arriving at the *global* count — the ai-engineer's
"second client" case, as behavior. `scripts/mcp_guard_probe.sh` for the Navigator's steps
2–3, taking a fresh copy per step. Then the Navigator route, including the one thing only a
model can prove: whether the refusal text stops a real agent — pre-registered (expected:
reports the refusal and stops or asks; retries counted from stderr refusal lines after the
first), so the n=1 is an observation against a prediction rather than an anecdote.

---

## Non-Goals

- Any change to `src/memory/mcp/`; Python's unrecorded `mirror_context` spend is a CR.
- A new column, index, or migration on `llm_calls`.
- Capping `journey_status` (D9) or changing any tool's payload shape.
- Bounding extension providers' own calls — named by the threat model as the user's
  extension choices; the rate guard bounds how often they are *triggered*.
- A repeatable eval of agent obedience to the refusal text. One real session is n=1 and is
  recorded as such; a probe under `eval` is a candidate for a later story.
- Deleting the launcher or the Python fallback (DS10).

---

## Acceptance Behavior

```text
Given the TS MCP server with guards on (default) and a database copy
When  an agent calls search_memories(query) or mirror_context(query)
Then  each call records one llm_calls row attributed to the MCP surface and tool
And   the 31st call to the same tool within 10 minutes is refused before any
      provider call, as an isError result whose text is terminal, and no row
      is written for the refusal
And   a second server process on the same database sees the same count
And   limit=0, negative, fractional, over-cap, and non-numeric limits are
      refused at the boundary with the bound named, while the Python golden
      still records the oracle's behaviour for the same arguments
And   with MIRROR_TS_MCP_GUARDS=0 the server behaves exactly as TS2 left it,
      recording and marker included
And   tools/list, every payload, and every sibling story are untouched
```

---

## Validation Route

**Automated (CI):** `npm run typecheck && npm run lint && npm test`; all US1/US2/TS2 tests
green with guards on (in-range arguments) — the golden's `limit_zero` cases still pass
because they call the tools directly; determinism gate unchanged; oracle drift green.

**Navigator-visible route** (`test-guide.md` carries it as commands):

1. `scripts/mcp_two_engine_diff.sh --launcher` — still empty on both branches (no
   `limit` case in the transcript; guards do not touch in-range calls).
2. `scripts/mcp_guard_probe.sh <real db>` — on a **fresh copy**: 31 `search_memories
   (query)` calls through the launcher; expect 30 rows added with `session_id='mcp'`, the
   31st an `isError` result with the D6 text, the ledger unchanged by it, and one
   `guard refused` line on stderr. Spends ~$0.00006.
3. Same script, same run: `limit=0` and `limit=999` on `recall_conversation` — expect the
   argument refusal text; then `MIRROR_TS_MCP_GUARDS=0` and `limit=0` again — expect the
   whole transcript, Python's behaviour.
4. **One Claude session, the E2E — on a fresh copy, or after the 10-minute window.** The
   count is global across processes on the same database by design, so a session started
   on the copy step 2 just filled would be refused on its *first* search (the QA lens
   caught this). Ask the agent: "Using the mirror-mind `search_memories` tool with a query,
   one call each, search for these 35 topics: …" and observe the 31st. Pre-registered
   expectation: it reports the refusal and stops or asks. Measured: refusal lines in the
   MCP log after the first = retries. Then `recall_conversation` with `limit: 0` — observe
   the argument refusal surface and the agent correct the value. Written into
   `validation.md` as an n=1 observation against the prediction.

Expected observation: 30 allowed, 1 refused, 0 provider calls for the refusal, 0 retries.
Pass: all four. Fail: a refusal that is a protocol error, a refusal that wrote a row, a
count that includes extraction spend, a second process that does not see the first's
calls, gate-off behaviour that differs from TS2, or an agent that retries into the wall.

**E2E decision: required — step 4 is it.** The refusal text is a hypothesis about model
behaviour until a model reads it.

---

## Implementation Contract

- Files: `ts/src/mcp/guards.ts`, `ts/src/mcp/boundary.ts`, `ts/src/mcp/main.ts`,
  `ts/src/mcp/tools/providerCrossing.ts`, `ts/src/mirror/context.ts`, `ts/test/mcp/`
  (including the two deliberate assertion flips), `scripts/mcp_real_copy_probe.sh` (its
  `unattributed` check), `scripts/mcp_guard_probe.sh`, `docs/reference/configuration.md`,
  `docs/project/decisions.md`, US1's threat model (item 3 moves from "owner: TS1" to
  "implemented"; items 1–2 gain the per-call-not-total note), this package.
  `ledgerHooks.ts` needs no change — it already accepts `sessionId`.
- TDD; one commit per plateau; mutation-tested; `uv run` for Python, Node 24 for TS.
- No `git add .`; descriptive English commit messages explaining why.
- Real database copies never committed; probes print counts and hashes, never queries.

---

## Stop Conditions

- D2/D3's attribution shape or D9 unanswered.
- The ledger read turns out not to be visible across processes within one call's latency
  (WAL visibility is per-statement, so this would be a driver surprise, not a design one).
- Any pull toward changing a payload shape, adding a column, or touching Python.
- plan_rule_conflict, failing_required_check_without_clear_fix, navigator_decision_needed.

---

## Debt / CRs To Capture At Debt Review (candidates)

- `journey_status` without a slug should return a summary shape (D9) — RS007 or product.
- Python's `mirror_context` embeds without a ledger row (terrain 1) — RS010, no port
  obligation, deleted by DS10.
- No index on `llm_calls(session_id, called_at)`; revisit if the table passes ~100k rows
  or the window read measures above 5 ms.
- Agent obedience to refusal text is n=1; an `eval` probe would make it a property.

---

## Persona Review (plan stage)

Run 2026-09-18 on the first draft — the collaboration strategy's baseline five plus
ai-engineer and prompt-engineer, because this story's control *is* text a model reads.
All seven dissented; each changed the plan above before it was presented.

- **database-architect** — `session_id = "mcp:<tool>"` is two facts in one column, and
  the granularity it buys is imaginary: both tools cost one embedding per call, the fan-out
  cost is unrecorded either way, and a global cap bounds the harm identically. One fact, one
  constant, equality filter; if per-tool ever matters it is a column with a migration, not a
  delimiter. That collapsed D2 and D3 into a per-surface guard and recorded the deviation
  from the rider's wording.
- **prompt-engineer** — the draft conflated two intents. A spend refusal wants the agent
  to *stop*; an argument refusal wants it to *fix the value and try again*. Making all three
  "terminal" was wrong for the third and, worse, "until the window passes" in the first was
  a deferred invitation a model would plan around. Instruction last, alternative and
  escalation named, window kept for the human in the docs.
- **quality-assurance** — the route contaminated itself: the count is global across
  processes on one database, so a Claude session opened on the copy the probe just filled
  is refused on its first search and "fails" for the wrong reason. Fresh copy per step.
  Second: two existing assertions pin `unattributed=True` (TS2's test and the real-copy
  probe) and will flip — flip them deliberately, not as collateral. Third: name the exact
  tool in the agent prompt, or the agent may choose `mirror_context`.
- **security-engineer** — say what the caps do and do not do: they bound one call's output,
  not total extraction, because free reads are not rate-limited and five calls of 200 page a
  transcript; that is a product decision to record, not a gap to paper over. And a refusal
  must never echo a text argument — a number is safe, a query is agent-authored text that
  would travel back into context and into the client's log.
- **ai-engineer** — the refusal text is a hypothesis; one session is n=1 either way, but
  an *unstructured* n=1 is an anecdote. Pre-register the expected behaviour and measure
  retries from the stderr refusal lines, since a refused retry writes no ledger row and the
  ledger cannot see it. Accepted the global-rate simplification on the condition that the
  ceiling is global too.
- **devops-engineer** — a guard nobody can see until it bites is a surprise, not a
  control. Document the operator's view: where the tunables live for the plugin (the repo
  `.env`), what a refusal looks like in the MCP log, and that the `mcp` marker makes MCP
  spend filterable in `inspect llm-calls`. Accepted fail-loud on a malformed tunable as the
  DS8 rule, with the consequence named.
- **engineer** — do not build a JSON-Schema validator for seven declarations; a table of
  per-tool rules is the whole requirement. Reuse `gateWithDefault` rather than a third
  gate parser. `ledgerHooks.ts` already takes `sessionId` — drop it from the file list.
  And one name for the sink across `ToolRuntime`, `loadMirrorContext`, and
  `relevantAttachments`: `embeddingLedger`.

---

## Approval Gate

- active checkpoint: `after_plan`
- **approved 2026-09-18**, with D2 = constant `mcp` marker and one global rate, and
  D9 = no cap, shape captured as a CR.
- Implementation proceeds under this contract; Navigator Validation remains the next
  hard stop.
