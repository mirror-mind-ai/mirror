[< CV21.DS12 Runtime Re-Baseline](../index.md)

# CV21.DS12.TS2 — Codex re-probe

**Status:** 🟢 In Progress — static probes done, live session pending
**Type:** Technical Story (spike)
**Delivery Story:** CV21.DS12 — Runtime Re-Baseline

---

## Technical Story

In order to decide what DS4 and DS5 build,
as the Driver of CV21,
I want DS3's June mapping re-measured on the installed Codex, starting from what v0.32.1
ships,
so that the Codex work starts from what the binary does today.

## Outcome

Codex's skill discovery, hook surface, and consumption of the Claude-format plugin are
measured on the installed version. The live session settles injection and logging.

## Acceptance Behavior

```text
Given the package v0.32.1 ships, installed in a scratch prefix, and a scratch CODEX_HOME
When the shipped wiring and the plugin are exercised on the installed Codex
Then each finding below names the command, version, binary, and date
And the live session settles what a static probe cannot
```

## Scope

- The two wiring steps v0.32.1 prints, rendered with `codex debug prompt-input` (no model
  call).
- The hook surface the binary declares.
- The Claude-format plugin through a local Codex marketplace.
- One live session (`route.sh live-codex`), at most two turns.

## Out Of Scope

- Replacing the shipped wrapper (`scripts/codex-mirror.sh`). That is DS4.

## Evidence

Codex 0.162.1. The binary is `/opt/homebrew/bin/codex` →
`/opt/homebrew/Caskroom/codex/0.162.1/bin/codex`. Measured 2026-10-13 (10:18 UTC) with
`bash route.sh codex`. Full outputs: `evidence/codex-*` in the route's scratch directory.

## Findings — static

| # | Finding | How it was measured | Result |
|---|---------|---------------------|--------|
| 1 | v0.32.1's two steps still work: all 25 skills and the Operating Instructions reach the rendered prompt | `codex debug prompt-input hello`, scratch `CODEX_HOME` | ✓ as CV22 measured on 0.157.0 |
| 2 | The binary's hook-event table now includes **`SessionEnd`**, plus `PermissionRequest`, `Interrupt`, and `SubagentStart`/`SubagentStop` | strings of the binary | DS3 recorded no `SessionEnd` on 0.139.0. The deferred-extraction caveat may be gone (live) |
| 3 | Handler fields include `async` and `additionalContextLimit`, and the binary carries "this event cannot emit additionalContext" | strings of the binary | Injection is limited by event; which events is live |
| 4 | The binary names `.claude-plugin/plugin.json` beside `.codex-plugin/plugin.json` and `.cursor-plugin/plugin.json`, and sets `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` | strings of the binary | Codex reads Claude-format plugins |
| 5 | **Codex installs the shipped Claude-format plugin** from a local marketplace (`.agents/plugins/marketplace.json`) | `codex plugin marketplace add`, then `codex plugin add mirror-mind@ds12-local` | ✓ into `plugins/cache/ds12-local/mirror-mind/0.32.1`. `config.toml` gains `[plugins."mirror-mind@ds12-local"] enabled = true` |
| 6 | With the skills link removed, the plugin alone exposes all 25 `mm-*` skills | `codex debug prompt-input` after the install | ✓ 25 |
| 7 | The plugin's MCP server is registered | `codex mcp list` | ✓ `mirror-mind ${CLAUDE_PLUGIN_ROOT}/mcp/launch.sh enabled`. Placeholder resolution is live |
| 8 | Canary hooks in `CODEX_HOME/hooks.json` do not reach the rendered prompt | `codex debug prompt-input` with SessionStart and UserPromptSubmit canaries | Inconclusive: `prompt-input` may not run hooks, or untrusted hooks may be skipped |
| 9 | The shipped wrapper's header still says "Codex has no hook system" | `scripts/codex-mirror.sh` | Stale since DS3; a DS4 or DS11 item |

## Open For The Live Session

- Do the plugin's hooks run (and with what trust prompt), with `${CLAUDE_PLUGIN_ROOT}`
  resolved?
- Does SessionStart's `additionalContext` deliver the Operating Instructions without the
  `AGENTS.md` link? Does `UserPromptSubmit` inject on every turn?
- Does `SessionEnd` fire?
- Which `interface` label do logged turns carry? The plugin's hooks are Mirror's
  `claude:*` family.
- Does the MCP server start from the plugin cache?

## Validation

`bash route.sh codex` re-runs the static probes. `bash route.sh verify` compares the
installed version with this one.
