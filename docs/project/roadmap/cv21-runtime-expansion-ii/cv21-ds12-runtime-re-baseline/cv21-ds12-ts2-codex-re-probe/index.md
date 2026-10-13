[< CV21.DS12 Runtime Re-Baseline](../index.md)

# CV21.DS12.TS2 — Codex re-probe

**Status:** ✅ Done
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

## Findings — live

One session on 2026-10-13, 14:27–14:34 UTC, Codex 0.162.1 (same binary as above), run by
the Navigator. Mirror was installed as the plugin only, from the local marketplace, in a
scratch `CODEX_HOME`. There was no skills link and no `~/.codex/AGENTS.md`. Probe hooks
were added and the login was made inside the scratch home. There were two turns.

| # | Finding | Evidence | Result |
|---|---------|----------|--------|
| L1 | Codex asks once to trust the hooks: "8 hooks are new or changed" (the plugin's 4, the probe's 4). After trust they are active | screenshots (`/hooks` table) | ✓ trust is one step |
| L2 | `async` hooks now run synchronously: "running async SessionEnd hook synchronously" | startup warning | DS3's "async hooks are skipped" caveat is obsolete |
| L3 | **Context injected at session start and on every turn reaches the model.** The model declined to quote "hidden system or developer context". The transcript settles it | rollout: `…-start`, `…-turn-1`, `…-turn-2` | ✓ the L4 mechanism |
| L4 | **The plugin's SessionStart hook delivers the Operating Instructions as a developer message (D13)** | rollout line 9 (role `developer`). Line 5 is a project `AGENTS.md` the Driver's dry run had left in the project folder | ✓ The `~/.codex/AGENTS.md` step becomes unnecessary |
| L5 | **Mirror Mode answers through the plugin's skill:** `$mirror-mind:mm:mirror …` ran `mirror mirror load` ("Mirror Mode active · Persona: financial") | screenshots | ✓ |
| L6 | **The MCP server does not start:** "MCP startup failed: No such file or directory (os error 2)". `${CLAUDE_PLUGIN_ROOT}` is expanded for hook commands, which run in a shell with it set, but not in the MCP `command` | startup warning; the model's answer "mirror-mind: NONE" | ✗ DS2 or DS4 |
| L7 | **The session is logged as `claude_code`.** The plugin's hooks are Mirror's `claude:*` family | scratch database, conversation `e6f1b048` | ✗ a mislabel |
| L8 | Codex's replies were not logged, only the two prompts. The plugin's SessionEnd never reached Mirror (no front-door call after 14:33:12), although the probe's SessionEnd fired, so the conversation stayed open | database; front-door log | ✗ |
| L9 | That open conversation later received an "assistant" message from another session. At 14:41:53, Antigravity's agent ran `mirror mirror log "…"` with no session of its own, and Mirror appended it here. zsh had expanded `$297` and `$497` to nothing | database timestamps; front-door log | ✗ a core defect, outside CV21's scope (Debt Review) |
| L10 | A plugin skill reaches UserPromptSubmit as `$mirror-mind:mm:mirror …` | probe capture | The inject hook does not match this form either (TS1 L4) |
| L11 | Hook payloads carry `session_id`, `turn_id`, `transcript_path`, and, at Stop, `last_assistant_message` | probe capture | Replies can be logged from Stop, without parsing a transcript |

The model's own count of "28" `mm` skills is unverified. The static measurement is 25.
The raw probe capture was overwritten by a later dry check, which the route has fixed
since. The counts were read from it before that, and the rollout is kept in the scratch
evidence folder.

## Validation

`bash route.sh codex` re-runs the static probes. `bash route.sh verify` compares the
installed version with this one.
