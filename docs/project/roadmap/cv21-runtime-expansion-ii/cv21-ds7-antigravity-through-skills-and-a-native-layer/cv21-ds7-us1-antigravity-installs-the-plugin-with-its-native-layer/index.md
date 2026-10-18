[< Parent](../index.md)

# CV21.DS7.US1 — Antigravity installs the plugin with its native layer

**Status:** ✅ Done
**Type:** User Story

---

## User Story

In order to run Mirror on Antigravity without hand-wiring,
As an Antigravity user,
I want the shipped plugin to carry an agy-native layer — hooks in agy's
schema, `mcp_config.json`, and `rules/AGENTS.md` — that `agy plugin install`
stages beside the skills, with `mirror init` printing the steps,
So that the install is as short as Gemini CLI's and every later DS7 story
has a staged layer to put behavior into.

## Outcome

DS12.TS3 measured that `agy plugin install plugins/mirror-mind` takes the
Claude plugin's 25 skills but stages Claude's `hooks.json` verbatim — a file
agy cannot run (different schema, events, and output shape) — and skips
`mcpServers`. After this story the package also carries the agy-native
layer, generated beside the Claude surfaces by the plugin builder; a scratch
`HOME` install stages the skills and the layer; `mirror init` prints the
Antigravity steps when `agy` is on the PATH, in no more documented steps
than Gemini CLI's two (bar items 1 and 5). The hooks file is schema-valid
and staged; its injection and logging behavior are TS2's and TS3's.

## Acceptance Behavior

```text
Given the package carries the agy-native layer beside the Claude surfaces
When agy plugin install stages plugins/mirror-mind in a scratch HOME
Then the staged plugin holds all 25 mm skills, an agy-schema hooks file,
  mcp_config.json, and rules/AGENTS.md
And mirror init, finding agy on the PATH, prints the Antigravity steps,
  no more than Gemini CLI's two
And the generated layer is guarded: the committed files equal the
  generator's output, and the tarball ships them
And Claude Code, Codex, and Grok behavior is unchanged by the layer's
  presence
```

## Scope

- The plugin builder generates the agy layer: an agy-schema hooks file,
  `mcp_config.json` (the same locator entry the Claude manifest carries),
  and `rules/AGENTS.md` (the Operating Instructions as plugin rules).
- `mirror init` detects `agy` and prints the install steps; the wiring
  table gains the Antigravity row.
- The pack-contents and plugin guards cover the new files.
- Getting Started and the runtime interface contract name the Antigravity
  install, honest that injection and logging land with TS2/TS3.

## Out Of Scope

- Hook behavior: per-turn injection (TS2) and transcript logging (TS3).
- The live bar measurement (US4) and Gemini CLI's removal (DS8).
- MCP reachability on agy: the file ships; whether agy reaches the server
  is recorded at US4, not gated.

## Validation

Automated: generator/guard tests and wiring tests. Navigator-visible: a
scratch-`HOME` `agy plugin install` on the installed agy stages the skills
and the layer; `mirror init` output shows the steps.
