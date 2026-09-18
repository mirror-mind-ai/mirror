[< CV22 TypeScript Core Port](../index.md)

# CV22.DS9 — TS MCP Server

**Status:** 🟢 In Progress — pulled and authored 2026-09-17; **US1 and US2 done (2/4)**; TS2 next, then TS1
**Type:** Delivery Story
**Depends on:** CV22.DS7 (command burn-down, done 14/14 — every capability the tools
need is already TS-owned); CV22.DS8 (live-provider cutover, done — the embedding call
behind `search_memories` is now TypeScript's); CV21.E2.S2 (the Python baseline)

---

## Outcome

`python -m memory mcp` is answered by the TypeScript core: the stdio JSON-RPC protocol,
the seven read/context tools, and the plugin manifest entry that launches it. The MCP
surface stops being a reason Python must exist, and DS10 can delete the Python core
without removing a runtime integration that Claude, Codex, Antigravity, and Grok Build all
consume through CV21's canonical plugin.

---

## What This Is (read from code, 2026-09-17)

The MCP server is **363 lines of Python** in `src/memory/mcp/`: `server.py` (128) and
`tools.py` (228). Six facts shape this Delivery Story, and four of them shrink it:

1. **The transport is stdio, not a network listener.** `serve()` reads
   newline-delimited JSON-RPC from stdin and writes to stdout; stderr carries
   diagnostics. There is no socket, no port, no HTTP, no bind address. The process is
   spawned by whichever MCP client launched it.
2. **The dispatch is already a pure function.** `handle_message(message, client)` returns
   a response dict or `None` for notifications, deliberately so it can be tested without
   stdio. That is an unusually clean parity target: a golden of message → response covers
   the protocol without any process orchestration.
3. **All seven tools are read or context-only.** `mirror_context`, `list_journeys`,
   `journey_status`, `search_memories`, `list_conversations`, `recall_conversation`,
   `detect_persona`. `tools.py` states it plainly: *"No writes/mutations live here (a later
   story owns those)."* There is no identity-mutating tool to gate, because there is no
   write tool at all.
4. **The oracle is stable — the opposite of US8's moving Builder tree.** `src/memory/mcp/`
   has **two commits in its entire history**: `625eb3ce` (2026-06-23), whose message reads
   *"Complete CV21.E2.S2 — Mirror MCP server (last Python baseline before TS port)"*, and
   `806e52f0` (2026-07-16), the AI-12 retrieval-reinforcement fix. CV21 authored this
   surface as a deliberate handoff to CV22, not as a moving target.
5. **Every capability the tools need is already TS-owned.** `loadMirrorContext` (US4/TS2),
   journey listing and status (US1), `searchMemories` (DS2/DS5, live since DS8),
   conversation listing and the `find_by_id_prefix` port in `ts/src/conversation/recall.ts`
   (US1), `detectPersona` (DS2). DS9 writes protocol and wiring, not capability.
6. **The launch point is CV21's artifact.** `plugins/mirror-mind/.claude-plugin/plugin.json`
   declares `mcpServers.mirror-mind.command = "python3"` with args `["-m", "memory",
   "mcp"]`. Flipping the server means editing a manifest CV21 owns, and DS10 edits it again
   for npm. That coupling is named in the seam boundaries below.

---

## The Riders, Against What The Code Already Answers

DS9 carries two recorded riders. Read against the implementation, they are narrower and
sharper than their general phrasing suggests, and saying so precisely is the point of
writing them down before planning.

**RS005 — security rider.** The rider asks for "transport and binding (localhost-only by
default), authentication story, per-tool permission scoping (read tools vs write tools vs
identity-mutating tools), and abuse/rate considerations."

- *Binding* is answered by architecture: stdio has no bind address. The plan must record
  that and must not invent a localhost listener to satisfy a checklist.
- *Authentication* is structural in the same way, but the review corrected the first
  draft's conclusion. The **spawner** (the MCP client process) already has filesystem access
  to `memory.db`, so MCP grants the spawner nothing new. The **caller**, however, is not the
  spawner — it is the model, and the model's tool calls are shaped by everything in its
  context: the user's prompt, files it read, web pages, and results from *other* MCP servers.
  So the realistic actor is **anyone who can influence the agent's context**, and that actor
  has no filesystem access at all. Against them, this server is a **read oracle over private
  memory**: one injected instruction in a third-party document can make the agent call
  `recall_conversation` and forward the transcript to a different tool. Authentication cannot
  fix that (the caller is legitimately the model); what can is bounded output, no bulk-dump
  shapes, and naming the oracle honestly in the threat model.
- *Permission scoping* has no write tools to scope today. The plan records the boundary so
  that adding a write tool later is a decision, not a drift.
- *Abuse* concentrates in argument handling and output. Python validates **nothing** against
  `inputSchema` — handlers `.get()` arguments and coerce with `int()`. Measured:
  `recall_conversation` with `limit=0` returns **every** message (`messages[-0:]` is the
  whole list), `limit=-1` returns all but the first, and there is no upper cap on any
  `limit`. `search_memories` with `limit=0` returns nothing and `limit=-1` drops the last
  result. These are the oracle's behaviors, and they are also an exfiltration amplifier and a
  memory/CPU sink — see D4.
- *Fan-out.* `mirror_context.query` does not stop at the core: `load_mirror_context` hands
  the agent-supplied `query` to every installed **extension context provider**
  (`mirror-context-v1`, TS2). Extensions that search external services exist today
  (Google Workspace, Meta Ads). An agent-influenced string therefore drives an extension's
  outbound query, and the extension's answer returns into agent context. The threat model
  names this path; DS9 does not change it.
- *Logging.* The RS005 front-door rule applies unchanged: the server logs tool names,
  call counts, and errors — never arguments (agent-authored queries) and never results
  (identity and transcript content). A sentinel test, as US8 did for `load`.

**AI-19 — denial-of-wallet rider.** Per-tool provider crossings, read from code and to be
**measured** at Plan with a socket tripwire (as US8 graded `load`), not asserted:

| Tool | Provider calls | Path |
|---|---|---|
| `search_memories` with `query` | 1 embedding | `client.search` → `generate_embedding` |
| `mirror_context` with `query` | 1 embedding **+ extension fan-out** | `search_attachments` → `generate_embedding`; then every `mirror-context-v1` provider |
| `search_memories` without `query`, `list_journeys`, `journey_status`, `list_conversations`, `recall_conversation`, `detect_persona` | 0 | deterministic reads |

After DS8 the two paid paths are live from TypeScript. An agent loop stuck on either is a
denial-of-wallet vector against the user's own balance with no human in the loop — and an
agent that receives a retryable-looking error will retry, which is the loop.

The rider's second half — *whether agent-initiated searches reinforce the ranker* — is
**already decided in code, per tool**: `_search_memories` passes `log_access=False` (AI-12,
commit `806e52f0`); `mirror_context` calls `load_mirror_context` with its defaults and is a
genuine context load, so it reinforces exactly as the CLI's does. DS9 pins both, as two
assertions, not one blanket "no reinforcement".

---

**Session handoff:** [handoff.md](handoff.md) — what is true now, why TS2 goes before TS1,
and what travels with this story.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV22.DS9.US1](cv22-ds9-us1-json-rpc-protocol-core/index.md) | JSON-RPC protocol core | User Story | `handle_message` ported to TS with exact parity on a committed golden: `initialize` (including protocol-version echo), `notifications/initialized`, `ping`, `tools/list`, `tools/call` dispatch, notification-vs-request semantics, and the error taxonomy (`-32700`, `-32600`, `-32601`, `-32602`, plus tool errors returned as `isError` results rather than protocol errors). No routing flip; the threat model is this story's Plan input | ✅ **Done — 2026-09-17.** 22 dispatch cases plus a spawned-process framing transcript, byte-identical across engines; the `json.dumps` separator gap fixed in `wire.ts` rather than recorded as a divergence; drain-before-exit mutation-proven; stderr empty under bare `node`. Two Python-side findings deferred to RS007 |
| CV22.DS9.US2 | The seven read/context tools | User Story | Each tool wired to its existing TS capability with byte-exact payload parity (`ensure_ascii=False, indent=2, default=str` JSON), the `log_access=false` invariant pinned, and `tools/list` schemas byte-identical so no client re-negotiates | 🟡 Planned |
| CV22.DS9.TS1 | Wallet and abuse guards | Technical Story | **Blocked on TS2's database-open decision (US2 D12): the server currently opens read-only and records NO `llm_calls` row for an agent search, so there is no spend for this guard to count.** AI-19's per-tool call-rate guard and optional daily USD ceiling on the two embedding-crossing tools, with guard state read from the cross-process `llm_calls` ledger (not process memory — a user runs several MCP clients at once) and cost from the single TS cost authority DS8 ported; refusals are **terminal, agent-readable `isError` results** whose wording is prompt text; plus D4's argument validation and output bounds. **Deliberate divergence from Python** — none of it exists in the oracle — so it is its own story, its own decision, and its own revert | 🟡 Planned |
| CV22.DS9.TS2 | Cutover and plugin manifest flip | Technical Story | **Owns the database-open decision deferred by US2 D12** — read-only (no spend ledger, TS1 blind) versus a backup-gated or ledger-only writable open, measured at 399 ms / 49.3 MB per launch for the backup path. The `mcpServers` entry launches the TS server through D5's revert mechanism; the **scripted** stdio smoke diffs a fixed JSON-RPC transcript against the recorded Python baseline, then one real Claude session; blast radius named (Claude is the only production consumer of the manifest today); no CV21 scope is redefined | 🟡 Planned |

Four stories, sequenced protocol → tools → guards → flip, so that the surface is provably
identical before it is made different, and made different before it is made live.

**Sequence correction (2026-09-17, from US2 D12):** TS1 no longer follows US2 directly.
The server opens read-only and records no `llm_calls` row for an agent search, so there is
no spend for a wallet guard to count. **TS2 must settle how this server opens its database
before TS1 can be planned.** The remaining order is TS2 → TS1.

**Inherited by the remaining three, from US1:** the threat model (in US1's `plan.md`), the
golden and its generator, the oracle-drift coverage of `src/memory/mcp/`, the injectable
`ToolRegistry` seam that lets US2 fill handlers without touching dispatch, and `wire.ts` —
whose Python-separator encoding every later response also travels through.

---

## Decisions This Delivery Story Must Take

**D1 — Do the AI-19 guards ship inside CV22, or does CV22 port at parity and defer them?**
**Decided 2026-09-17: ship them, as TS1** (Navigator accepted the recommendation). The rider says the guards "belong in the plan", the
money is real, and DS10 deletes the Python path that would otherwise remain the unguarded
alternative. But they are new behavior in a migration whose rule is parity, so the
divergence is recorded, not absorbed.

**D2 — Who owns the manifest edit?** The file is CV21's artifact, the flip is CV22's work,
and DS10 rewrites the invocation again for npm. Recommendation: CV22 edits the `command`
and `args` only, records the change in CV21.E2's package as an inbound note, and leaves
plugin structure, versioning, and distribution untouched.

**D3 — Write tools stay out.** Python has none; adding them is product scope for a future
story, not a port. DS9 must not grow a write tool to "complete" the MCP surface.

**D4 — `limit` semantics: port the quirk, or cap it and record the divergence?** Python's
`limit=0` on `recall_conversation` returning the whole transcript is an oracle behavior that
is also an error: no client intends it, and it is the cheapest exfiltration shape the
surface offers. CV22 already has the rule for this case — *a superset is acceptable only
when the oracle's behavior is an error, no caller can depend on it, and the difference is
recorded and asserted* (the `explore` decision). Recommendation: **validate arguments
against `inputSchema` at the boundary, reject non-positive limits, cap `limit` per tool,
and assert the divergence on both sides** — the Python golden records the quirk, the TS
test records the refusal. US2 ports; TS1 caps; the gap between them is visible, not silent.

**D5 — What is the revert for a manifest flip?** Every DS7 family reverted through a
`MIRROR_TS_*=0` variable read by the front door. A manifest points at a *command*, and a
plugin installed into another person's runtime is not re-edited by an environment variable.
Options: (a) the manifest launches a thin TS entry that honors `MIRROR_TS_MCP=0` by
`exec`ing `python3 -m memory mcp` — a launcher-level bridge deleted in DS10; (b) the revert
is a documented manifest edit back to `python3`. Recommendation: **(a)**, because a revert
that requires editing an installed plugin is not a revert the user can perform under
pressure, and (a) is one `spawnSync`, deleted with the file DS10 deletes anyway.
**Decided 2026-09-17: (a)** (Navigator accepted the recommendation). Tested as behavior at
TS2: with the variable set, the Python server answers the smoke transcript.

**Flow unit — `story_by_story`, decided 2026-09-17.** Ariad recommended `delivery_story`;
the Navigator chose per-story validation because TS1 changes behavior rather than porting
it and TS2 is a live cutover into a runtime other clients consume. Each of the four stories
carries its own Plan approval and its own Navigator validation.

---

## Validation Approach

- **Protocol parity by golden.** `handle_message` is pure, so the golden is a committed
  list of request → response pairs generated from the Python oracle, including malformed
  input, unknown methods, unknown tools, and notifications.
- **Payload parity is byte-exact.** The tools return `json.dumps(..., ensure_ascii=False,
  indent=2, default=str)`. Two-space indentation, non-escaped Unicode, and `str` coercion
  of non-serializable values are part of the contract a client already consumes.
- **No live provider call in CI.** `search_memories` and `mirror_context` reach the
  embedding path; they are graded behind the replay transport, exactly as DS7 did.
- **Framing is tested at process level, separately from dispatch.** The `handle_message`
  golden is necessary and not sufficient: `serve()`'s loop owns blank-line skipping, parse
  errors answered with `id: null`, non-object messages as Invalid Request, one JSON object
  per line with a flush per response, stderr kept off the protocol channel, and clean exit 0
  on EOF. A stdio harness spawns the real server and asserts those; the golden cannot.
- **`id` is a value, not a truth test.** Python distinguishes a request from a notification
  by `"id" in message`, so `id: 0`, `id: ""`, and an explicit `id: null` are all requests and
  must echo exactly. A TypeScript port that reaches for `||` breaks two of the three. The
  golden carries all three, plus string ids.
- **Guards are tested as behavior, not as configuration.** A rate-limited tool must return
  a well-formed `isError` result the agent can read — never a protocol-level failure that
  looks like a broken server — and the text must be **terminal**: an agent that reads
  "try again later" retries, and the retry is the loop the guard exists to stop. That
  wording is prompt text and routes to the prompt-engineer lens at TS1's Plan.
- **Provider failure degrades, the server survives.** Timeout, auth, rate-limit, and
  provider errors on the two embedding-crossing tools return an `isError` result carrying
  the DS8 error taxonomy; `search_memories` may fall back to lexical-only exactly as
  `searchMemoriesWithStatus` already does. The process never exits on a tool failure — a
  dead MCP server takes every tool with it, and the client will not restart it mid-session.
- **Nothing dogfoods this surface.** Pi — the daily driver — reaches Mirror through skills
  and the front door, never through MCP. After the flip, the TS server gets **zero organic
  exercise** unless a Claude session is opened on purpose. So the smoke is not a one-off
  session: it is a **script** that spawns the server, sends a fixed JSON-RPC transcript,
  and diffs the responses against the same transcript recorded from the Python server on
  the same database copy. It runs before the flip on both engines, and after the flip on TS.
- **Then one real client, once.** After the scripted diff is clean, one real Claude session
  against a database copy: `tools/list` compared with the Python session's, one call per
  tool, one malformed call, one guarded call. Its observations are written down, because
  the parties to this contract are agents, not humans reading stdout.
- **Blast radius is named.** CV21 has propagated the manifest to Claude only — E4 (Codex),
  E7, E8, E10 (Grok), and E11 are planned, not done. The flip changes what one runtime
  launches. If that changes before TS2, the smoke gains a client.
- **Oracle-drift coverage.** `src/memory/mcp/server.py` and `src/memory/mcp/tools.py` are
  added to `ts/parity/oracle-baseline.json`. Both are low-churn, so the tripwire is cheap
  and meaningful here.

---

## Critical Seam Boundaries

- **DS9 ↔ CV21 (plugin ownership).** CV21 owns the plugin package, its manifest structure,
  its skills and hooks, and its propagation to other runtimes. DS9 changes exactly one
  thing inside it: how the MCP server process is launched. DS9 does not redefine the
  plugin, its versioning, or its distribution — and must not silently become CV21 work.
- **DS9 ↔ DS10 (retirement and npm).** DS9 makes the MCP surface TypeScript-answered. DS10
  deletes `src/memory/mcp/`, rewrites the manifest invocation for the npm-era entry point,
  and owns packaging. DS9 must not hardcode a repository-relative launch path that DS10
  would have to unpick.
- **DS9 ↔ product scope.** Write tools, automatic per-turn injection (E1 found MCP does not
  provide it), and new tool families are out. DS9 ports a surface and guards it; it does not
  expand what an agent can do to a mirror.

---

## Non-Goals

- No write, mutation, or identity-editing tools.
- No new transport: no HTTP, no SSE, no network listener, no remote access.
- No new tools beyond the seven that exist.
- No plugin restructuring, versioning, marketplace, or multi-runtime propagation (CV21).
- No deletion of `src/memory/mcp/`, no npm packaging, no rename (DS10).
- No change to ranker reinforcement semantics: `log_access=false` is preserved, not revisited.

---

## Persona Review (Delivery Story stage)

Run 2026-09-17 on the first authored draft, three lenses at the Navigator's request:
ai-engineer, security-engineer, quality-assurance. All three dissented; each changed the
package above before it was presented.

- **ai-engineer** — the failure layer is *orchestration*, not the model: a per-process rate
  guard is bypassed by the second MCP client the user has open, so guard state must live in
  the cross-process `llm_calls` ledger and cost must come from the one TS cost authority —
  otherwise the ceiling is a belief. The refusal an agent receives is prompt text: "try
  again" *is* the loop. And the provider-crossing inventory is measured with a tripwire, per
  tool, because `mirror_context.query` embeds too and the first draft only half-said so.
  Reinforcement is per tool, not blanket — `mirror_context` is a genuine load and reinforces.
- **security-engineer** — the first draft named the wrong actor. The spawner has the
  filesystem; the *caller* is the model, and the model is driven by anything in its context.
  Against a prompt-injected document this server is a read oracle over private memory, and
  `recall_conversation` with `limit=0` hands over a whole transcript. Authentication cannot
  close that; bounded output and schema validation can, and Python does neither. Name the
  extension fan-out: an agent-supplied `query` drives installed extensions' outbound calls.
  Keep arguments and results out of the log — sentinel test.
- **quality-assurance** — the pure-function golden misses the framing loop, and `id: 0` is
  the kind of edge that ports lose to `||`. More important: this is the first CV22 surface
  the Navigator's daily driver never touches, so the usual "dogfood catches it" does not
  apply — the smoke must be a repeatable scripted diff against a Python baseline, not a
  session someone remembers running. Name the blast radius (Claude only, today) and name a
  revert a user can actually perform on an installed plugin.

## Done Condition

- The TS server answers the full protocol at parity on the committed golden, including
  malformed input and notification semantics.
- All seven tools return byte-identical payloads to the Python oracle for the same
  database state, with `tools/list` schemas unchanged.
- The AI-19 guards are implemented with cross-process state, tested as agent-readable
  terminal refusals, and documented, with their divergence from Python recorded (or D1 is
  answered the other way, in writing).
- D4 is decided and asserted on both sides: the Python golden records the `limit` quirk, the
  TS test records the boundary validation that refuses it.
- The threat model exists as a written artifact in the US1 package — the caller-is-the-model
  trust boundary, the read-oracle framing, argument validation, output bounds, the extension
  fan-out, logging, and the wallet — reviewed by the security-engineer and ai-engineer lenses
  before implementation.
- The plugin manifest launches the TS server through D5's revert mechanism, proven by the
  scripted stdio diff against the Python baseline transcript and one real Claude session,
  with the revert itself exercised.
- `src/memory/mcp/` is registered in the oracle-drift baseline.
- DS10 can delete the Python MCP server without reopening any protocol or tool decision.
