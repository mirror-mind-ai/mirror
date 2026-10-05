[< Story](index.md)

# Plan — CV22.DS10.US3

**Status:** drafted 2026-09-30 at the Plan checkpoint; **panel review done 2026-09-30, its
findings folded below**; **second panel pass done 2026-10-05 (the four lenses the first
left out), its findings folded below the same day**; **approved by the Navigator on
2026-10-05 with D1–D13.**
**Driver:** Vinícius. **Delivery:** the `mirror-ts-core` branch.

---

## Objective

Make Mirror Mind installable with one command and no checkout: `npm install -g mirror-mind`
puts `mirror` on the `PATH`, `mirror init` and `mirror seed` work from an empty machine, and
each of the four runtimes (Pi, Claude Code, Gemini CLI, Codex) is wired to that install by
one documented step. Close the thirteen items TS5 left this story, decide what the Windows
Frame and installer become, and make the Zero Python claim for the **shipped artifact**, the
half TS5 could not make. Stop at a packed tarball that installs and runs: publication,
dist-tags, tag, stable promotion, and the release stay separate Navigator gates.

## What Is True Before This Story

Read from the code and the story packages on 2026-09-30, not from the inheritance table
alone:

- **The front door already has a shebang.** `ts/src/frontDoor/cli.ts` starts with
  `#!/usr/bin/env node`. What it lacks is the in-process `ExperimentalWarning` filter that
  `ts/src/mcp/main.ts` carries; every skill silences `node:sqlite`'s warning with
  `NODE_OPTIONS=--no-warnings`, which no `bin` shim will set.
- **Node's own env-file loader has `--env-file` semantics.** `process.loadEnvFile(path)`
  fills `process.env` without overriding variables already set (verified on this machine:
  `FOO=fromenv` survives a file that says `FOO=fromfile`). The core can read a config file
  itself; nothing needs the flag.
- **`packageIdentity.ts` and `installKind.ts` already know two layouts.** `PACKAGE_NAME`
  (`mirror-core`) is one constant; `MANIFEST_CANDIDATES` accepts `ts/package.json` beside
  `ts/src/frontDoor/cli.ts` or a root `package.json` beside `src/frontDoor/cli.ts`; the
  updater's `package` kind is a tree under `npm root -g` whose nearest `package.json` has a
  name and version, and its `clone` kind is a root holding `.git` and `ts/package.json`.
  Whatever layout this story chooses must satisfy one detector, not two.
- **`ts/package.json` is `mirror-core@0.31.14`, `private`, no `bin`, no `files`,** with one
  runtime dependency (`yaml`) and thirty-six `#`-imports rooted at `./src`, `./test`,
  `./evals`, `./smoke`.
- **The npm name `mirror` is taken** (`mirror@0.3.3`, unrelated). `mirror-mind`,
  `mirrormind`, and `@mirror-mind/core` are free as of 2026-09-30. A `bin` name is
  independent of the package name.
- **Every runtime integration assumes the checkout.** The Pi extension spawns
  `node --env-file-if-exists=.env ts/src/frontDoor/cli.ts` with a comment that says Pi runs
  with the repository root as its working directory. All 135 skill invocations across 24 Pi
  skills, and their 132 Claude and 132 plugin copies, are
  `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts …` (`.agents/skills`
  are symlinks to the Pi copies). The twelve generated hook wrappers resolve the repository
  from `$BASH_SOURCE`, find Node by a fixed search, and read `<checkout>/.env` themselves to
  locate the home for their `hooks.log` note. `plugins/mirror-mind/mcp/launch.sh` runs a bare
  `node` on `<checkout>/ts/src/mcp/main.ts`.
- **Pi installs packages.** `pi install npm:<name>`, `pi install git:…`, or
  `pi install <local path>`; a package declares `extensions`, `skills`, `prompts`, and
  `themes` under a `pi` key in `package.json`, dot-prefixed roots listed explicitly. A local
  path is "loaded from the resolved path without copying"; npm and git sources are copied
  under Pi's own directory. Personal installs go to `~/.pi/agent/settings.json`, project
  installs to `.pi/settings.json` behind project trust. Pi identifies local packages by
  resolved absolute path.
- **The Claude plugin has no marketplace.** `plugins/mirror-mind/` carries a manifest,
  hooks, skills, and the MCP launcher; no `marketplace.json` exists anywhere in the
  repository; the plugin smoke runs the hooks in place. A plugin Claude Code installs is
  copied into its own cache, where `$BASH_SOURCE` resolution finds nothing — TS5's "hook
  window", accepted because CV22 releases once.
- **Three readers locate the tree three ways.** `init` walks up from its own file for
  `templates/identity`; `runtime release-notes` asks `git rev-parse --show-toplevel` and
  falls back to the cwd; the welcome card's local release title reads
  `<cwd>/docs/releases/<version>.md`. Only the first works for an installed package. The
  updater's `capture`/`package` lane already reads the package's own manifest.
- **`frame/` and `installer/` are a Windows product on a premise this branch deleted.**
  `frame/main/command-registry.js` spawns `uv run python -m memory` for eight commands and
  deliberately has no update entry; `installer/bootstrap.ps1` installs Git, Node LTS, `uv`,
  and Pi, clones the repository, and runs `uv sync`; `root-resolve.js`, `health-check.ps1`,
  `install.ps1`, and `launcher/mirror.cmd` find the tree by the deleted `pyproject.toml`.
  `.github/workflows/windows-installer.yml` builds and smokes an Inno Setup artifact on
  Node **22**. The core supports POSIX only, has no Windows CI leg, and refuses Node below
  24. The `python-core-mentions` guard exempts nine of these files by name "until US3".
- **The updater's `package` lane exists and is smoked against a packed tarball** (US2,
  plateau 4): `npm view … dist-tags` resolution, `npm install -g <name>@<version>`, capture,
  recovery. Two things are missing: nothing writes `~/.config/mirror/update-channel`
  (D-027), and the pipeline body is duplicated per install kind (D-026).
- **`PROGRAM` is `mirror`** (`ts/src/util/program.ts`), and nine goldens carry it in the
  commands they print. `inherited.md` item 2 predicts they "take the same edit again" when
  the `bin` is named. If the `bin` is `mirror`, no edit happens.
- **The "before" capture can be taken now.** Every change on the release gate has landed
  (CR105 with CR090 on 2026-09-28), so a `scripts/ts5/capture_family_outputs.sh` run today is
  after CR008, and item 13's one expected difference does not arise.
- **CR106 is open:** a Pi session started against a scratch Mirror home copies the whole Pi
  history into it. Any validation route that opens Pi on a scratch home must point
  `PI_SESSIONS_DIR` at a scratch directory too.
- **There is no `LICENSE` file at the repository root.** The README says MIT.
- **The operating instructions are a project-root file.** `CLAUDE.md` (with `AGENTS.md`
  a symlink to it) carries both Mirror's Operating Instructions — the four modes and
  their automatic selection, the `◇ persona` signature, the Builder Activation Boundary,
  the Ariad surface transport invariant, the mode-ambiguity rule — and this repository's
  Project Context. The runtime-interface spec says context is "a static `AGENTS.md` in
  the project root"; the `pi` manifest key has no slot for it. A skill answering from an
  installed package is not a Mirror session until those instructions reach the model.

## The Design

Stated once, so the design is what was reviewed.

**The repository is the package (D2).** The manifest moves from `ts/package.json` to the
repository root, and `files` whitelists the runtime subset: `ts/src`, `templates`,
`docs/releases`, `.pi/extensions`, `.pi/skills`, `.claude/hooks`, `.gemini/hooks`,
`plugins/mirror-mind`, `scripts/codex-hooks`, `scripts/codex-mirror.sh`, `README.md`,
`LICENSE`. An installed package therefore has **the same paths as a checkout**: the front
door is `ts/src/frontDoor/cli.ts` in both, `templates/identity` sits beside it in both, a
wrapper's `../..` reaches the root in both. Nothing that ships moves; what moves is
developer tooling (the manifest, lockfile, `tsconfig`, Biome config, `node_modules`, the
`npm run` scripts), which CI verifies. The alternative — publishing `ts/` as the package and
moving every runtime asset under it — was rejected at review: it moves 60 skill directories
and every path the documentation names, adds symlinks for the harness directories, and
needs a pack-time copy for release notes.

**One name, one command, one entry per runtime kind (D1, D5).** The package is
`mirror-mind`; `bin` maps `mirror` to `ts/src/frontDoor/cli.ts` and `mirror-hook` to
`ts/src/hooks/main.ts`. `PROGRAM` stays `mirror`, `PACKAGE_NAME` becomes `mirror-mind`,
`private` is dropped. The warning filter that the MCP entry already has moves into one
module the three entries share, so no invocation needs `NODE_OPTIONS`.

**Configuration is read by the core, from two places, in one order (D3).** Real
environment first; then `<clone root>/.env` when the install is a clone; then
`${XDG_CONFIG_HOME:-~/.config}/mirror/env`, the OS-user directory US2 already chose for
the package channel. One module, used by the front door, the hook entry, and the MCP
entry; the `--env-file*` flags leave the wrappers, the extension, the launcher, and the
skills, so there is one mechanism and it is inside the program. `mirror init <user>` on
an install that resolved no user writes `MIRROR_USER=<user>` into the config file, creates
it `0600` in a `0700` directory, and prints where to add `OPENROUTER_API_KEY`. The key
is never taken from the command line. A second mirror on the same machine runs with
`MIRROR_USER=<other>` in the shell, as today.

**Skills say `mirror`. Every copy (D7).** The Pi source, the Claude copies, and the
generated plugin all invoke `mirror <command>`. `checkSkillCommandParity.ts` gains the
mirror image of its Python assertion: no skill copy may name `ts/src/frontDoor/cli.ts`,
`NODE_OPTIONS`, or `--env-file`. Repository tooling — tests, smokes, guards, the CI
workflow — keeps calling `node ts/src/frontDoor/cli.ts` directly; the assertion is about
what an agent is told to run, not about what a script runs.

**Hooks resolve two ways, from one generator (D5).** In-tree wrappers (`.claude/hooks`,
`.gemini/hooks`, `scripts/codex-hooks`) keep `$BASH_SOURCE` resolution: their location is
ours in both worlds, and the design is proven. The plugin's wrappers, whose location is
Claude Code's, are generated in a second form that finds `mirror-hook`: `MIRROR_BIN` if
set, else `command -v`, else the same short list of global bin directories the Node search
uses today, then `dirname` of that on the front of `PATH` so the shim's `env node` resolves
in a GUI launch. Both forms keep the contract: never fail the turn, one line in
`<home>/hooks.log` when they cannot run. `launch.sh` becomes `exec mirror mcp` with the same
search. The generator moves to `scripts/generate_hook_wrappers.sh` (item 10), and
`hooks.test.ts` asserts both forms against their templates.

**Pi loads Mirror from the install, or from the project — not both (D6).** For an npm user:
`pi install "$(npm root -g)/mirror-mind"` — a local path, one copy, upgraded in place by
`npm install -g`. The manifest's `pi` key names `./.pi/extensions/mirror-logger.ts` and
`./.pi/skills`. The extension stops assuming the cwd: it resolves the front door from its
own file (`../../ts/src/frontDoor/cli.ts`), so the extension always runs the core it ships
with. Inside the checkout, Pi keeps discovering the same files as project resources, as
today; a developer who has also installed the personal package is told to pick one, and
plateau 2 verifies what Pi does when both are present (see the QA finding). Developers put
`mirror` on the `PATH` with `npm link` from the repository root. The extension also
checks, once per session start, that `mirror` resolves (`command -v`, then the same
short list of global bin directories the hook wrappers search); when it does not, it
prints one visible line naming `npm link` from the repository root or the global bin
directory to add to the `PATH`. Without that line an agent whose skills say `mirror`
meets `command not found` and improvises the checkout form the parity guard forbids.

**The operating instructions ship, and each runtime is told how to load them (D13).**
`CLAUDE.md` is split. `AGENTS.md` becomes a real file holding only Mirror's
runtime-independent Operating Instructions, listed in `files`, so it sits at the root of
the installed package as it does in the checkout; `CLAUDE.md` keeps the Project Context
and includes `AGENTS.md` by reference, so the checkout's behavior is unchanged. For an
installed package, each runtime gets its instructions by a mechanism named and verified
at plateau 3 against that runtime's own docs: Pi reads `<pkg>/AGENTS.md` through the
extension, which injects it from its own tree so the instructions always match the core
they ship with; Claude Code through the plugin, or the user-level `CLAUDE.md` including
the package path; Gemini CLI and Codex through their user-level instructions file. A
session that answers `/mm-mirror` but cannot route modes or sign a persona is not a
Mirror session, and route 2 asserts the difference.

**Every tree reader asks one resolver.** `init`, `runtime release-notes`, and the welcome
card's local release title read from the tree that holds the running front door — the
`findPackageIdentity` walk — never from the cwd or from git. Release notes ship in the
package as `docs/releases/*.md`, the same path as the checkout, with no copy step.

**The updater finishes its package lane (D9).** One pipeline body, two apply strategies
(D-026 paid). `mirror runtime channel [stable|main]` shows or sets the channel for this
install: the `.mirror-update-channel` marker for a clone, `~/.config/mirror/update-channel`
for a package (D-027 paid). `runtime status` and `runtime version` print the install kind
and root (US2 D3, deferred to here). After a **clone** update, when `mirror` does not
resolve on the `PATH`, the updater prints one line naming `npm link` — the seam every
existing clone user crosses once (QA finding). The newer-database refusal names the route
for its install kind: `mirror runtime update` (item 12). `npm run release:promote` gains
the publish steps as **dry-run-only** entries in this story: `npm publish --dry-run` and
the `dist-tag` plan are printed; nothing reaches the registry. `runtime diagnose` gains
a `hooks` check: it reads the tail of `<home>/hooks.log` and reports how many wrapper
failures landed there since the last successful hook, because "never fail the turn" is
right for the turn and wrong for the product — when the plugin's wrapper cannot find
`mirror-hook`, the agent keeps answering and memory silently stops, and nobody reads
`hooks.log`.

**The Frame and the installer are retired with a cutoff (D4, recommended).** `frame/`,
`installer/`, `docs/installer/`, and `.github/workflows/windows-installer.yml` are deleted;
the cutoff names the last Python-bearing release (`v0.31.14`, tag
`cv22-last-python-bearing`) as where they still work. Before the deletion, plateau 5
records in D4 how many people installed the Inno Setup artifact, from the release
assets' download counts and the Navigator's knowledge; if none, the cutoff promises no
Windows story, and a Windows product over the npm package waits for a request; if some,
the cutoff and the release note address them by name.

**The first seconds are an orientation, not a usage dump.** `mirror` with no arguments
and no resolved user prints three lines — no user configured, run `mirror init <user>`,
where the config file will live — and after `init` the welcome card the product already
has. The README's first lines name `mirror-mind` (install) and `mirror` (run) once
together, so the two names read as intended rather than as drift. `mirror init` ends by
printing the wiring step for each runtime it can detect on the machine (`pi`, `claude`,
`gemini`, `codex` on the `PATH`), the same step the getting-started page documents —
printing is not automating, and the `runtime install <runtime>` non-goal stands. The nine `python-core-mentions` exemptions
expire with the files. The alternative (re-home onto the Node core in its clone shape) is
in D4.

**The tarball is checked, not trusted.** A new guard, `ts/scripts/checkPackContents.ts`,
runs `npm pack --dry-run --json` and asserts the file list: the runtime subset is present;
no `ts/test`, `ts/smoke`, `ts/evals`, `tmp`, `.env*`, `*.db`, `*.py`, `frame`, `installer`,
`spikes`, `examples`; no lifecycle scripts (`preinstall`, `install`, `postinstall`) in the
manifest. Installing Mirror is a file copy.

**A package smoke proves the install from nothing.** `scripts/smoke_npm_package.sh`
packs, installs into a scratch prefix (`npm install -g --prefix <tmp> <tarball>`), and with
`PATH=<tmp>/bin`, `HOME=<tmp>/home`, and no checkout in sight runs `mirror init`,
`mirror seed`, `mirror list personas`, `mirror runtime status` (kind `package`), opens a
demo database that needs migration `017` through the installed package (migrate-on-open,
bootstrap lock, pre-write snapshot from the package location), runs
`mirror runtime update --check` with `npm view` shadowed, and then feeds the four runtime
smokes' payloads to the **installed** wrappers and `mirror mcp`. The real `npm` is captured
before `PATH` is replaced (US2's lesson). Interpreters are shadowed throughout.

## Scope

### A. Baseline and names (plateau 0)

- `scripts/ts5/generate_hook_wrappers.sh` → `scripts/generate_hook_wrappers.sh`;
  `scripts/ts5/capture_family_outputs.sh` → `scripts/capture_family_outputs.sh`; every
  wrapper header regenerated; `scripts/ts5/` gone (item 10).
- The "before" capture on a fresh copy of the real database, through today's invocation,
  saved under `tmp/us3/` (never committed). Taken after CR008 (item 13, no difference
  expected).

### B. The package (plateau 1)

- Manifest at the root: `name: mirror-mind`, `version` unchanged, `private` removed,
  `bin`, `files`, `engines`, `license`, `repository`, `keywords` (`pi-package`), `pi`
  manifest; `#`-imports re-rooted; lockfile, `tsconfig`, Biome config, `node_modules`,
  and `npm run` scripts at the root; CI's `working-directory` and the development guide
  follow (D2). `LICENSE` added. `AGENTS.md` split out of `CLAUDE.md` as a real file
  holding the Operating Instructions, listed in `files`; `CLAUDE.md` includes it (D13).
- Bare `mirror` with no resolved user prints the three-line orientation; `init` ends with
  the detected runtimes' wiring steps.
- `PACKAGE_NAME = "mirror-mind"` (item 3). `MANIFEST_CANDIDATES` reduced to the one layout
  that now exists in both worlds; `installKind`'s clone marker becomes root
  `package.json` + `.git`. Tests pin a linked clone (`npm link`) as `clone`, a copy under
  `npm root -g` as `package`.
- One `ts/src/runtime/config.ts`: the two-file resolution and the warning filter, called
  by `cli.ts`, `hooks/main.ts`, `mcp/main.ts`. `init` writes `MIRROR_USER` (D3).
- One tree-root resolver for `init`, `releaseNotes.ts`, and `welcome/card.ts`.
- `checkPackContents.ts` in CI and the pre-push set.
- `smoke_npm_package.sh`, first half: pack, install, `init`, `seed`, `list`, `status`,
  the demo-database open.

### C. Skills and Pi (plateau 2) — the first Navigator walk

- All 135 Pi invocations, their Claude copies, and the plugin regenerated: `mirror …`.
  `mm-build` loses its `NODE_OPTIONS=… cli.ts build` lines the same way (D7).
- `checkSkillCommandParity.ts`: the new absence assertion.
- The extension resolves the front door from its own file and drops the cwd comment (D6);
  checks at session start that `mirror` resolves and prints the `npm link` line when it
  does not; and injects `<pkg>/AGENTS.md` from its own tree for installed-package
  sessions (D13). Before the check exists, route 1 is run once without `npm link` and
  what the agent does is recorded in the story index.
- Verification of Pi's behavior with a personal package and project discovery of the same
  files; if it double-loads, the extension refuses its second registration (one pid-scoped
  guard), and the outcome is recorded.
- Development guide: `npm link` as dev setup; `.env` unchanged for clones.

### D. Hooks, plugin, MCP, Gemini, Codex (plateau 3)

- Second `bin`, `mirror-hook` (D5). The generator's second form for the plugin;
  `launch.sh` → `mirror mcp`; `hooks.test.ts` for both forms.
- `smoke_npm_package.sh`, second half: the four runtime smokes against the installed
  package's wrappers and `mirror mcp`; `smoke_claude_plugin.sh` runs the plugin's hooks with
  `mirror-hook` on a scratch `PATH`, closing the hook window.
- The per-runtime wiring step for Gemini CLI and Codex npm users (user-level hook settings
  pointing at `<pkg>/.gemini/hooks/*.sh` and the shipped `codex-mirror.sh`; skills linked
  into each runtime's user-level skills directory, verified against each runtime's own docs
  at this plateau). The steps are counted honestly per runtime and the count recorded; the
  Operating Instructions' delivery for Claude Code, Gemini CLI, and Codex is named and
  verified here too (D13).
- `runtime diagnose`'s `hooks` check over `hooks.log`, asserted by `smoke_claude_plugin.sh`
  in package mode with `mirror-hook` removed from the `PATH`.

### E. Updater and release tooling (plateau 4)

- D-026 paid; `runtime channel` (D9); install kind in `status`/`version`; the clone
  post-update `npm link` line; item 12; `release:promote` dry-run publish steps.
- `smoke_runtime_update.sh` extended for the channel command and the new line.

### F. The Frame, the installer, and the artifact claim (plateau 5)

- Per D4. The installer's user count recorded in D4 first. If retired: the deletions, the `windows-installer.yml` workflow, a
  `frame-installer` row in `checkRetiredSurfaces.ts`, the cutoff in
  `docs/releases/pending-cutoffs.md`, the nine exemptions removed, the platform envelope in
  `REFERENCE.md` rewritten. If re-homed: the nine call sites, the four root-detection
  sites, `uv sync` → `npm ci`, Node 24 in the workflow, and a recorded Windows risk.
- `checkPackContents.ts`'s `*.py` / `uv` / `python -m memory` assertions are the artifact
  half of the Zero Python gate.

### G. Docs, records, replay, review (plateau 6)

- The bridge paragraphs deleted from `REFERENCE.md` and `docs/getting-started.md` (item 1);
  getting started rewritten around `npm install -g` with an "Upgrading from a clone"
  section; `REFERENCE.md` running-a-command and configuration sections; architecture;
  the runtime-interface spec's hook and install wiring; the extension authoring guide's
  invocation form (`mirror ext …`, CR093's half that lives here); troubleshooting (item 12);
  the 137 doc lines that still print the checkout invocation.
- The `automation` repository handoff: the exact substitution for its 93 occurrences,
  recorded, not performed (item 8).
- `docs/project/briefing.md` D2/D6/D8 and the Builder baseline rewritten for the Node core
  if the Navigator folds it here (D11).
- The "after" capture through `mirror`, diffed against plateau 0: identical.
- DS10 and CV22 indexes, the journey path, worklog, decisions; `handoff.md`; the panel's
  handoff review.

## Non-Goals

- **`npm publish`, dist-tag creation, GitHub Release, tag, stable promotion, version
  bump.** The release gate. `release:promote`'s publish steps are printed as a dry run and
  never executed in this story.
- **Windows support for the core.** The platform envelope stays POSIX; item 11's
  `renameSync` promotion keeps its abort-on-failure behavior and is recorded as a Windows
  limitation for the Windows story (D10).
- **A Windows product over the npm package.** A new story after the migration, if the
  Frame is retired (D4).
- **Mirror Desktop.** Outside the migration by the 2026-09-19 decision.
- **Editing the `automation` repository or the `extensions/*` repositories.** Recorded as a
  handoff (item 8, CR093).
- **A `mirror runtime install <runtime>` command that writes runtime settings.** One
  documented step per runtime is proportionate; automation of it waits for evidence that
  the step is mistyped in practice.
- **A Claude marketplace.** CV21's plugin distribution is its own work; this story makes
  the plugin location-independent so any distribution can carry it.
- **Changing what any skill does.** Only the invocation form changes. CR108's drift
  between Claude and Pi copies stays captured.
- **Rewriting the Python-era updater's last hop.** A clone on `v0.31.14` that updates to
  the CV22 release fast-forwards, then fails its post-update status because the new tree
  has no Python. That code cannot be changed from here; the cutoff and the release note
  own the words, and the release gate owns the check (handoff).

## Plateaus

Each closes with a commit, green CI (`gh run watch`), and a handoff line in the story
index's *Plateau Progress*.

0. **Baseline and names** (§A). No behavior change.
1. **The package** (§B). Handoff: `npm pack` produces a tarball that installs into a scratch
   prefix and runs `init`, `seed`, `list`, `status`, and a migrating open with no checkout.
2. **Skills and Pi** (§C). Handoff: inside the checkout, every skill answers through
   `mirror` from the linked clone; outside it, Pi loads Mirror from an installed package.
   **This is the plateau the Navigator validates first** (test guide, route 1 and 2).
3. **Hooks, plugin, MCP, Gemini, Codex** (§D). Handoff: the four runtime smokes pass against
   the installed package; the installed-plugin hook window is closed.
4. **Updater and release tooling** (§E). Handoff: a package install checks, plans, and
   updates through dist-tags with `npm view` shadowed; the channel is settable; the clone
   seam prints its line.
5. **The Frame, the installer, the artifact** (§F). Handoff: the pack-contents guard proves
   the shipped artifact holds no Python; the exemptions are gone.
6. **Docs, records, replay, review** (§G). Handoff: the "after" capture matches plateau 0;
   the panel's handoff review is recorded; Validation follows.

## Rollback

- Nothing is published. There is no registry state to undo.
- Each plateau is one commit on the Delivery branch; reverting a plateau restores the
  previous invocation form, since skills, wrappers, and the manifest change together in
  their plateau.
- `npm unlink -g mirror-mind` removes the developer link; `pi remove <path>` removes a
  personal Pi package.
- The Frame and the installer, if retired, stay in history and work in
  `cv22-last-python-bearing` (`b0d34254`), as the cutoff says.
- The smokes never touch a real remote, a real registry, a real home, or the real database.

## Acceptance Behavior

```text
Given a machine with Node 24+, npm, and no Mirror checkout
When  the user runs `npm install -g <tarball>` and then `mirror init <user>`
Then  `mirror` is on the PATH and prints its usage
And   `~/.config/mirror/env` exists with MIRROR_USER=<user>, mode 0600, its directory 0700
And   the command tells the user where to add OPENROUTER_API_KEY and never reads it from argv
And   `mirror seed` seeds the templates the package carries, and `mirror list personas`
      shows twelve
And   `mirror runtime status` reports install kind `package (mirror-mind@<version>)` and
      the install root
And   no python, python3, or uv process was spawned at any point

Given that install and a database from an older Mirror
When  the front door opens it
Then  migrate-on-open runs under the bootstrap lock from the package location, the
      pre-write snapshot lands in the mirror home, and the ledger reads current

Given that install and Pi
When  the user runs `pi install "$(npm root -g)/mirror-mind"` and opens Pi in any directory
Then  /mm-mirror, /mm-journeys, and /mm-build <slug> answer from the installed package,
      the status line renders, and the session's messages are logged through the extension
And   a prompt whose correct answer depends on the Operating Instructions, not on a skill
      (a Mirror Mode question answered under a persona signature, or a Builder load
      that stops at the Activation Boundary), is answered as the checkout would answer it
And   no skill, hook, or extension names ts/src/frontDoor/cli.ts, NODE_OPTIONS, or --env-file

Given the checkout, Pi opened inside it, and no `mirror` on the PATH
When  the session starts
Then  the extension prints one line naming `npm link` from the repository root, and the
      agent is not left to improvise an invocation

Given the plugin copied into a directory that is not the package
When  Claude Code fires SessionStart, UserPromptSubmit, and SessionEnd
Then  each wrapper finds mirror-hook on the PATH (or through MIRROR_BIN) and the hook runs
And   the MCP launcher starts the server through `mirror mcp`
And   when neither can be found, the turn is not failed and one line lands in hooks.log
And   `mirror runtime diagnose` then reports the hook failures from hooks.log by count and
      date, so the silent stop is visible where the person looks

Given the checkout, `npm link` run once at its root, and Pi opened inside it
When  the Navigator runs the skills used daily (/mm-mirror, /mm-build mirror-ts-core, the
      Ariad lifecycle commands, /mm-backup, /mm-update --check)
Then  every one answers through `mirror` from this tree, `runtime status` says
      `clone (<this path>)`, and the capture replay through `mirror` matches plateau 0

Given a package install on channel <c> with the registry shadowed
When  `mirror runtime update --check`, `--dry-run`, and `update` run
Then  the channel's dist-tag resolves to a version, capture records the installed one,
      apply is `npm install -g mirror-mind@<resolved>`, migrate and validate run in fresh
      processes, and the recovery route names the captured version
And   `mirror runtime channel main` persists the channel for this install kind, and
      `mirror runtime channel` prints it

Given a clone updated to this story's tree with no `mirror` on the PATH
When  `runtime update` finishes
Then  its last lines name `npm link` from the repository root, once

Given the packed tarball
When  the pack-contents guard runs
Then  the runtime subset is present and nothing else: no tests, goldens, evals, smokes,
      tmp, .env, databases, .py files, frame, installer, spikes, examples; and the manifest
      declares no install lifecycle script

Given `git ls-files` and the tarball, if D4 retires the Frame
Then  neither holds frame/, installer/, docs/installer/, or the Windows workflow; the
      cutoff names v0.31.14 as where they work; the retired-surface guard has their row;
      D4 records how many people installed the artifact and the cutoff speaks to them

Given a package install with no user configured
When  `mirror` runs with no arguments
Then  it prints three lines: no user configured, run `mirror init <user>`, where the config
      file will live
And   `mirror init <user>` ends with the wiring step for each runtime found on the PATH

Given REFERENCE.md, docs/getting-started.md, and the skills after plateau 6
Then  no bridge paragraph remains, `mirror` is the only invocation a reader is told to
      type, and "Upgrading from a clone" says to run `npm link` once
```

## Validation Route

The test guide carries the commands. In outline:

1. **Automated:** `npm test` at the root (new: `config`, `treeRoot`, `packContents`,
   `installKind` for the linked clone, `hooks` for both wrapper forms, `runtime channel`,
   the parity guard's new assertion); `checkPackContents.ts`; `smoke_npm_package.sh`;
   `smoke_runtime_update.sh`; the four runtime smokes in package mode; the interpreter
   shadow; the existing checks and custody proofs.
2. **Navigator-visible, plateau 2, route 1 — the checkout.** `npm link` at the root, then
   the daily skills inside Pi; `runtime status` names this tree.
3. **Navigator-visible, plateau 2, route 2 — outside the checkout.** A scratch prefix, a
   scratch home, a scratch `PI_SESSIONS_DIR` (CR106); `npm pack`, install, `init`, `seed`,
   `pi install <scratch package path>`, then Pi opened in `/tmp`: `/mm-mirror`,
   `/mm-journeys`, `/mm-build <slug>`, the status line, and one prompt that only the
   Operating Instructions can answer correctly (D13). No checkout is on the `PATH`
   or in the cwd.
4. **Navigator-visible, plateau 3:** Claude Code with the plugin copied out of the tree, if
   the Navigator uses Claude Code; otherwise `smoke_claude_plugin.sh` in package mode is
   the evidence and the route says so.
5. **Navigator-visible, plateau 6:** the capture replay through `mirror` diffed against
   plateau 0, on the same database copy.
6. **E2E decision: required.** The story's subject is an install with no checkout; nothing
   run inside this repository can stand in for it.

## Implementation Contract

- TDD: config resolution and its precedence, the tree-root resolver, install-kind for a
  linked clone, both wrapper forms against their templates, the pack-contents assertions,
  `runtime channel` per kind, the clone post-update line, `init`'s config write and its
  permissions, the newer-database route, the extension's `mirror`-resolves check, the
  `AGENTS.md` injection, `diagnose`'s `hooks` check, and the bare-`mirror` orientation —
  each a failing test before the source changes.
- One module for configuration; one for the tree root; one generator for wrappers. No
  entry point keeps a private copy of any of the three.
- `git mv` for every relocation; no file is deleted and recreated.
- Every skill edit is a script with asserted counts (135 / 132 / 132), reviewed as a
  diff, never a hand pass.
- The smokes capture the real `npm` before shadowing, run under scratch `HOME`, `PATH`,
  and prefix, and never open the real database or a real registry.
- No `any`; the install kind, config source, and wrapper form are discriminated unions.
- Commit per plateau, English messages explaining why, `gh run watch` green before the
  next plateau, `git add` by path.
- Nothing in this story publishes, tags, pushes `stable`, or bumps the version.

## Stop Conditions

- **scope_change_detected** — a reader of the tree outside the three named appears; a
  runtime needs a mechanism beyond "one documented step" to load the package; the skill
  rewrite finds an invocation whose meaning is not `mirror <args>`.
- **navigator_decision_needed** — any of D1–D12 declined or amended in a way that changes
  the layout or the Frame's disposition; Pi double-loads the extension and neither
  mitigation in §C is acceptable.
- **failing_required_check_without_clear_fix** — CI red after a plateau for a reason
  outside that plateau; the package smoke cannot be made deterministic with `npm`
  shadowed.
- **plan_rule_conflict** — a runtime's user-level wiring cannot be verified against its
  docs at plateau 3 (fallback: that runtime's step is recorded as unverified in the
  handoff, with the project-level wiring still proven).
- **unsafe_operation** — any path in which `init` echoes or stores a key from argv, the
  tarball carries an env file or a database, or a smoke touches a real home or registry.

## Decisions This Plan Asks The Navigator To Take

1. **D1 — Package `mirror-mind`, bin `mirror`.** Unscoped, free on the registry as of
   2026-09-30, the plugin's name, the GitHub org's name. `PROGRAM` is unchanged, so the
   nine goldens `inherited.md` item 2 predicts are not edited; item 2 closes as "no edit".
   Alternative: `@mirror-mind/core`, which needs the npm org first.
2. **D2 — The repository is the package.** Manifest at the root, `files` whitelist, same
   paths installed and checked out. Alternative: publish `ts/` and move runtime assets
   under it (rejected above, with reasons).
3. **D3 — Configuration: environment, then `<clone>/.env`, then `~/.config/mirror/env`.**
   `init` writes `MIRROR_USER` when no source resolved a user; the key is added by hand.
   Alternative: a new `mirror config` command — more surface for the same file.
4. **D4 — The Frame and the installer retire with a cutoff.** Recommended. Their premise
   (a `uv`-bearing clone) is gone; the core has no Windows CI and a known Windows-breaking
   path (item 11); a Windows product over the npm package deserves its own story and CI,
   as the web console and Mirror Desktop had their own decisions. Alternative: re-home onto
   the Node core in its clone shape (nine call sites, four root sites, `uv sync` → `npm
   ci`, Node 24) — ships a Windows product on a core that is not tested on Windows.
   **Amended 2026-10-05 (second panel pass):** plateau 5 records how many people installed
   the artifact before deleting it; with none, the cutoff promises no Windows story; with
   some, the cutoff and the release note address them.
5. **D5 — Two bins, two wrapper forms.** `mirror-hook` for the hook entry; in-tree
   wrappers keep `$BASH_SOURCE`, the plugin's find the bin. Alternative: a `mirror hook`
   front-door route — puts a runtime entry in the user's usage and three lines per turn in
   `front-door.log`.
6. **D6 — Pi wiring is `pi install "$(npm root -g)/mirror-mind"`.** One copy; the
   extension runs the core it ships with. Alternative: `pi install npm:mirror-mind` — a
   second copy under Pi's directory that can drift from the global bin.
7. **D7 — Every skill copy says `mirror`, and the parity guard forbids the checkout
   form.** Developers `npm link`. Alternative: keep the checkout form in the Pi source and
   rewrite only the plugin — two invocation grammars, which is how CR071 happened.
8. **D8 — Release notes ship as `docs/releases/*.md` inside the package**, read from the
   tree root. Alternative: a URL only.
9. **D9 — `mirror runtime channel [stable|main]`**, per install kind; D-026 paid in the
   same plateau. Alternative: leave the channel file to a text editor (D-027 carried
   again).
10. **D10 — Item 11 is recorded, not fixed.** A failed snapshot promotion still aborts the
    write; the Windows story owns a retry. Alternative: a copy-and-unlink fallback nobody
    can run in CI.
11. **D11 — The briefing's D2, D6, D8, and Builder baseline are rewritten here** (plateau
    6), since this story rewrites the install documentation anyway. Alternative: a CR.
12. **D12 — The Python-era updater's last hop is a release-gate item.** This story writes
    the cutoff and the "Upgrading from a clone" section; the gate checks the hop on the
    production clone (F20's closing check) before promotion.
13. **D13 — The Operating Instructions ship, and each runtime is told how to load them.**
    `AGENTS.md` becomes a real file holding only Mirror's runtime-independent Operating
    Instructions, in `files`; `CLAUDE.md` keeps the Project Context and includes it. Pi
    reads it through the extension from its own tree; Claude Code, Gemini CLI, and Codex
    through a mechanism named and verified at plateau 3 against each runtime's docs.
    Route 2 asserts a mode-routed behavior, not only a skill. Alternative: ship skills
    only and document the file for the person to copy — a session that answers
    `/mm-mirror` without routing modes or signing personas is not a Mirror session.

14. **D14 — `init` creates `~/.mirror-minds/<user>`** (taken at plateau 1, 2026-10-05). Python's
    `default_user_home` wrote the legacy `~/.mirror/<user>` and told the person to set
    `MIRROR_HOME` by hand; with D3 writing `MIRROR_USER`, a legacy home would print the
    legacy-path warning on every later command. Alternative: keep parity and have `init`
    write `MIRROR_HOME` instead — a per-user absolute path in a file meant to hold a name.
15. **D15 — the `mirror` bin is `bin/mirror.js`, a loader shim** (taken at plateau 1,
    2026-10-05, on the package smoke's first finding). Node refuses to strip types for
    files under `node_modules` and has no flag for it, so "ship `.ts`, no build step" holds
    in a checkout and through `npm link` but not under `npm install -g`. The shim registers
    a `module.registerHooks` load hook that strips types for `.ts` files under its own
    package root only, then runs the front door's `runAsEntry()`, which the entry guard
    calls too; every shipped path stays what it is (D2), and `mirror-hook` (D5) takes the
    same shim at plateau 3. Both APIs are experimental in Node 24, the class `node:sqlite`
    already puts the core in; the package smoke pins them on CI. Alternative: compile to
    `dist/` at `prepack` — breaks D2's same-paths claim, needs `tsc` emit with import
    rewriting and a second `#imports` map, and brings back the two-layout detector.

Approving the Plan approves these as recorded; amendments re-open Plan.

## Review

Per the [collaboration strategy](../../collaboration-strategy.md), this story is well
above a small slice: a new install kind for every runtime, a manifest relocation, a
skill rewrite in three copies, a product retirement, and the artifact half of the Zero
Python gate.

- **Plan review, before implementation — done 2026-09-30.** Panel: engineer,
  quality-assurance, devops-engineer, security-engineer, database-architect. Synthesis:
  the shape is sound once the layout question is settled — the repository as the package
  removes most of the moving parts the first draft had, and the remaining risk sits at
  three seams: what an existing clone user meets after the release, what Pi does when the
  same extension is reachable twice, and whether the artifact is checked rather than
  trusted. Findings, all folded above:
  - **the first draft published `ts/` and moved every runtime asset under it**
    (engineer) — sixty skill directories, symlinked harness directories, a pack-time copy
    of release notes, and a generator whose depths change; the repository-as-package
    layout keeps every shipped path identical in both worlds. Now D2;
  - **existing clone users lose every skill the moment they update** (quality-assurance) —
    after `git pull`, the skills say `mirror` and nothing provides it; and the Python-era
    updater's last hop fails its post-update status on a Python-less tree. Now an
    acceptance criterion (the post-update line), the "Upgrading from a clone" section, and
    D12;
  - **the Navigator's route opened Pi on a scratch home without a scratch
    `PI_SESSIONS_DIR`** (quality-assurance) — CR106 would have copied his whole Pi history
    into the scratch home. Now in route 2;
  - **a personal Pi package and project discovery can load the extension twice**
    (quality-assurance) — double logging in every checkout session. Now a plateau-2
    verification with a named mitigation;
  - **the config file holds the API key** (security-engineer) — `0600` in a `0700`
    directory at creation, `loose_permissions` in `runtime diagnose` extended to it, and
    `init` never reads the key from argv;
  - **`MIRROR_BIN` is a new env-controlled executable path for hooks** (security-engineer)
    — same trust class as `MIRROR_NODE`, which the wrappers already honor; accepted and
    documented, not widened;
  - **the tarball was trusted** (devops-engineer, security-engineer) — a pack-contents
    guard in CI, `files` as a whitelist, and no install lifecycle scripts;
  - **the read half still hid the install kind** (devops-engineer) — `status` and
    `version` print kind and root, the deferral US2 D3 made to this story;
  - **nvm makes a global install per Node version** (devops-engineer) — `mirror` and the
    Pi local-path package vanish on a Node switch; documented in troubleshooting rather
    than engineered around;
  - **the package smoke proved `init` on an empty home and nothing about a real
    database** (database-architect) — it now opens a demo database that needs `017`
    through the installed package, so migrate-on-open, the lock, and the snapshot run
    from the package location;
  - **one config file, several homes** (database-architect) — the file names the default
    user; `MIRROR_USER` in the shell selects another; the channel stays per OS user;
  - **three readers located the tree three ways, one of them from the cwd** (engineer) —
    one resolver, and the welcome card's local release title stops reading `<cwd>/docs`;
  - **the hook entry as a front-door route** (engineer) — a runtime entry in the user's
    usage and three log lines per turn; now a second bin, D5;
  - **item 2 predicts a golden edit that will not happen** (engineer) — recorded as
    closed by D1 rather than left for a reader to look for.

  Not requested by the Navigator and therefore not run on 2026-09-30: ai-engineer,
  prompt-engineer, experience-designer, product-designer.
- **Second plan review, before approval — done 2026-10-05.** Panel: the four lenses the
  first pass left out — prompt-engineer, ai-engineer, product-designer,
  experience-designer — chosen because the story's subject is Mirror's front door for a
  stranger with no checkout, and it rewrites every word an agent is told to run.
  Premises re-checked first: the nine changes since 2026-09-30 (CR112, CR111, CR113,
  CR114, CR115, CR082, CR009, CR103, CR107, CR117) are all RS001 Ariad-runtime fixes and
  touch no packaging, hook, or skill invocation; the counts still read 135 / 132 / 132.
  Synthesis: the engineering shape is settled; what the Plan had not looked at is the
  gap between *the package installs and runs* and *the product arrives* — for an npm
  user, Mirror is the core, the skills, **and the operating instructions that make a
  session behave as a mirror**, and the third is not in the tarball. The second
  concentration of risk is silence: the human and the agent can each land where `mirror`
  is missing or hooks stopped, and nothing says so where they are looking. Findings, all
  six accepted by the Navigator on 2026-10-05 and **folded above** (D13, §B, §C, §D, §E,
  §F, the acceptance behavior, route 2, and the implementation contract):
  - **the operating instructions do not ship** (prompt-engineer, product-designer) —
    `files` does not list `CLAUDE.md`/`AGENTS.md`, the `pi` manifest key has no slot for
    project instructions, and the runtime-interface spec says context is "a static
    `AGENTS.md` in the project root". Route 2 will pass — `/mm-mirror` answers — and the
    session in `/tmp` will still not route modes, sign personas, hold the Builder
    Activation Boundary, or preserve Ariad blocks verbatim. Proposed: split `CLAUDE.md`
    into Mirror's runtime-independent Operating Instructions (shipped) and this
    repository's Project Context (not shipped); name a delivery mechanism per runtime in
    §D (Pi: the extension or `~/.pi/agent/AGENTS.md`; Claude Code: the plugin; Gemini and
    Codex: the user-level instructions file); add to route 2 one prompt whose correct
    answer depends on the Operating Instructions, not on a skill. Offered as **D13**;
  - **the agent with no `mirror` has no sanctioned move** (ai-engineer) — after plateau
    2 the skills say `mirror …` and the parity guard forbids the checkout form; a clone
    without `npm link`, or a GUI-launched Pi whose `PATH` lacks the global bin, gives the
    agent `command not found`, and it improvises `node ts/src/frontDoor/cli.ts`, the
    grammar the guard just forbade. The human got a post-update line on 2026-09-30; the
    agent got nothing. Proposed for §C: the extension runs `command -v mirror` at session
    start and emits one visible line naming `npm link` (or the global bin) when it does
    not resolve. Measure first: run route 1 once without `npm link` and record what the
    agent does;
  - **hook degradation is too graceful** (ai-engineer) — "never fail the turn, one line
    in `hooks.log`" is right for the turn and wrong for a memory product: when the
    plugin's wrapper cannot find `mirror-hook`, the agent keeps answering and memory
    silently stops, and nobody reads `hooks.log`. Proposed for §D/§E: `runtime diagnose`
    reads the tail of `hooks.log` and reports failures since a date; asserted by the
    plugin smoke in package mode;
  - **D4 names no user** (product-designer) — retiring the Frame and installer is argued
    from premise, never from how many people installed the Inno Setup artifact. Record
    the number in D4. If zero, drop "a new story with its own Windows CI" as a promise
    with no demand; if not zero, the cutoff strands real people on a Python core and the
    release note must address them;
  - **"one documented step per runtime" is proven for Pi and untested for the rest**
    (product-designer) — §D's Gemini and Codex step is a settings edit *and* a directory
    link, with a path computed from `npm root -g`. Count the steps honestly at plateau 3;
    if any runtime exceeds one, `mirror init` prints that runtime's wiring step rather
    than sending the person to a page. The `runtime install <runtime>` non-goal stands —
    printing is not automating;
  - **the first seconds are a usage dump** (experience-designer) — `mirror` with no
    arguments and no configured user should print three lines (no user yet, run
    `mirror init <user>`, where the config will live), and after `init` the welcome card
    the product already has; the README's first line names both `mirror-mind` (install)
    and `mirror` (run) once, so the two names read as intended rather than as drift.
    Calibration, not layout.

  Actionable read, as given before approval: **add** the operating-instructions delivery
  (first finding, D13) to §B/§D and route 2; **amend** §C with the `mirror`-resolves check
  and §D/§E with the diagnose surface and D4's user count; the last two were
  calibration the Navigator could decline. He accepted all six.
- **Handoff review, after plateau 6 validation:** same panel as the first pass.

## Approval Gate

- **Approved by the Navigator on 2026-10-05**, with D1–D13 as recorded, after the second
  panel pass's six findings were folded in.
- Implementation begins at plateau 0 (§A).
