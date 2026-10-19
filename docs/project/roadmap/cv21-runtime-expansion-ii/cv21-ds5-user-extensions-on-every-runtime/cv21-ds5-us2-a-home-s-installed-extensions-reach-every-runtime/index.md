[< CV21.DS5 User Extensions On Every Runtime](../index.md)

# CV21.DS5.US2 — A home's installed extensions reach every runtime

**Status:** ✅ Done — 2026-10-19
**Type:** User Story
**Delivery Story:** CV21.DS5 — User Extensions On Every Runtime

---

## User Story

As a person who installed Mirror Mind with `npm install -g` and keeps extensions in
my Mirror home,
I want `mirror extensions install` to put each extension's skill where Claude Code,
Codex, Antigravity, and Grok Build will find it, in the shape TS1 chose, and
`mirror runtime diagnose` to tell me when a runtime is running an older copy,
So that an extension I install once is a command on every runtime I use, as it has
been on Pi and Claude Code, without my rewriting its manifest or reading a story's
evidence to learn how each runtime takes a plugin.

## Outcome

**Done 2026-10-19** on claude 2.1.296, codex 0.163.0, agy 1.4.2, grok 1.0.62, package
0.35.0: `mirror extensions install`, `uninstall`, and `sync` regenerate
`runtime/plugin/mirror-ext-<user>/`, version `0.1.<generation>`, and print the step a
runtime on the `PATH` still needs, the reinstall for a stale copy, and the extensions
not carried; `runtime diagnose` raises the five `ext_plugin_*` findings and `runtime
status` the plugin line. Measured on the four installed runtimes: each lists the skill
after its printed step; added, changed, and removed each advance one generation, with
the reinstall bringing every copy level; two homes wire beside each other; about 136
bytes per extension in Codex's prompt. Grok refuses any plugin install without
`--trust`, so the step keeps it with a consent line saying there is nothing to
activate. Paid on the way: the canonical plugin's Claude Code step gained `mkdir -p`.
Carried: the canonical plugin's agy copy finding, to DS11. US3 runs `review-copy`
through this.

As planned: `mirror extensions install` and `uninstall` regenerate one plugin per Mirror home,
`runtime/plugin/mirror-ext-<user>/`, in the canonical plugin's format: a Claude
manifest, the root `plugin.json` marker Grok and agy read, a Codex marketplace file,
and under `skills/` each installed extension's `claude` skill as its manifest declares
it, no hooks and no server. Its version advances with each regeneration. `mirror
extensions install` prints, for each runtime on the `PATH`, the one-time wiring step
when the runtime has not taken the plugin yet, and the reinstall when the runtime
holds a copy behind the generated version; `runtime diagnose` reports the same as
findings, in the family DS4.TS6 and DS10.US1 gave the canonical plugin, and `runtime
status` counts the plugin's skills. Nothing changes in any manifest, in Pi's catalog
path, in `expose-claude`, or in the canonical plugin.

## Acceptance Behavior

```text
Given a scratch Mirror home with review-copy installed from examples/extensions
When the user runs mirror extensions install
Then runtime/plugin/mirror-ext-<user>/ holds .claude-plugin/plugin.json, plugin.json,
     .agents/plugins/marketplace.json, and skills/ext-review-copy/SKILL.md, nothing else,
     the manifest's name is mirror-ext-<user> and its version advanced,
     and the report prints the wiring step for each runtime on the PATH not yet wired

Given the plugin wired into each runtime by the printed step, in a scratch HOME
When each runtime's reader runs (TS1's readers)
Then ext-review-copy is listed on Claude Code, Codex, agy, and Grok

Given a second extension installed, or review-copy's SKILL.md changed and
      install run again
When mirror runtime diagnose runs
Then one finding per copying runtime names the copy behind and the one command
     that brings it level, and Claude Code, which links, has no finding
And the install report printed the same commands

Given the reinstall run on each copying runtime
When each runtime's reader runs
Then the runtime lists the new skill, or the changed one

Given mirror extensions uninstall review-copy
When the plugin is read
Then skills/ext-review-copy/ is gone and the version advanced,
     and after the reinstall no runtime lists it

Given two Mirror homes on one machine
When each generates its plugin
Then they are named for their homes and wire beside each other on every runtime

Given a machine with no runtime wired
When mirror runtime diagnose runs
Then nothing about the extensions plugin is reported
```

## Scope

- `ts/src/extensions/extensionPlugin.ts`: the generator, from the installed manifests.
- `ts/src/extensions/catalogWrites.ts`: `installExtension` and `uninstallExtension`
  regenerate; the reports print the wiring and the reinstall.
- `ts/src/runtime/wiring.ts`: the extensions plugin's steps per runtime, beside the
  canonical plugin's.
- `ts/src/runtime/pluginWiring.ts`, `diagnose.ts`, `status.ts`: the readers
  parameterized by plugin name, the `ext_plugin_*` findings, the skills count.
- The contract's external-skill section and REFERENCE's `extensions` synopsis.
- The story `route.sh`: `setup`, `probe`, `generate`, `wire`, `change`, `two-homes`,
  `diagnose`, `cost`, `static`, `clean`, `untouched`.

## Out Of Scope

- `review-copy` run to its report on any runtime, and `command-skill` extensions
  invoked through `mirror ext` on each (US3); Getting Started, README, and the
  invocation names a user reads (TS4); the parity matrix (DS11).
- Running the wiring or the reinstall for the person: printing is not automating,
  as `mirror init`'s policy stands.
- The canonical plugin, Pi's catalog, `expose-claude`, the manifest validator, and
  any `runtimes:` block.

## Validation

Driver: typecheck, lint, the suite with the new tests first, pack-contents, doc-link,
plugin-build checks, and the two package smokes, green. Navigator: `route.sh generate`,
`wire`, `change`, `two-homes`, `diagnose`, `cost`, and `untouched`; details in
[test-guide.md](test-guide.md).
