[< CV21](../index.md)

# CV21.DS10 — Grok Build Through The Canonical Plugin

**Status:** 🟢 In Progress
**Type:** Delivery Story
**Renamed from:** CV21.E10, in the CV21 Ariad taxonomy migration (2026-10-13). The
[code map](../index.md#code-map) resolves the old code.
**User-visible outcome:** A Grok Build user installs Mirror Mind in the steps
`mirror init` prints and has what the plugin gives Grok honestly: the 25 skills,
the Operating Instructions through `AGENTS.md`, Mirror Mode on request, the MCP
server if Grok attaches it, and a session logged as `grok_build` with its replies,
closed cleanly at exit. What Grok does not give — context at session start or on
every turn — is written where the user reads it, as an **L3** ceiling with version,
binary, and date.

---

## What This Is

[DS9](../cv21-ds9-grok-build-runtime-spike/index.md) found in June that Grok is the
most Claude-compatible of the new runtimes: a full Claude-style hook lifecycle, skills
from `.agents/skills/` and `~/.claude/skills/`, Claude-shaped plugins, and `AGENTS.md`
read natively — but `UserPromptSubmit` is passive, so there is no per-turn injection.
[DS12.TS4](../cv21-ds12-runtime-re-baseline/cv21-ds12-ts4-grok-build-re-probe/index.md)
re-measured it on Grok 1.0.52 (2026-10-13): Grok validates the shipped plugin as it is
(static 1), v0.32.1's Claude wiring alone (`~/.claude/skills/mirror-mind`) gives Grok
all 25 skills (static 2), `grok plugin install --trust` installs the plugin with its
skills, hooks, and MCP server (static 3), the hooks fire (L1), the project `AGENTS.md`
reaches the model (L4), and Mirror Mode answers on `/mm-mirror` (L5, slow). A
SessionStart `systemMessage` is shown on screen only (L2) and `UserPromptSubmit`
`additionalContext` is ignored (L3): **L3 confirmed**, as in June. The
[decision](../../../decisions.md#cv21-converges-on-the-canonical-plugin-with-a-native-layer-for-antigravity-and-shared-hooks-that-know-their-runtime)
that followed made Grok one of the three runtimes that take the plugin as it is.

[DS2](../cv21-ds2-mirror-plugin-mcp-foundation/index.md) then fixed what TS4 found
broken and validated it live on the same Grok: the session is labelled `grok_build`
and every reply is logged from Stop beside its prompt (US8, L7/L8), the MCP entry
starts without `${CLAUDE_PLUGIN_ROOT}` (US6), and the explicit form `/mm-mirror`
returns context (US7). [DS4.TS2](../cv21-ds4-codex-through-the-canonical-plugin/cv21-ds4-ts2-sessionend-s-close-tail-survives-codex-s-1-s-bound/index.md)
made the shared SessionEnd hook close without its LLM tail on a runtime that bounds
it, Grok's 1.5 s included, and deferred the tail to the next session start — written
for Grok, measured on Codex only.

What DS10 owns is the distance between that evidence and a shipped product:

- **`mirror init` does not know Grok.** It prints steps for Pi, Claude Code, Codex,
  and Antigravity; Grok is absent from the wiring, `runtime diagnose`, `runtime
  update`, README, Getting Started, and REFERENCE. DS12 and DS2 installed the plugin
  from a route into a scratch `HOME`. Which steps a user should be handed is
  unmeasured: whether the Claude link alone brings Grok the hooks and the MCP server
  as well as the skills (static 2 measured skills only), or whether `grok plugin
  install` is the one step — and whether that install copies the plugin, as Codex
  does, or reads it in place, as Claude Code does, which decides what `runtime
  diagnose` must know.
- **The MCP server starts but never attaches (L6).** DS2 sharpened it: Grok's MCP
  Servers view shows `Plugin: mirror-mind → mirror-mind [ready] · 7 tools`, the server's
  stderr log appears empty at session start, and still every `session.create` reports
  `mcp_server_count: 0`; the model is offered Grok's 27 built-in tools and none of
  Mirror's. Cause unknown. Routed here by DS2's Debt Review.
- **The 1.5 s SessionEnd bound is handled, not measured.** DS4.TS2 keys the deferred
  close tail on the `grok_build` label. DS2's live Grok session closed inside the bound
  with no provider key set, so the extraction it would cut never ran. Carried from
  DS2's Debt Review.
- **No L3 claim in the product.** The parity row for Grok reads L3 in DS12's record
  and the runtime interface contract has no Grok reference implementation; a user
  cannot read what Grok gives and what it does not. The claim needs a live session
  through the shipped install path, with version, binary, and date
  ([evidence rule](../cv21-ds12-runtime-re-baseline/index.md#evidence-rule)).

## Outcome

Grok Build is at its honest **L3** on the installed version, through the canonical
plugin alone, in steps `mirror init` prints and `runtime diagnose` understands. The
MCP attachment is either working or explained, with a decision recorded. The deferred
close tail is measured on Grok's own bound. The runtime interface contract, README,
Getting Started, and REFERENCE say what a Grok user gets, what they do not, and why.

## Candidate Stories

Ordered so the install path (US1) and the MCP finding (TS2) are settled before the
one live session the Navigator runs (US3), which then gives the docs (TS4) their
version, binary, and date.

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV21.DS10.US1](cv21-ds10-us1-grok-installs-mirror-in-the-steps-mirror-init-prints/index.md) | Grok installs Mirror in the steps `mirror init` prints | User Story | Measured on the installed Grok in a scratch `HOME`: what the Claude link alone brings Grok (skills, hooks, MCP entry — DS12.TS4 static 2 measured skills only) against `grok plugin install "<pkg>/plugins/mirror-mind" --trust`, and whether the install copies the plugin or reads it in place. The decision is recorded. `mirror init` prints Grok's steps when it finds `grok` on the `PATH`, in no more steps than Codex's two; `runtime diagnose` and `runtime update` know Grok's wiring the way DS4.TS6 taught them Codex's (a copy behind the installed version names the command that brings it level; a link is reported dangling; absence is not drift); `grok plugin validate` joins the plugin guards where the binary is present Done 2026-10-18 on grok 1.0.62: a probe of five shapes chose the trusted install (`grok plugin install … --trust`, a copy under `~/.grok/installed-plugins/`) and a home rule link for the Operating Instructions (`~/.grok/rules/mirror-mind.md`, ~2.2k tokens, every project); it also found the root `plugin.json` marker DS7.US1 added shadowing the Claude manifest on Grok, so the marker now carries `version` and `mcpServers` (one MCP server on all four runtimes). `diagnose` names a copy behind, a duplicated copy, and a dangling rule with the uninstall-then-install line (`grok plugin update` is a no-op for a local copy); `grok plugin validate` joins the plugin smoke | ✅ Done |
| CV21.DS10.TS2 | The MCP server attaches on Grok, or the reason is recorded | Technical Story | Carried from DS2's Debt Review (DS12.TS4 L6). The plugin's MCP entry as Grok renders it (`grok plugin details`, `inspect --json`, `grok mcp doctor`) is compared against a `[mcp_servers.mirror-mind]` entry in `~/.grok/config.toml` and against another plugin's MCP server, to find whether plugin-carried servers attach at all on the installed Grok or whether Mirror's inline locator fails under it. Either the 7 tools are offered to the model in a Grok session, or the cause is named with evidence and the fallback decided: a `config.toml` entry `mirror init` prints, or a documented gap. decisions.md says which and why | 🟡 Planned |
| CV21.DS10.US3 | Grok at honest L3 through the shipped plugin, measured live | User Story | One isolated live session on the installed Grok, Mirror installed from the shipped package in US1's steps only, with a provider key set: all 25 skills, the Operating Instructions reaching the model through `AGENTS.md`, Mirror Mode on `/mm-mirror`, the MCP tools per TS2's result, every prompt and reply logged as `grok_build` with the session-end Stop silent, the conversation closed at exit inside the 1.5 s bound with `close_tail_pending` set and the tail finished at the next session start (DS4.TS2 on Grok, for the first time), and both negatives re-confirmed: no `systemMessage` injection at session start, no `additionalContext` per turn. The parity row moves to **L3** with version, binary, and date, and the route is the isolated Grok smoke test CV21's Done condition asks for | 🟡 Planned |
| CV21.DS10.TS4 | Grok's honest L3 is written where a user reads it | Technical Story | Gated on US3. The runtime interface contract gains a Grok Build reference implementation beside Claude Code, Pi, Antigravity, and Codex: the hooks it runs and from where, the labels and turn ids it carries, the Stop it fires at session end, the 1.5 s bound and the deferred tail, the MCP result, and the injection it lacks; the installed-package wiring table gains Grok's row. README, Getting Started, and REFERENCE name Grok Build as the fifth runtime with US1's steps and one honest line: Mirror Mode on request, no automatic context per turn. DS11 folds the parity matrix; TS4 writes only what DS10 measured | 🟡 Planned |

## Non-Goals

- `review-copy` and user extensions on Grok: DS5, which starts once every runtime's
  wiring is settled.
- The parity matrix across every doc, with every runtime's version, binary, and date
  side by side: DS11 folds DS10's L3 row in with the others.
- Raising Grok above L3. `UserPromptSubmit` discards context and `SessionStart` shows
  it on screen only (DS9, DS12.TS4 L2/L3); the ceiling is Grok's, and DS10 records
  it rather than working around it through `PreToolUse` or any other hook that fires
  only sometimes.
- Grok's own slowness before a skill answers (DS12.TS4 L5, 5 m 30 s) and its usage
  limits (DS2's first live attempt): the agent's behavior, not Mirror's surface.
- The cross-session write DS12.TS2 L9 measured: a core defect outside CV21, routed by
  DS2's Debt Review.

## Done Condition

Grok is at honest L3 on the installed version, measured in US3 with version, binary,
and date, through steps `mirror init` prints and `runtime diagnose` understands; the
MCP attachment either works in that session or its cause and fallback are recorded in
decisions.md; the deferred close tail is measured on Grok's 1.5 s bound; and the
runtime interface contract, README, Getting Started, and REFERENCE name Grok Build
with its steps and its ceiling.
