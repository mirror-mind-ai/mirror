[< CV21.DS12 Runtime Re-Baseline](../index.md)

# CV21.DS12.TS6 — Re-baseline decision and roadmap reshape

**Status:** 🟢 In Progress — decision and reshape written, awaiting Validation
**Type:** Technical Story (decision)
**Delivery Story:** CV21.DS12 — Runtime Re-Baseline

---

## Technical Story

In order to build CV21's remaining work on what the runtimes do today,
as the Driver of CV21,
I want the re-baseline's findings turned into one decision and a reshaped roadmap,
so that every remaining Delivery Story can name the finding it stands on.

## Outcome

One decision confirms or revises DS1's convergence. It states the parity of each runtime
with its version, and the bar for removing Gemini CLI. DS2's remainder and DS4–DS11 read
confirmed, reshaped, merged, or dropped in the CV21 index, each with its reason.

## Acceptance Behavior

```text
Given TS1–TS5's findings, each with its command, version, binary, and date
When the Navigator reads the decision and the CV21 index
Then every parity level and every reshaped row traces to a finding
And nothing in the reshape rests on June's evidence alone
```

## The Decision

[CV21 converges on the canonical plugin, with a native layer for Antigravity and shared hooks that know their runtime](../../../../decisions.md#cv21-converges-on-the-canonical-plugin-with-a-native-layer-for-antigravity-and-shared-hooks-that-know-their-runtime)
(2026-10-13). It revises the
[2026-06-14 convergence decision](../../../../decisions.md#cv21-converges-on-a-canonical-plugin-plus-mcp-server-bridged-by-import),
which now carries a pointer to it.

## The Reshape

| Delivery Story | Verdict | Why (finding) |
|----------------|---------|---------------|
| DS2 — Mirror Plugin & MCP Foundation | **Reshaped**: the canonical plugin made ready for Claude Code, Codex, and Grok. TS4 can close on TS1's live session. New TS5, US6, US7, US8. **US3 dropped** | TS1: validator warnings (static 1); no status line from a plugin (static 3, L7); dead inject path (L4). TS2: MCP placeholder (L6), mislabel (L7), replies (L8, L11). TS4: MCP not attached (L6), mislabel (L7, L8) |
| DS4 — Codex | **Reshaped**: Codex through the canonical plugin. Distribution, one-time hook trust, parity proof, then the v0.32.1 steps and wrapper retire | TS2: plugin install (static 5–7); injection and instructions (L3, L4); Mirror Mode (L5) |
| DS5 — Codex skills and extensions | **Reshaped** into user extensions on every runtime. Codex's skill half is absorbed by the plugin | TS2 static 6; TS5 findings 1–6 |
| DS7 — Antigravity | **Reshaped**: skills through `agy plugin install` and a thin native layer. Target L4 (was L3), and the Gemini bar | TS3: import fails (static 2); install takes the skills (static 3); hooks verbatim cannot run (static 4, L5); SessionStart and `PreInvocation` inject (L1, L2) |
| DS8 — Gemini CLI removal | **Confirmed, gated** on DS7 meeting the bar | TS3, the bar; the Gemini decision of 2026-10-13 |
| DS10 — Grok Build | **Reshaped**: Grok through the canonical plugin. Logging comes via DS2.US8, the MCP attachment is investigated, and the honest L3 is documented | TS4: validate and install (static 1, 3); Claude wiring gives the skills (static 2); no injection (L2, L3) |
| DS11 — Contract and docs | **Confirmed**, with the measured matrix, the status line as a user step, and Claude Code's native `AGENTS.md` | TS1 L7, L8; the evidence rule |

## For Debt Review, Not The Reshape

- **`mirror mirror log` without a bound session appends to another session's open
  conversation.** An agent with no hooks logged into the Codex session's conversation
  (TS2 L9, TS3 L8). This is core Mirror behavior, outside CV21's runtime scope.
- **Shell quoting in agent-composed `mirror` calls.** zsh expanded `$297` inside double
  quotes to nothing (TS2 L9). This is skill guidance for passing text safely.

## Validation

The Navigator reads the decision and the CV21 index against TS1–TS5. `bash route.sh
verify` shows whether the versions behind them still hold.
