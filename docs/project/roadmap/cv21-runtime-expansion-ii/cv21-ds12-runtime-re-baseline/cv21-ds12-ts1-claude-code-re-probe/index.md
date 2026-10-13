[< CV21.DS12 Runtime Re-Baseline](../index.md)

# CV21.DS12.TS1 — Claude Code re-probe

**Status:** ✅ Done
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

## Findings — live

One session on 2026-10-13, 14:18–14:25 UTC, Claude Code 2.1.296 (same binary as above),
run by the Navigator. It used a scratch `CLAUDE_CONFIG_DIR`, the plugin copy through
`--plugin-dir`, and probe hooks through `--settings`, against the scratch Mirror home.
There were two turns.

| # | Finding | Evidence | Result |
|---|---------|----------|--------|
| L1 | All three plugin hooks fire, and SessionStart hands over the Operating Instructions | probe capture: SessionStart ×1, UserPromptSubmit ×2, Stop ×2, SessionEnd ×1; the transcript carries the hook's context twice | ✓ |
| L2 | Context injected at session start and on every turn reaches the model | the model quoted `…-start`, `…-turn-1`, and `…-turn-2`, and the transcript holds all three | ✓ the L4 mechanism holds on 2.1.296 |
| L3 | **Mirror Mode answers through the plugin.** `/mirror-mind:mm-mirror …` ran `mirror mirror load` ("MIRROR MODE ACTIVE"), and the answer came in first person under `◇ financial` | screenshots; front-door log, 14:21:57 | ✓ DS2.TS4's reference turn |
| L4 | A plugin skill reaches UserPromptSubmit as **`/mirror-mind:mm-mirror …`**. The inject hook's `/^\/mm:mirror/` never matches it, so on a plugin install the explicit inject path is dead. Mirror Mode came from the skill itself | probe capture of the prompt; static finding 6 | ✗ a DS2 defect |
| L5 | Slash-invoked turns are not logged, by design: `logger.ts` skips prompts that start with `/`. The probe turn was logged (user and assistant, `claude_code`) and closed at SessionEnd | scratch database, conversation `8b04ddde`; front-door log | ✓ by design |
| L6 | The MCP server's 7 tools are available, deferred, as `mcp__plugin_mirror-mind_mirror-mind__*` | the model's answer | ✓ |
| L7 | A plugin-root `settings.json` status line did not appear | screenshots: no `DS12-STATUSLINE-PROBE` | ✗ Together with static finding 3, a plugin cannot carry Mirror's status line |
| L8 | Claude Code 2.1.296 loads a project's `AGENTS.md` natively ("Contents of …/AGENTS.md (project instructions…)") | transcript | New. The project folder held Mirror's `AGENTS.md`, left by the Driver's dry run of the Grok step. The model told the two sources apart |

The raw probe capture was overwritten by a later dry check, which the route has fixed
since. The counts above were read from it before that. The transcript, kept in the
scratch evidence folder, is the stronger record.

## Validation

`bash route.sh claude` re-runs the static probes. `bash route.sh verify` compares the
installed version with this one.
