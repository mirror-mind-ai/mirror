[< CV21.DS12 Runtime Re-Baseline](../index.md)

# CV21.DS12.TS4 — Grok Build re-probe

**Status:** 🟢 In Progress — static probes done, live session pending
**Type:** Technical Story (spike)
**Delivery Story:** CV21.DS12 — Runtime Re-Baseline

---

## Technical Story

In order to decide what DS10 builds,
as the Driver of CV21,
I want DS9's June findings re-measured on the installed `grok`, now 1.x where June's
was 0.2.x, with the plugin install DS1 deferred run live,
so that Grok's parity claim rests on today's binary.

## Outcome

Grok's consumption of the Claude-format plugin, its discovery of the existing Claude
wiring, and its hook contract are measured on the installed version. The live session
settles injection and logging.

## Acceptance Behavior

```text
Given the package v0.32.1 ships, installed in a scratch prefix, and a scratch HOME
When the plugin is validated, discovered, and installed on the installed grok
Then each finding below names the command, version, binary, and date
And the live session settles injection, logging, and the interface label
```

## Scope

- `grok plugin validate`, `install --trust`, and `details`, plus `grok inspect --json`, in
  a scratch `HOME`.
- The hook contract as the installed version's bundled guide states it.
- One live session (`route.sh live-grok`), at most two turns, with a login made inside the
  scratch `HOME`.

## Out Of Scope

- Building the Grok integration (DS10).

## Evidence

grok 1.0.52 (0920c8169e27). The binary is `~/.grok/bin/grok` →
`~/.grok/downloads/grok-1.0.52-macos-aarch64`; `~/.local/bin/grok` links to the same.
Measured 2026-10-13 (10:20–10:21 UTC) with `bash route.sh grok`. The bundled guide is
`~/.grok/docs/user-guide/10-hooks.md`, dated 2026-10-13. Full outputs: `evidence/grok-*`.

## Findings — static

| # | Finding | How it was measured | Result |
|---|---------|---------------------|--------|
| 1 | Grok validates the shipped Claude plugin as-is: "1 skill dir(s) … hooks, MCP servers" | `grok plugin validate plugins/mirror-mind` | ✓ |
| 2 | **v0.32.1's Claude wiring alone (`~/.claude/skills/mirror-mind`) gives Grok all 25 Mirror skills.** Grok's Claude compatibility scans that directory | `grok inspect --json`, scratch `HOME` | ✓ 25, with no Grok step |
| 3 | `grok plugin install` needs explicit trust. With `--trust` it installs the plugin with all three parts: 25 skills, `hooks/hooks.json` as a plugin hook file, and the MCP server with `${CLAUDE_PLUGIN_ROOT}` resolved to the installed `mcp/launch.sh` | `grok plugin install … --trust`, `details`, `inspect --json` | ✓ |
| 4 | Per the guide: `SessionStart` is observe-only and reads only a top-level `systemMessage`. `UserPromptSubmit` can block a prompt but has no `additionalContext`, which exists only for tool hooks and `Stop` | bundled guide, lines 95–96, 354, 438, 620 | Per-turn prompt injection is still absent per the docs, as in June (live) |
| 5 | Grok runs Claude hooks from `~/.claude/settings.json` always, and from `<project>/.claude/settings.json` once the project is trusted | bundled guide, lines 69–72 | Mirror's Claude hooks can fire under Grok |

## Open For The Live Session

- Do the plugin's hooks fire, and which `interface` label does Mirror record? They are
  Mirror's `claude:*` family, so `claude_code` is expected, which would be a mislabel.
- Does a `SessionStart` `systemMessage` reach the model or only the screen (canary)?
- Does `AGENTS.md` reach the session, and is the MCP server reachable?

## Validation

`bash route.sh grok` re-runs the static probes. `bash route.sh verify` compares the
installed version with this one.
