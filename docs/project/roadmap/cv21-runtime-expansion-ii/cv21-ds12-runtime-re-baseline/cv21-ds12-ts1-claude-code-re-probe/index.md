[< CV21.DS12 Runtime Re-Baseline](../index.md)

# CV21.DS12.TS1 — Claude Code re-probe

**Status:** 🟢 In Progress — static probes done, live session pending
**Type:** Technical Story (spike)
**Delivery Story:** CV21.DS12 — Runtime Re-Baseline

---

## Technical Story

In order to build DS2's remainder and the other runtimes on what Claude Code does today,
as the Driver of CV21,
I want the npm-era plugin measured on the installed Claude Code,
so that the reference runtime's facts carry a version, a binary, and a date.

## Outcome

Claude Code's handling of `plugins/mirror-mind` (validation, loading, hooks, MCP, status
line) is measured on the installed version. The findings say whether DS2.TS4 can close
on them.

## Acceptance Behavior

```text
Given the package v0.32.1 ships, installed in a scratch prefix
When its plugin is validated, loaded, and exercised on the installed Claude Code
Then each finding below names the command, version, binary, and date
And the live session settles what a static probe cannot
```

## Scope

- `claude plugin validate`, `list`, and `details` in a scratch config.
- The status line as a manifest key, and as a plugin-root `settings.json`.
- The plugin's hooks and MCP server from a copy outside any tree, against a scratch Mirror
  home.
- One live session (`route.sh live-claude`), at most two turns.

## Out Of Scope

- Changing the plugin. Fixes are DS2's.

## Evidence

Claude Code 2.1.296. The binary is `~/.local/bin/claude` →
`~/.local/share/claude/versions/2.1.296`. Measured 2026-10-13 (10:17–10:18 UTC) with
`bash route.sh claude`. Full outputs: `evidence/claude-*.out` in the route's scratch
directory.

## Findings — static

| # | Finding | How it was measured | Result |
|---|---------|---------------------|--------|
| 1 | The shipped plugin validates, but this version warns on all four hook commands: `${CLAUDE_PLUGIN_ROOT}` is unquoted, "if the expanded path contains a space the command can split into several words and fail" | `claude plugin validate plugins/mirror-mind` | ✓ passed with 4 warnings. The warnings are new since 2.1.114, and they are a DS2 fix |
| 2 | The one-step wiring loads as `mirror-mind@skills-dir`: 25 skills, 3 hooks, 1 MCP server | `claude plugin list` and `details`, scratch `CLAUDE_CONFIG_DIR` | ✓ as CV22 measured on 2.1.283 |
| 3 | A plugin manifest cannot carry a status line: "Unknown field 'statusLine'. Claude Code ignores it at load time." | validate on a scratch copy with the key added | ✗ for the manifest route. A plugin-root `settings.json` drew no comment from the validator or the inventory, so the live session checks it |
| 4 | SessionStart hands `AGENTS.md` to the session, byte-identical (D13) | the copied plugin's `session-start.sh` | ✓ |
| 5 | UserPromptSubmit logs the prompt, labelled `claude_code` | the copied plugin's `log-user-prompt.sh`, then the scratch database | ✓ |
| 6 | The inject hook's explicit path fires only for `/mm:mirror …`. In a fresh session, `/mirror-mind:mm:mirror …`, the form CV22 saw a plugin install use, injects nothing | `mirror-inject.sh` with each prompt, one fresh session each | `/mm:mirror`: 7,067 bytes. `/mirror-mind:mm:mirror`: 0 bytes. Which form Claude Code sends is the live question |
| 7 | The MCP server starts through the plugin's launcher and lists 7 tools | `initialize` and `tools/list` through `mcp/launch.sh` | ✓ `mirror-mind 0.32.1 · 7 tools` |

## Open For The Live Session

- Do the three hooks fire in a real 2.1.296 session, and does Mirror Mode answer through
  the plugin? This is DS2.TS4's evidence.
- What prompt text does UserPromptSubmit receive when a plugin skill is invoked? That
  decides whether finding 6 is a defect.
- Does a plugin-root `settings.json` status line show?
- Is the MCP server reachable from the session?

## Validation

`bash route.sh claude` re-runs the static probes. `bash route.sh verify` compares the
installed version with this one.
