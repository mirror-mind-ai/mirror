[< CV21.DS12 Runtime Re-Baseline](../index.md)

# CV21.DS12.TS3 — Antigravity re-probe

**Status:** 🟢 In Progress — findings complete, awaiting Validation
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

## Findings — live

One session on 2026-10-13, 14:34–14:44 UTC, agy 1.3.4 (same binary as above), run by the
Navigator, with a scratch `HOME`. The session opened signed in to the Navigator's account
(banner) although the scratch `HOME` held no credential, so agy keeps its login outside
`HOME`. The workspace held
Mirror's `AGENTS.md` and probe hooks in agy's own format. Mirror's plugin had been
installed by the static step. The Navigator used two turns: a Mirror turn, then the
probe.

| # | Finding | Evidence | Result |
|---|---------|----------|--------|
| L1 | **A SessionStart `injectSteps` → `systemMessage` reaches the model** | the model quoted `…-start`; agy's transcript | ✓ instructions at session start |
| L2 | **`PreInvocation` fires before every model call, and its injection reaches the model.** It fired 32 times over two turns as the agent looped through tools. `invocationNum` resets to 0 at each user turn | probe capture (intact): `invocationNum` 0…30, then 0; the model quoted `…-turn-32`; the transcript holds `-turn-1` … `-turn-32` | ✓ per-turn injection exists. An adapter injects once per turn, on `invocationNum == 0` |
| L3 | The workspace `AGENTS.md` reaches the model, and 25 `mm:*` skills can be invoked | the model's answer | ✓ |
| L4 | Mirror Mode through the skill: `/mirror-mind:mm:mirror …` ran `mirror mirror load` and answered under `◇ financial`. The agent first explored for 48 s and 13+ actions, reading Mirror's own sources | screenshots | ✓, slow |
| L5 | **Nothing was logged.** Mirror recorded no conversation for the session. The staged Claude hooks never reached Mirror | scratch database; front-door log (only the agent's own `mirror` calls) | ✗ as static finding 4 predicted |
| L6 | MCP tools: none | the model's answer | ✗ as static finding 3 predicted |
| L7 | Hook payloads carry no prompt or reply text, only `conversationId`, `transcriptPath`, `invocationNum`, and the like. Logging must read the transcript, which is a readable JSONL | probe capture; the transcript | DS7 design input |
| L8 | The agent's own `mirror mirror log` wrote into another session's open conversation | TS2 L9 | ✗ a core defect (Debt Review) |

## Honest Parity

Today, with the canonical plugin installed through `agy plugin install`, Antigravity gets
the skills and nothing else Mirror ships. Every mechanism L4 needs exists and was
measured: SessionStart and per-turn injection (L1, L2) and a readable transcript (L7). With
a thin agy-native layer, Antigravity can reach L4. June's honest L3 is superseded. The
layer is a root `hooks.json` in agy's schema, `mcp_config.json`, and `rules/AGENTS.md`.

## The Bar For Removing Gemini CLI (proposed for TS6)

DS8 may remove Gemini CLI once Mirror's Antigravity integration gives a Gemini CLI user
what v0.32.1's Gemini wiring gives them. It is measured on the installed `agy` by a route
like this one:

1. all of Mirror's skills;
2. the Operating Instructions at session start;
3. Mirror Mode context injected once per user turn while Mirror Mode is active;
4. user and assistant messages logged, labelled `antigravity`, and the conversation
   closed at the end;
5. setup in no more documented steps than Gemini CLI's two.

MCP is not part of the bar, because v0.32.1's Gemini wiring carries none. Each item has a
measured mechanism above, so the bar is reachable, and the cutoff can then say nothing is
lost.

## Validation

`bash route.sh antigravity` re-runs the static probes. `bash route.sh verify` compares
the installed version with this one.
