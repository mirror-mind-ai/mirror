# Plan — CV21.DS4.US1

## Objective

Give a Codex user the install path the other plugin runtimes already have: the npm
package ships a Codex marketplace manifest that names `plugins/mirror-mind` as a local
plugin, and `mirror init` prints the two Codex commands that install it, in place of
the skills link, the `AGENTS.md` link, and the wrapper v0.32.1 prints today. The path
is proven on the installed Codex from a scratch prefix and a scratch `CODEX_HOME`, with
no model call: the plugin installs, `codex plugin list` shows it, and the rendered
prompt carries all 25 `mm-*` skills with no skills link in place.

What is already true, and not redone here: Codex 0.162.1 installs the shipped
Claude-format plugin from a local marketplace (DS12.TS2 static 5), the plugin alone
exposes the 25 skills (static 6), its hooks run after a one-time trust (L1), and
since DS2 they know their runtime, log replies, start the MCP server as written, and
read `$mirror-mind:mm:mirror`. US1 ships the marketplace and the printed steps; it
does not change a hook, the manifest, or the server.

## Scope

**The marketplace manifest, shipped.**

- New file `.agents/plugins/marketplace.json` at the repository root, which is the
  package root (D2). Codex reads a marketplace from this path (DS12.TS2 static 5; the
  binary also names `.claude-plugin/marketplace.json` and
  `.cursor-plugin/marketplace.json`, and one file is enough). Shape, as DS12's route
  wrote it and Codex took it:
  marketplace `name` `mirror-mind`, an `owner`, and one plugin entry, `name`
  `mirror-mind`, `source` `{ "source": "local", "path": "./plugins/mirror-mind" }`,
  with a one-line description. The install selector is therefore
  `mirror-mind@mirror-mind`. The `owner` is a name, no e-mail.
- **Generated, not hand-written** (decision 1 below). `buildClaudePlugin.ts` already
  emits `plugin.json` from `PACKAGE_NAME` and `--check` guards its drift; the
  marketplace is emitted by the same build (`buildMarketplace` beside
  `buildManifest` in `ts/src/guards/claudePlugin.ts`), so the plugin's name lives in
  one constant. Its test sits beside the manifest's in
  `ts/test/scripts/claudePlugin.test.ts`: the generated text parses, names the
  package, lists one plugin whose `name` is the manifest's and whose local `path`
  resolves from the repository root to the plugin directory, and the file in the tree
  equals the generated text.
- `package.json` `files` gains `.agents/plugins`. The `.agents/skills/` symlinks beside
  it stay out of the tarball, as today.
- `ts/src/guards/packContents.ts`: `.agents/plugins/marketplace.json` joins
  `ALLOWED_FILES` and `REQUIRED_FILES`, so a tarball without it fails
  `checkPackContents`. Its test in `ts/test/scripts/packContents.test.ts` follows.

**What `mirror init` prints for Codex.**

- `ts/src/runtime/wiring.ts`, the `codex` entry: two steps,
  `codex plugin marketplace add "<pkg>"` and `codex plugin add mirror-mind@mirror-mind`,
  the second followed by the note that Codex asks once, at the next session, to trust
  the plugin's hooks, and that the plugin then loads every session with its skills,
  the hooks, and the MCP server. The header comment's Codex paragraph is rewritten to
  what 0.162.1 does; "since Codex has no hooks this integration uses" goes. The step
  count stays 2, so the "honest counts" test keeps its numbers and changes its
  reasons.
- Tests: `ts/test/runtime/wiring.test.ts` (the Codex case) and
  `ts/test/frontDoor/initCli.test.ts` (the `Codex:\n  1. …` assertion), written first.

**The package smoke.**

- `scripts/smoke_npm_package.sh` gains a static step after the install: the manifest is
  in the installed package, parses, and its plugin `path` resolves to the installed
  `plugins/mirror-mind/.claude-plugin/plugin.json`. CI has no `codex`, so this is as
  far as the smoke reaches; the live install is the Navigator's route below. Step 10,
  the wrapper around a stand-in `codex`, is left as it is: it is TS5's to retire.

**Docs that describe what `init` prints.**

- `docs/getting-started.md` §6 "Wire Your Runtime": the Codex row becomes the two
  plugin commands, and the paragraph above it still counts two steps for Codex. The
  "### Codex" run section starts Codex as `codex`, names the one-time hook trust as
  expected (and does not coach the user past it), and gives the plugin's skill form
  (`$mirror-mind:mm:mirror`, DS12.TS2 L10). "How the mirror reaches each runtime"
  says Codex receives the Operating Instructions through the plugin's SessionStart
  hook, as a developer message (TS2 L4).
- **Migration and removal** (decision 2): the same section tells a user who wired
  Codex before this version to undo the v0.32.1 wiring — remove
  `~/.codex/skills/mirror-mind`, remove the `AGENTS.md` link, and start `codex`
  directly rather than through the wrapper — because left in place they double the
  skills and the Operating Instructions in every prompt, and the wrapper's import at
  exit logs every turn a second time beside the plugin's live hooks. It also names the
  way back: `codex plugin remove mirror-mind@mirror-mind` and
  `codex plugin marketplace remove mirror-mind`. The wrapper itself keeps one
  sentence: the previous wiring, still shipped until TS5 removes it.
- `docs/product/specs/runtime-interface/index.md` "Installed package wiring": the
  Codex row becomes the two commands, with the version measured, and its D13 column
  becomes the plugin's SessionStart hook. The "### Codex" reference-implementation
  section above it, which describes the wrapper, is TS5's.
- `AGENTS.md`'s skill-naming line gains the Codex plugin form `$mirror-mind:mm:<skill>`
  beside `$mm-<skill>`, since this story is what sends Codex users to the plugin.
- `docs/project/decisions.md`: one entry, "Codex installs Mirror from a marketplace the
  package ships", recording the path chosen (`.agents/plugins/marketplace.json`, a
  local source, one file) and what was not chosen (a Claude-format marketplace file;
  a generated manifest; automating the install, which the `runtime install` non-goal
  forbids).

**The story package.** `route.sh` beside this plan, with a `static` step (the package
smoke and `mirror init` from the scratch prefix with a stand-in `codex` on the PATH)
and a `codex` step (the scratch install on the real binary, below). Hardened per
decision 3: the scratch prefix path contains a space; the expected skill count is
read from the installed plugin's `skills/` directory, never a literal; the `codex`
step ends with the two remove commands and checks the cache and `config.toml` entry
are gone; and the route names the surfaces that must not change (Pi, Claude Code, and
Gemini CLI wiring lines; `smoke_npm_package` step 10). Evidence in `test-guide.md`
with version, binary, and date.

## Non-Goals

- Retiring `scripts/codex-mirror.sh`, `scripts/codex-hooks/`, the `codex:*` hook
  family, `smoke_codex.sh`, their pack guards, or the CI step: TS5, gated on US4.
- A live Codex session with a model: US4 measures L4. This story stops at
  `codex debug prompt-input`, which renders the prompt without a model call.
- SessionEnd's 1 s bound (TS2), the `$`-skill rule (TS3), and the plugin cache after an
  npm update (TS6).
- Any change to the plugin: its hooks, `hooks.json`, the manifest, or the MCP entry.
- Changing Claude Code's wiring to a marketplace install. The skills-dir link stays.
- Running `codex plugin …` for the user from `mirror init`. Printing is not automating
  (CV22.DS10.US3).

## Acceptance Behavior

```text
Given the package installed in a scratch prefix, and codex on the PATH
When the user runs mirror init <name>
Then the Codex wiring reads
     1. codex plugin marketplace add "<prefix>/lib/node_modules/mirror-mind"
     2. codex plugin add mirror-mind@mirror-mind
And no line names ~/.codex/skills, ~/.codex/AGENTS.md, or scripts/codex-mirror.sh

Given a scratch CODEX_HOME with no skills link and no AGENTS.md
When the user runs the two printed commands against the installed Codex
Then codex plugin list shows mirror-mind installed from marketplace mirror-mind
And codex debug prompt-input hello, from an empty project directory, renders 25 mm-*/SKILL.md
And codex mcp list shows the mirror-mind server

Given the packed tarball
When checkPackContents and smoke_npm_package run
Then .agents/plugins/marketplace.json is in the package, parses, and points at the plugin
And .agents/skills/ is not in the package
```

## Validation Route

**Automated (Driver).** From the repository root: `npm run typecheck`, `npm run lint`,
`npm test`, `node ts/scripts/checkPackContents.ts`, `node ts/scripts/checkDocLinks.ts`,
`node ts/scripts/buildClaudePlugin.ts --check`, `bash scripts/smoke_npm_package.sh`. The
new tests fail before the change and pass after it.

**Navigator, step 1 — what `init` prints.** `bash route.sh static` from this package:
packs the tree, installs it into a scratch prefix, runs `mirror init` with a stand-in
`codex` on the PATH, and shows the Codex wiring. Expected: the two commands above, the
package path filled in, nothing naming the skills link, `AGENTS.md`, or the wrapper.
Fail: any of those three named, or a step count other than 2.

**Navigator, step 2 — the install on the real Codex.** `bash route.sh codex`: with a
scratch `HOME` and `CODEX_HOME`, runs `codex plugin marketplace add` on the scratch
prefix's package root, then `codex plugin add mirror-mind@mirror-mind`, then
`codex plugin list`, `codex debug prompt-input hello` from an empty directory, and
`codex mcp list`. It records `codex --version` and `which -a codex` beside the date.
Expected: the plugin installed into `CODEX_HOME/plugins/cache/mirror-mind/mirror-mind/<version>`,
`config.toml` holding `[plugins."mirror-mind@mirror-mind"] enabled = true`, as many
`mm-*/SKILL.md` in the rendered prompt as the installed plugin has skill directories
(25 today), the `mirror-mind` server listed; then, after the two remove commands, no
cache directory and no `config.toml` entry. Fail: the marketplace add refused (the
package root is outside `$HOME`, or holds a space; DS12 installed from `/tmp`, so the
first is not expected, and both are checked first), a skill count below the plugin's,
no server, or a removal that leaves the cache or the entry behind. The route mutates
nothing outside its scratch directory.

**E2E decision:** required, and step 2 is it: the real binary, the shipped file, no
model. A model session is US4's.

**Step 3 — the workspace marketplace, a recorded finding** (decision 4). The binary
names "workspace plugins" and a project's `.agents/plugins/marketplace.json`; after
this story the checkout carries one. `bash route.sh workspace` opens a scratch project
holding a copy of the tree's manifest and plugin, with a scratch `CODEX_HOME`, and reads
`codex plugin list`, `codex plugin marketplace list`, and `config.toml` without
installing anything. Expected: Codex lists the marketplace or ignores it, and installs
and enables nothing. A plugin installed or enabled with no user action is a stop
condition: a Navigator decision before Done, since every user who clones a repository
would inherit it. Recorded in the evidence either way.

## Implementation Contract

- Tests first: `wiring.test.ts`, `initCli.test.ts`, `packContents.test.ts`, and the
  marketplace cases in `claudePlugin.test.ts` fail, then the change makes them pass.
- Keep changes scoped to `CV21.DS4.US1`: the files named in Scope and this story
  package. The wrapper and its files are not touched.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- The installed Codex refuses `codex plugin marketplace add` on a path outside `$HOME`
  or on a path with a space (navigator_decision_needed: the install path changes shape).
- Codex installs or enables a plugin from a project's `.agents/plugins/marketplace.json`
  with no user action (navigator_decision_needed before Done).
- A version of Codex other than 0.162.1 is installed when the route runs, and its
  `codex plugin` surface differs (re-probe before implementation, as the evidence rule
  asks).
- scope_change_detected, plan_rule_conflict, failing_required_check_without_clear_fix.

## Decisions Taken At Approval

Recorded on 2026-10-17, after the plan review by the engineer, devops-engineer,
quality-assurance, security-engineer, and ai-engineer lenses.

1. **The marketplace manifest is generated**, by `buildClaudePlugin.ts` beside
   `plugin.json`, from `PACKAGE_NAME`, and drift-guarded by `--check`; its test sits
   beside the manifest's. A static file with its own comparison test was withdrawn:
   two mechanisms for one name.
2. **Migration and removal are documented in this story**, not deferred to TS5: a
   v0.32.1 Codex user who runs the new steps and keeps the old wiring gets the skills
   and the Operating Instructions twice per prompt and, through the wrapper, every turn
   logged twice. Getting Started names what to undo and the two remove commands.
3. **The route is hardened:** a space in the scratch prefix path (the wrapper's worst
   defect was a path with a space), the skill count read from the installed plugin
   rather than a literal, removal run and checked at the end, and the unchanged
   surfaces named.
4. **The workspace-marketplace behavior is a recorded finding with a stop condition**,
   not a curiosity: list-only is fine; install or enable without a user action is a
   Navigator decision before Done.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
