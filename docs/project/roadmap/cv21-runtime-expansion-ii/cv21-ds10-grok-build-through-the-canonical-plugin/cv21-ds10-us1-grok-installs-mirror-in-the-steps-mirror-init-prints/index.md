[< CV21.DS10 Grok Build Through The Canonical Plugin](../index.md)

# CV21.DS10.US1 — Grok installs Mirror in the steps `mirror init` prints

**Status:** ✅ Done
**Type:** User Story
**Delivery Story:** CV21.DS10 — Grok Build Through The Canonical Plugin

---

## User Story

As a person who installed Mirror Mind with `npm install -g` and uses Grok Build,
I want `mirror init` to hand me the steps that wire Mirror into Grok, and
`mirror runtime diagnose` to tell me when that wiring is behind or no longer reads,
So that Grok loads the same plugin Claude Code and Codex load — its skills, its hooks,
its MCP entry, and the Operating Instructions — without my reading a spike's evidence
to learn which of Grok's install shapes works today.

## Outcome

`mirror init` prints a `Grok Build:` block when `grok` is on the `PATH`, two steps, the
count Codex has: `grok plugin install "<pkg>/plugins/mirror-mind" --trust`, which copies
the plugin into `~/.grok/installed-plugins/` and enables it, and
`ln -s "<pkg>/AGENTS.md" ~/.grok/rules/mirror-mind.md`, which loads the Operating
Instructions as a rule in every Grok session. Both were selected by a probe on the
installed Grok (1.0.62, 2026-10-18) from five shapes, recorded in [plan.md](plan.md).
The probe also found that the root `plugin.json` marker DS7.US1 added shadows the
Claude manifest on Grok, hiding the plugin's version and MCP entry; the marker now
carries both, generated from the one source and drift-guarded, and every runtime that
reads the plugin directory still sees exactly one MCP server. `runtime diagnose` reads
Grok's install registry and the rules link, and names the one command that repairs a
copy behind the installed package, a duplicated copy, or a dangling rule;
`runtime update` prints the same after an update. `grok plugin validate` joins the
plugin smoke where the binary is present. decisions.md records the probe, the shapes
not chosen, the rule's global scope and token cost, and that `grok plugin update` is a
no-op for a local source.

## Acceptance Behavior

```text
Given the package installed in a scratch prefix, and grok on the PATH
When the user runs mirror init <name>
Then the Grok Build block prints the two steps with the package path filled in,
     the trust note under the first and the token note under the second,
     and the other four runtime blocks read as before

Given a scratch HOME on the installed Grok, with no Claude link and no project AGENTS.md
When the user runs the two printed steps
Then grok inspect --json lists the plugin's 25 skills from source plugin:mirror-mind,
     its hooks file, the mirror-mind MCP server, and the rule with scope global,
     and grok plugin list --json reports the installed plugin's version

Given a Grok copy behind the installed package, two copies, or a dangling rules link
When the user runs mirror runtime diagnose
Then one finding per defect names the path and the one command that repairs it
And a machine with no Grok wiring reports nothing about Grok
```

## Scope

- The probe of Grok's install shapes and the decision rule — done, in [plan.md](plan.md).
- `ts/src/guards/claudePlugin.ts`: the root marker carries `version` and `mcpServers`.
- `ts/src/runtime/wiring.ts`: the `grok` entry, its order, the reinstall command.
- `ts/src/runtime/pluginWiring.ts`, `diagnose.ts`, `update.ts`: the registry and link
  readers and their findings, `$GROK_HOME` else `~/.grok` defaulted at the entry.
- `scripts/smoke_claude_plugin.sh`: `grok plugin validate` when `grok` is present.
- Getting Started §6 and the runtime interface contract's installed-package wiring
  table: Grok's row. decisions.md: the entry.
- The story `route.sh`: `setup`, `probe`, `static`, `guards`, `grok`, `diagnose`,
  `untouched`, `clean`.

## Out Of Scope

- MCP attachment to the model's session (TS2); the live session, the rule followed by
  the model, the `grok_build` logging through the shipped install, and the 1.5 s close
  (US3); README, REFERENCE, the Getting Started run section, and the contract's Grok
  reference implementation (TS4); `review-copy` on Grok (DS5).
- Any change to the plugin's hooks, the MCP command, or `AGENTS.md`.
- A Grok marketplace file; running the steps for the user; the in-place link shape.

## Validation

Driver: the suite, the pack, doc-link, and plugin-build checks, and the two package
smokes, green. Navigator: `route.sh static`, `guards`, `grok`, `diagnose`, and
`untouched` — details in [test-guide.md](test-guide.md).
