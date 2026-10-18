[< CV21](../index.md)

# CV21.DS7 — Antigravity Through Skills And A Native Layer

**Status:** 🟢 In Progress
**Type:** Delivery Story
**User-visible outcome:** An Antigravity user installs Mirror with `agy plugin
install` and has what a Gemini CLI user has today: the skills, the Operating
Instructions at session start, Mirror Mode context once per user turn, and a
session logged as `antigravity` with its replies — in no more documented steps
than Gemini CLI's two.

---

## Outcome

Antigravity takes the Claude plugin's skills as-is (`agy plugin install`,
DS12.TS3 static 3) but cannot run Claude's hooks: different schema, different
events, different output shape (static 4). Every mechanism L4 needs exists and
was measured live on agy 1.3.4 (DS12.TS3): `SessionStart` `injectSteps` →
`systemMessage` reaches the model (L1); `PreInvocation` fires before every
model call with `invocationNum` resetting to 0 at each user turn, so an
adapter injects once per turn (L2); hook payloads carry no text, so logging
reads the readable JSONL transcript (L7). DS7 builds the thin agy-native
layer — hooks in agy's schema, `mcp_config.json`, `rules/AGENTS.md` — and
measures the result live against the bar DS12.TS3 set. Meeting that bar is
what gates DS8's Gemini CLI sunset.

## The Bar (from DS12.TS3, Navigator 2026-10-13)

Measured on the installed `agy`: (1) all of Mirror's skills; (2) the Operating
Instructions at session start; (3) Mirror Mode context injected once per user
turn while Mirror Mode is active; (4) user and assistant messages logged,
labelled `antigravity`, the conversation closed at the end; (5) setup in no
more documented steps than Gemini CLI's two. MCP is not part of the bar
(v0.32.1's Gemini wiring carries none), but the layer ships `mcp_config.json`
because the mechanism is there.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV21.DS7.US1](cv21-ds7-us1-antigravity-installs-the-plugin-with-its-native-layer/index.md) | Antigravity installs the plugin with its native layer | User Story | The package carries the agy-native layer beside the Claude surfaces: hooks in agy's schema, `mcp_config.json`, and `rules/AGENTS.md`. In a scratch `HOME`, `agy plugin install` stages the skills and the layer; `mirror init` prints the Antigravity steps when it finds `agy` on the PATH, in no more steps than Gemini CLI's two (bar 1, 5). Done 2026-10-17 on agy 1.4.2: one install step; a root `plugin.json` marker makes agy stage the layer unconverted (without it, install overwrites the hooks file with Claude's — probe evidence in the story package); the Claude/Codex surfaces byte-identical | ✅ Done |
| [CV21.DS7.TS2](cv21-ds7-ts2-session-start-and-per-turn-injection-through-agy-s-hooks/index.md) | Session start and per-turn injection through agy's hooks | Technical Story | A `PreInvocation` adapter injects Mirror Mode context once per user turn, on `invocationNum == 0`, gated in the wrapper before Node spawns (bar 3); `SessionStart` turns logging on. Done 2026-10-18 on agy 1.4.2: injection recorded by agy as an `EPHEMERAL_MESSAGE`/`SYSTEM_SDK` step (the data-minimizing choice); bar 2's instructions reach the model through `rules/AGENTS.md`, so the SessionStart `systemMessage` fallback is not needed — both decisions resolved by live measurement | ✅ Done |
| [CV21.DS7.TS3](cv21-ds7-ts3-the-session-logs-as-antigravity-from-the-transcript/index.md) | The session logs as `antigravity` from the transcript | Technical Story | Hook payloads carry no prompt or reply text (L7), so the Stop handler reads the transcript JSONL and logs each turn as `antigravity`, replies beside their prompts (bar 4). Done 2026-10-18 on agy 1.4.2: the probe corrected the shape (answers are `PLANNER_RESPONSE`, mostly empty); Shape A append-per-turn keyed on the `step_index` high-water mark, idempotent; agy has no SessionEnd, so `antigravity` joins Codex in `sessionOutlivesTui` and the stale-orphan close ends the conversation on the next session start — measured live, two turns logged and closed | ✅ Done |
| CV21.DS7.US4 | Antigravity at the bar, measured live | User Story | One isolated live session on the installed `agy`, Mirror installed through the shipped package only: the five bar items measured with version, binary, and date; the parity row moves to the level the evidence supports; the result is the gate DS8 reads | 🟡 Planned |

## Non-Goals

- Removing Gemini CLI: that is DS8, gated on US4's measurement.
- MCP in the bar: `mcp_config.json` ships with the layer (US1), but MCP
  reachability is recorded, not gated — v0.32.1's Gemini wiring carries none.
- Grok (DS10) and the cross-session write defect DS12.TS2 L9 found (routed by
  DS2's Debt Review as a core defect outside CV21).
- agy's own slowness exploring before a skill answers (DS12.TS3 L4): the
  agent's behavior, not Mirror's surface.

## Done Condition

Antigravity meets the bar on the installed `agy`, measured in US4 with
version, binary, and date; the plugin installs with its native layer in the
steps `mirror init` prints; and DS8 can read the measurement as its gate.
