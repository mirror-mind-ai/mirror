[< CV21.DS12 Runtime Re-Baseline](../index.md)

# CV21.DS12.TS3 — Antigravity re-probe

**Status:** 🟢 In Progress — static probes done, live session pending
**Type:** Technical Story (spike)
**Delivery Story:** CV21.DS12 — Runtime Re-Baseline

---

## Technical Story

In order to replace Gemini CLI honestly,
as the Driver of CV21,
I want DS6's June findings re-measured on the installed `agy`, with the plugin import DS1
deferred run live,
so that DS7 builds on what Antigravity does today, and DS8 knows the bar it must wait
for.

## Outcome

Antigravity's plugin intake, hook contract, and injection are measured on the installed
version. The parity Antigravity can honestly claim as Gemini CLI's successor is stated.
So is the bar DS7 must reach before DS8 removes Gemini CLI (Navigator, 2026-10-13).

## Acceptance Behavior

```text
Given the package v0.32.1 ships, installed in a scratch prefix, and a scratch HOME
When the plugin is validated, imported, and installed on the installed agy
Then each finding below names the command, version, binary, and date
And the live session settles injection, logging, and skills
And the successor bar is stated from the findings
```

## Scope

- `agy plugin validate`, `import claude`, and `install`, all in a scratch `HOME`.
- The hook contract as the binary documents it.
- One live session (`route.sh live-antigravity`), at most two turns, with a login made
  inside the scratch `HOME`.

## Out Of Scope

- Building the Antigravity integration (DS7) or removing Gemini CLI (DS8).

## Evidence

agy 1.3.4. The binary is `~/.local/bin/agy`. Measured 2026-10-13 (10:19–10:20 UTC) with
`bash route.sh antigravity`. Full outputs: `evidence/agy-*`. The embedded user guide is in
`evidence/agy-strings.txt`.

## Findings — static

| # | Finding | How it was measured | Result |
|---|---------|---------------------|--------|
| 1 | agy's validator rejects the Claude layout: "missing plugin.json" at the plugin root | `agy plugin validate plugins/mirror-mind` | ✗, as in June |
| 2 | **`agy plugin import claude` finds nothing.** That holds both with v0.32.1's skills-dir wiring and with Mirror installed from a local Claude marketplace in the scratch `~/.claude` | `agy plugin import claude`, then `agy plugin list --json` | "No claude extensions found.", `[]`. DS1's bridge, never executed in June, does not work in either setup |
| 3 | **`agy plugin install <path>` takes the Claude plugin** (`source: claude-code`): 25 skills (as `mm:*`) and the hooks file are taken; `mcpServers: skipped (not found)` | `agy plugin install plugins/mirror-mind` | Skills ✓, MCP ✗. Staged at `~/.gemini/config/plugins/mirror-mind` |
| 4 | The staged root `hooks.json` is Claude's file verbatim, which agy's contract cannot run: different schema, events (`UserPromptSubmit` and `SessionEnd` do not exist), output (`injectSteps`, not `additionalContext`), and no `CLAUDE_PLUGIN_ROOT` in the binary | the staged file; strings of the binary | Mirror's hooks cannot run as written (live confirms) |
| 5 | The binary documents **`SessionStart`**: "inject welcome messages, initial instructions, or startup context once" (`injectSteps` → `systemMessage`) | embedded user guide | Absent in June |
| 6 | The binary documents **`PreInvocation`**: "inject context or instructions before the model runs", with `systemMessage` (persists across turns), `userMessage`, and `ephemeralMessage` (dropped after the turn) | embedded user guide | June's unverified stretch path is now documented: per-turn injection may be reachable (live) |
| 7 | Plugin MCP lives in `mcp_config.json`. Plugin instructions can ride in `rules/AGENTS.md` | embedded user guide | An Antigravity plugin layer needs both (DS7) |

## Open For The Live Session

- Do agy-native canary hooks reach the model, `SessionStart` once and `PreInvocation` on
  each turn?
- Does the staged Claude hooks file fire at all?
- Are `mm:*` skills invocable, and does `AGENTS.md` reach the session?
- Then: the parity level, and the successor bar for DS7 → DS8.

## Validation

`bash route.sh antigravity` re-runs the static probes. `bash route.sh verify` compares
the installed version with this one.
