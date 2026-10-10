[< Parent](../index.md)

# CV22.DS10.US3 — npm distribution

**Status:** 🟡 Plan approved — pulled 2026-09-30, [Plan](plan.md) drafted and
panel-reviewed the same day; a second panel pass on 2026-10-05 (prompt-engineer,
ai-engineer, product-designer, experience-designer) found six things, the sharpest that
the operating instructions did not ship in the tarball; all six folded, and the Plan
**approved by the Navigator on 2026-10-05 with D1–D13**; D14 and D15 taken during plateau 1.
Plateaus 0 and 1 done the same day; plateau 2 validated 2026-10-06; plateau 3 implemented
2026-10-06 and validated by the Navigator 2026-10-09; plateau 4 implemented and validated
2026-10-09, after a persona-panel review of its plan whose three findings it took; plateau 5
implemented 2026-10-09 (the Windows Frame and installer retired, the artifact half of the
Zero Python gate in CI).
**Type:** User Story
**Depends on:** every other DS10 story (done); the release gate (done 2026-09-28).

---

## User Story

As a person who wants Mirror Mind on a machine,
I want to install it with `npm install -g mirror-mind` and wire my runtime to it in one
documented step,
So that I never clone a repository, never see a Python-era instruction, and every runtime
I use finds the same core.

## Outcome

`mirror` is on the `PATH` from an npm install with no checkout. `mirror init` and
`mirror seed` work from an empty machine; configuration lives in one file the core reads
itself. Pi, Claude Code, Gemini CLI, and Codex each resolve from the installed package by
one documented step, and the plugin's hooks work wherever Claude Code copies them. The
updater's package lane is complete. The Windows Frame and installer have a decided
disposition. The shipped artifact holds no Python, checked by a guard, not by reading. The
thirteen items TS5 left this story are each closed or recorded. Publication, dist-tags,
tag, stable promotion, and the release remain separate Navigator gates.

## Acceptance Behavior

The full set is in the [plan](plan.md#acceptance-behavior). The shortest version:

```text
Given a machine with Node 24+ and npm, and no Mirror checkout
When  the user installs the packed tarball globally and runs `mirror init`, `mirror seed`,
      and `pi install "$(npm root -g)/mirror-mind"`
Then  `mirror` answers from the PATH, the config file is owner-only, twelve personas are
      seeded, `runtime status` names the install kind `package`, and Pi opened in any
      directory answers /mm-mirror from the installed package
And   no python, python3, or uv process was spawned
And   inside the checkout with `npm link` run once, every daily skill answers through
      `mirror` from that tree and the per-family capture matches the plateau-0 one
```

## Scope

Seven plateaus, in the [plan](plan.md#plateaus): baseline and names; the package; skills
and Pi; hooks, plugin, MCP, Gemini, Codex; updater and release tooling; the Frame, the
installer, and the artifact claim; docs, records, replay, and review.

## Out Of Scope

`npm publish`, dist-tags, GitHub Release, tag, stable promotion, version bump; Windows
support for the core; a Windows product over the npm package; Mirror Desktop; editing the
`automation` or `extensions/*` repositories; a `runtime install <runtime>` command; a
Claude marketplace; any change to what a skill does. Each is stated with its reason in
the [plan](plan.md#non-goals).

## Validation

Four Navigator routes in the [test guide](test-guide.md): the checkout after `npm link`;
the install outside any checkout (scratch prefix, home, config, and Pi sessions); the
plugin copied out of the tree; the capture replay through `mirror`. E2E is required.

## What US3 Inherits

Twelve items CV22.DS10.TS5 left for this story on purpose, and one CR008 added, each
with where it is recorded: [inherited.md](inherited.md). Their dispositions in this plan:

| # | Item | Disposition |
|---|---|---|
| 1 | The docs' bridge to `mirror` | Deleted at plateau 6 |
| 2 | The program's name | **No edit**: the bin is `mirror`, `PROGRAM` stays, the nine goldens are untouched (D1) |
| 3 | The package's identity | `PACKAGE_NAME = "mirror-mind"`, `private` dropped, plateau 1 |
| 4 | Frame and installer | Retired with a cutoff (D4, recommended) or re-homed; plateau 5 |
| 5 | The installed-plugin hook window | Closed by the bin-resolving wrapper form and `mirror-hook`, plateau 3 |
| 6 | Where configuration lives | `~/.config/mirror/env`, read by the core; no `--env-file` anywhere (D3), plateau 1 |
| 7 | F20's closing check | A release-gate item with the production clone's last hop (D12) |
| 8 | CR093's other half | This repository's half at plateau 6; the `automation` substitution recorded as a handoff |
| 9 | D-026 and D-027 | Paid at plateau 4 (D9) |
| 10 | `scripts/ts5/` | Permanent names at plateau 0 |
| 11 | Promotion by rename on Windows | Recorded, not fixed (D10) |
| 12 | The newer-database remedy | The refusal names `mirror runtime update`; the troubleshooting page adds the package route; plateau 4 and 6 |
| 13 | The capture straddling CR008 | The "before" capture is taken after CR008; no expected difference |

## Decisions This Story Asks The Navigator To Take

Thirteen, listed with alternatives in the [plan](plan.md#decisions-this-plan-asks-the-navigator-to-take):
package name and bin (D1); the repository as the package (D2); configuration order (D3);
the Frame and installer (D4); two bins and two wrapper forms (D5); Pi wiring by local path
(D6); every skill copy says `mirror` (D7); release notes ship in the package (D8);
`runtime channel` (D9); item 11 recorded (D10); the briefing rewritten here (D11); the
Python-era updater's last hop as a release-gate item (D12); the Operating Instructions
ship and each runtime is told how to load them (D13, added by the 2026-10-05 panel pass).
All thirteen approved 2026-10-05. Two more taken during plateau 1: `init` creates the modern
home (D14); the `mirror` bin is a type-stripping loader shim (D15).

## Plateau Progress

- **Plateau 0 — baseline and names (done 2026-10-05).** No behavior change. The two
  TS5 instruments took their permanent names: `scripts/generate_hook_wrappers.sh` and
  `scripts/capture_family_outputs.sh` (`git mv`; `scripts/ts5/` is gone, item 10). Each
  script's root walk shortened by one level; the fourteen wrappers regenerated, header
  line only, and the generator's `--check` is in sync; the three referrers followed
  (`hooks.test.ts`, the two `retiredSurfaces.ts` exemptions, the runtime-interface
  spec). The capture's scratch moved to `tmp/capture-work`. The **"before" capture**
  was taken on a `.backup` copy of the real database at commit `79d7bb3d`, after CR008
  (item 13): 29 families, every one self-consistent under `--selftest`, saved as
  `tmp/us3/before.tsv` beside `before.commit` and `pristine.db` — never committed.
  Plateau 6 replays it through `mirror` and expects an empty diff. Verified: typecheck,
  lint, the 2952-test suite, the four repository checks, the four runtime smokes.
  Next: plateau 1 (§B), the package.
- **Plateau 1 — the package (done 2026-10-05, six commits `ef282869`..`65aaa776`).** The
  manifest is at the root, `mirror-mind`, public, with a `files` whitelist; `npm pack` yields
  462 files with the same paths as a checkout (D2). `PACKAGE_NAME` is the one constant TS5
  predicted; `installKind` resolves symlinks so an `npm link`ed clone is a clone. One
  `runtime/config.ts` reads `.env` from the entry's tree and `~/.config/mirror/env`, never
  overriding, and silences the sqlite warning in-process (D3); `init` writes `MIRROR_USER`
  0600/0700 and `diagnose` grades the file's mode. One `runtime/treeRoot.ts` serves
  templates, release notes, the welcome title — and the version, a fourth cwd reader the Plan
  had not named, pulled forward because route 2 would have shown `unknown`. The pack guard
  (`checkPackContents.ts`) is in CI. `AGENTS.md` is a real file holding the Operating
  Instructions alone and ships; `CLAUDE.md` imports it (D13). Bare `mirror` orients.
  **Two findings, both from the install-from-nothing smoke's first run.** (1) Node refuses to
  strip types under `node_modules`, so "ship `.ts`" did not survive `npm install -g`;
  **D15**: the bin is `bin/mirror.js`, a loader shim that strips types for its own package's
  files only. (2) **F1**: a fresh `seed` exits 1 everywhere because the shipped
  `ego/constraints` template is empty and seed calls that an error; pre-existing, named in
  the smoke, not fixed here. Also **D14**: `init` creates `~/.mirror-minds/<user>`, the path
  `MIRROR_USER` resolves to, instead of Python's legacy `~/.mirror/<user>`. Deferred to
  plateau 3: `init` printing each detected runtime's wiring step, which plateau 3 verifies.
  `scripts/smoke_npm_package.sh` (40 checks, in CI) proves init, seed, list, status, and a
  migrating open through the `mirror` bin from a scratch global install. Verified: typecheck,
  lint, 2980 tests, the repository checks, every smoke. Next: plateau 2 (§C), skills and Pi.
- **Plateau 2 — skills and Pi (implemented 2026-10-05, `86d9014b`, `fb22e2fa`; validated by the
  Navigator 2026-10-06).** All 399 invocation lines (135 / 132 / 132) say `mirror`, rewritten by
  a script with asserted counts and reviewed as a diff; the plugin regenerated; the parity guard
  forbids `cli.ts`, `NODE_OPTIONS`, and `--env-file` in every skill copy (D7); `AGENTS.md`'s one
  prose invocation followed. The extension spawns `bin/mirror.js` from its own file (D6, D15),
  resolves the mirror home in the core's order (tree `.env`, then the user's config file, never
  the cwd's), says once at session start when `mirror` is not on the `PATH` (naming `npm link`
  or the global bin), appends `AGENTS.md` to the system prompt's context files when Pi did not
  load it from the cwd (D13), and registers once per process. The dev guide names `npm link`.
  The test guide's routes 1 and 2 were rewritten to what the tree does: route 2b must `env -u`
  the two variables rather than blank them, since an empty variable blocks the config file.
  Deferred: `init`'s wiring-step print (plateau 3). **The Navigator's first walk, 2026-10-06
  (routes 1, 1b, 2a, 2b):** route 1 passed; **1b** — the session-start notice rendered, the agent
  met `command not found` on `/mm-journeys`, read `package.json`, found `bin/mirror.js`, and ran
  `node bin/mirror.js journeys`: it improvised, onto the sanctioned entry (D15), never the
  forbidden checkout form; **2a** passed line for line (orientation, `init`, F1, twelve personas,
  0600/0700, `MIRROR_USER=route2`); **2b** first failed — `pi install <path>` needs the manifest's
  `pi` key, which this plateau had deferred; added (`22798551`), verified with `pi -e` from `/tmp`,
  and the walk resumed: the status line rendered, `/mm-journeys` ran `mirror journeys`, the D13
  prompt answered under **`◇ financial`** (the Operating Instructions reached a session opened
  in `/tmp` from the installed package), the logger recorded `operating instructions appended`
  once per prompt and **no** `second registration skipped` (Pi loads the package extension
  once; the guard stays as insurance), and no `not on the PATH` line. The walk also found route
  2b's own flaw: with the real `HOME`, `MIRROR_USER` alone resolves into the real homes root, so
  the route pins `MIRROR_HOME` in the scratch config file. The real-homes diff showed only
  `~/.mirror-minds/vinicius` touched at 12:08 and 12:21 — a second Pi session the Navigator had
  open on that user, logging its own turns; the scratch session wrote to `route2` alone.
  The second D13 proof followed: `/mm-build personal-growth` from `/private/tmp` rendered the
  `■ BUILDER MODE ACTIVE` surface, named the absent project path, and **stopped at "What do you
  want to work on?"** — the Activation Boundary holding in a session whose only source of that
  rule is the appended `AGENTS.md`. **Plateau 2 validated by the Navigator, 2026-10-06.**

- **Plateau 3 — hooks, plugin, MCP, Gemini, Codex (implemented 2026-10-06; route 3a run by
  machine, routes 3b–3d await the Navigator).** The TS5 hook window is closed. **The second bin,
  `mirror-hook`** (D5), runs on the loader shim `mirror` already had, now one shared `bin/loader.js`
  (D15: neither bin carries the shim; `hooks.test.ts` forbids a second copy); `hooks/main.ts` gained
  `runAsEntry()`, reading configuration and silencing warnings itself (D3), so **no wrapper passes
  a flag any more** and the entry is importable without dispatching. **Two wrapper forms from one
  generator**: the ten in-tree wrappers keep `$BASH_SOURCE` resolution and run their tree's
  `bin/mirror-hook.js`; the plugin's four find the installed `mirror-hook` — `MIRROR_BIN` (a
  directory, the one holding both bins, chosen over a per-executable variable so one setting
  covers the four wrappers and the launcher), then the `PATH`, then the three global bin dirs —
  and read no tree `.env`; `note()` resolves the home in the core's order, the user's config file
  last. The forms share every other byte, asserted. **A finding the plan did not foresee:** the
  in-tree wrappers ship in the tarball under `node_modules`, where Node refuses to strip types, so
  the tree form had to run the bin too, not `ts/src/hooks/main.ts` — D15's reach. The generator
  turns `patsub_replacement` off: bash 5.2 would have rewritten the fragments' `&&`. **The
  launcher** finds `mirror` the same way and `exec`s `mirror mcp`; a server that cannot start
  says why on stderr and exits 1 (no turn to protect). One pre-existing launcher test encoded the
  retired behaviour (reading a `.env` beside the plugin) and now asserts its absence. **D13 for
  Claude Code and Gemini CLI needs no step**: both runtimes read SessionStart's
  `hookSpecificOutput.additionalContext` (verified in Claude Code's binary and Gemini's bundled
  docs), so the session-start hook hands over `AGENTS.md` from its own tree unless the project it
  opened in *is* that tree — the checkout, whose CLAUDE.md imports the file. One rule, both
  runtimes, keyed on the project directory alone; the checkout's output is unchanged (Claude
  nothing, Gemini `{}`). **The per-runtime wiring, verified against each runtime itself from a
  scratch config dir, counted honestly: Pi 1, Claude Code 1, Gemini CLI 2, Codex 2.** Claude Code
  2.1.283 loads a plugin directory under `~/.claude/skills/` every session as
  `mirror-mind@skills-dir` — 25 skills, 3 hooks, the MCP server (`claude plugin details`). Gemini
  0.61.0: `gemini skills link --consent <dir>` links all 25 (a nested directory symlink is NOT
  discovered); hooks go in `~/.gemini/settings.json`. Codex 0.157.0: `~/.codex/skills/<dir>` is
  discovered recursively and `~/.codex/AGENTS.md` is the global instructions file, both proven
  with `codex debug prompt-input` (no model call). `mirror init` now ends with those steps for the
  runtimes on the `PATH` (`#runtime/wiring.ts`), paths filled in — printing, not automating.
  **`runtime diagnose`'s hooks check already existed** (`hook_failures_recorded`, TS5 handoff
  N1); the plateau asserts it rather than building a second: `smoke_claude_plugin.sh` now runs
  the plugin copied out of the tree with `mirror-hook` on a scratch `PATH`, the launcher, and
  then the removal case — turn not failed, one `hooks.log` line, diagnose reports it without the
  prompt. `smoke_npm_package.sh` (64 checks) runs the four runtimes against the real
  `npm install -g`: the plugin from a cache copy, the Gemini and Codex wrappers from under
  `npm root -g`, `mirror mcp` through the launcher and directly, D13 delivered, no `hooks.log`.
  The Pi extension's `mirror`-resolves check **stays PATH-only** on purpose: skills run from Pi's
  shell, so a `mirror` that exists in `/opt/homebrew/bin` but is off that `PATH` *will* fail, and
  the plan's "same short list" would have made the check lie. **Two options recorded for the
  Navigator, not built:** (a) a Gemini *extension* (`gemini-extension.json` + `hooks/hooks.json` +
  `skills/` + `contextFileName`) would make Gemini one step like Claude's plugin — a new shipped
  artifact, parallel to `plugins/mirror-mind`, outside this plan; (b) Codex 0.157 has hooks
  (`hooks.json`, SessionStart/UserPromptSubmit), which could replace the wrapper script — a new
  integration, a later story. Docs: the runtime-interface spec (two forms, `MIRROR_BIN`, an
  "Installed package wiring" table), REFERENCE (`MIRROR_NODE`, `MIRROR_BIN`, the launcher),
  getting-started (a pointer; the rewrite is plateau 6), the test guide (route 3a–3d). Verified:
  typecheck, lint (one pre-existing warning in `update.ts`), 3005 tests, the five repository
  checks, the generator in sync under bash 3.2 and 5, the custody proofs, all six smokes.
  Next: the Navigator's route 3b–3d, then plateau 4 (§E).

- **Route 3 as a script (2026-10-08).** The Navigator's route became [`route3.sh`](route3.sh), one
  command per step with its own ✓ / ✗ (collaboration strategy: a route is a script run with
  `bash`, proven by running it the way the Navigator will). The Builder ran steps 1–3 (12/12,
  12/12, 7/7) and proved step 5's logic on a simulated session; step 4 is a real Claude Code
  session and the Navigator's. Writing it corrected one unverified line in what `init` prints
  ("skills under /mm:" — how Claude Code names a plugin's skills is unconfirmed; step 4 asks the
  Navigator to note it). **Two findings, from simulating step 4's environment (real `HOME` for
  Claude's login, scratch Mirror home):**
  - **F2 → [CR120](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr120-a-failed-pi-session-import-aborts-the-rest-of-session-maintenance.md):
    one failed Pi session import aborts the rest of session maintenance.** The full
    `conversation-logger session-start` that the Claude and Gemini SessionStart hooks run, like
    Pi's background `session-maintenance`, backfills untracked Pi sessions and then retitles and
    extracts. The backfill catches only a parse error, so an insert that throws
    (`UNIQUE constraint failed: messages.id`) ends the loop and every step after it. The
    Navigator's real `vinicius-ts` `hooks.log` holds 9 such lines between 2026-09-24 and
    2026-10-05 (5 Claude Code, 4 Gemini CLI session starts); a successful start leaves no line,
    so the failure *rate* is unknown. *Corrected 2026-10-09:* the first version of this record
    said every session start in that period failed, which 9 lines cannot show, and guessed at
    reused ids. Each backfilled message draws a fresh random 32-bit id, so the collision is
    [CR097](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr097-new-ids-are-32-bits-because-the-oracle-s-were.md)'s mechanism; CR120
    is about its cost. Captured 2026-10-09 at the Navigator's direction.
  - **F3 → [CR121](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr121-a-new-home-s-first-maintenance-imports-the-whole-pi-history.md):
    a new home's first maintenance run imports the person's whole Pi history**, in Pi's
    background maintenance as much as in Claude Code's and Gemini CLI's SessionStart hooks.
    *Corrected 2026-10-09:* the first version said "the first non-Pi session start";
    [CR106](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr106-a-pi-session-in-a-scratch-mirror-home-copies-the-whole-pi-history-into-it.md)
    shows Pi's own maintenance does it. Reproduced: a fresh home received 430 Pi conversations
    (26,036 messages) before F2 stopped it; with a key, extraction would then spend on them.
    For a clone user that history is already tracked; for an npm user who used Pi before Mirror
    it is a silent first-run import. A product decision: keep it, ask first, or import only
    sessions newer than the home. CR106's behavior option would close both. Route 3 pins
    `PI_SESSIONS_DIR` to an empty directory. Captured 2026-10-09 at the Navigator's direction.
- **Plateau 3 validated by the Navigator, 2026-10-09** ([route 3](route3.sh), steps 1–5:
  12/12, 12/12, 7/7, the session, 7/7).
  - **Step 4, a real Claude Code session on the scratch install.**
    - A plain "list my journeys" loaded `mirror-mind:mm-journeys`, ran `mirror journeys`
      from the install, and showed only `personal-growth`.
    - The pricing question entered Mirror Mode unasked and answered under
      **`◇ financial`**. That signature format exists only in the Operating Instructions,
      which reached the session through the plugin's SessionStart hook (D13).
  - **Step 5.** The turns are in the scratch home; there is no `hooks.log`; the real homes
    hold nothing from the session. The session's own transcript carries the Operating
    Instructions, so Claude Code 2.1.283 records hook context there.
  - **How Claude Code names a plugin's skills** (step 4's question, read from the Navigator's
    screenshots):
    - the slash menu shows `/mirror-mind:mm:journeys`, `/mirror-mind:mm:mirror`, …: the
      plugin's name, then each skill's own `name`;
    - typing `/mm` lists them all;
    - the model's tool calls use `mirror-mind:mm-journeys`.

    `AGENTS.md`, getting-started, and REFERENCE say `/mm:<skill>` for Claude Code. That
    holds in the checkout, not for a plugin install: a plateau-6 docs item.
  - **The answer addressed the Navigator by name, yet the name did not come from Mirror.**
    The scratch identity names `route3`, and nothing the session loaded from the package names
    him: `AGENTS.md`, `mm-journeys`, `mm-mirror`, the skill descriptions, and the scratch
    identity.
  - **F4 — two shipped skills address the author.** `mm-consolidate` and `mm-shadow` carry
    three lines naming Vinícius, in the Pi source and the plugin copy alike:
    - "Present each proposal to Vinícius";
    - "the mirror has an across-conversation view that Vinícius doesn't";
    - "Present each observation to Vinícius".

    An npm user's agent would be told to present to someone else. **Fixed 2026-10-09 at the
    Navigator's direction**, pulled forward from plateau 5's artifact claim:
    - the three lines say "the user" in the Pi source, the Claude copy, and the regenerated
      plugin;
    - the pack guard grades content now as well as paths: any shipped file naming the author
      outside `LICENSE` and `README.md` fails CI (`FORBIDDEN_CONTENT`), and plateau 5 adds
      the Python invocation forms to the same list.

    Changing a skill's text is a plan non-goal; this is the Navigator's explicit exception,
    and it changes whom the text names, not what the skill does.
  - After the route the Navigator ran `npm link`; `mirror-hook` is now linked.

- **Plateau 4 — updater and release tooling (implemented 2026-10-09, twelve commits
  `895bef57`..`7adf8f1a`, CI green on both legs and the smoke job; route 3e for the
  Navigator).** Before the first
  test, the plateau's plan was reviewed by the baseline panel (quality-assurance drafting;
  engineer, devops-engineer, security-engineer, database-architect dissenting) and took
  three findings as additions inside §E: **a channel can lie behind the install** (the
  database-architect: migrations run one way, and `runtime channel stable` on a `main`
  install would have installed a lower version and then refused at the post-update status
  on a database the old code already owned — now refused at plan, before any backup, naming
  the channel that carries the installed version); **a dist-tag answer is an `npm install`
  spec** (the security-engineer: a tag, range, URL, or path there installs something other
  than a version — refused before it is printed or used, one strict regex, the same parse
  the direction check needs); and **install detection must not need npm where status is
  read** (the devops-engineer: GUI-launched runtimes and the package smoke keep npm off the
  PATH, so `Install:` would have read `unknown` on the one line a person uses to pick
  `npm install -g` over `git pull` — a package is known by its layout, `<prefix>/lib/
  node_modules/<name>` with `<prefix>/bin/<bin>` resolving into it; the update lane still
  asks `npm root -g` for npm's own word). The engineer shaped the refactor: the strategy
  owns its apply stage's name, ref label, and recovery; the lane is a list of steps chosen
  once. Done, in §E's order:
  - **D-026 paid.** `update.ts` is one body over two `ApplyStrategy` implementations, the
    seam declared beside the stage vocabulary; the repair lane is the ordinary lane minus the
    gate, the backup, and the migration, its gate the strategy's own and run before capture;
    the 15 US2 tests and the update smoke passed unchanged, and the repair lane gained the
    unit tests it never had.
  - **`--check` for a package** asks the registry the plan stage's question and renders its
    own report (`up_to_date`, `update_available`, `channel_behind`, `unresolved`); until now
    it ran `ls-remote` on the cwd for every install kind. One semver reader replaced three
    copies (release notes, the welcome card, now the strategy).
  - **D9, D-027 paid.** `runtime channel [stable|main]` shows or sets the channel in the
    install kind's own file; the config directory it may create is `0700` as `init`'s is;
    an unknown value is refused before a byte is written. One vocabulary for both kinds, in
    the pipeline module; `channelFor` is the one read.
  - **The install in `status` and `version`** (US2 D3), `Install:` and a package's `Install
    root:`; two frozen goldens hand-edited by script (27 + 11 renders, README row).
  - **The clone seam.** After a successful clone update, when `mirror` is off the PATH, one
    pasteable line names `npm link` at the repository root (the CR104 guard caught the path
    printed raw; it goes through `shellWord`). `commandOnPath` replaced three PATH walks.
  - **Item 12.** The newer-database refusal ends in `run: mirror runtime update`.
  - **`release:promote`** runs `npm publish --dry-run --tag stable` before the tag (the
    artifact proven before history moves; nothing reaches the registry) and prints the
    publication as its last step, never run under `--push` or without it; a promotion dry run
    runs no npm. Two execute-mode tests had been running the real npm for 1.6 s each.
  - **The smokes.** `smoke_runtime_update.sh` grades the `npm link` line both ways and runs
    the package lane end to end (86 checks); `smoke_npm_package.sh` asserts the install line
    (68 checks).
  **Three defects the package lane found, each fixed with a unit test first:** (1) **a
  package could never update** — `runtime status` graded the cwd as a git tree, read "not a
  git repository" as a git error, said `attention needed`, and the gate refused; a package
  reports no repository now, and neither the verdict nor the gate hold its absence against
  it; (2) **a package's update installed the new version and crashed at migrate** — the
  fresh-process migrate and validate spawned `cli.ts`, which Node will not type-strip under
  `node_modules` (D15's reach, again); the spawner runs `bin/mirror.js`; (3) **a symlinked
  prefix read as not under npm's root** — the front door's path was resolved and `npm root
  -g`'s answer was not (`/tmp` on macOS); both sides are resolved. **Left as found:**
  `smoke_claude_plugin.sh`'s "mirror-hook gone" case fails on this machine since the
  Navigator's `npm link` on 2026-10-09 (the wrapper's global-bin fallback finds the linked
  `mirror-hook`), at `d11f5698` as much as now; CI has no global link. A smoke that
  isolates the global bin directories is a small CR, not this plateau's. One pre-existing
  Biome warning (`launcher.test.ts`, an unused import) stands. For the release gate, from
  the security lens: the real `npm publish` should run with `--provenance` and a granular
  token; the printed plan names the command, not the credentials. **CI found two things
  the local run had not:** a test appended by heredoc had never met the formatter (the
  local check's last line was blank and was read as clean), and the Ubuntu runner sets
  `XDG_CONFIG_HOME` to its own `~/.config`, so the package lane's `runtime channel main`
  wrote the channel outside the scratch home; the lane unsets the variable (not blanks
  it), as the package smoke already did. Verified: typecheck, lint with no warnings, 3042
  tests, the five repository checks, the custody proofs, all six smokes (the plugin smoke
  as above), CI green (`37989064796`). **Plateau 4 validated by the Navigator, 2026-10-09**
  (route 3e, steps 1–7, under `bash` 3.2): the install line, the channel and its source,
  `beta` refused with exit 2, the clone's check unchanged, the promotion dry run stopping at
  the doctor (one failure, the absent `v0.31.14` note — the release gate's), the smoke at
  `passed: 86 failed: 0`, and nothing written to `~/.config/mirror/` or the tree. Next:
  plateau 5 (§F).

- **Plateau 5 — the Frame, the installer, and the artifact claim (implemented 2026-10-09).**
  D4's retirement path, as the number recorded that morning decided it (three downloads ever,
  none since August, nobody known to run it). In the plan's order:
  - **The deletion.** `frame/` (the Electron shell), `installer/` (the Inno Setup wizard and
    its PowerShell), `docs/installer/`, `.github/workflows/windows-installer.yml`, and one file
    the plan had not named, `scripts/ci-nonascii-profile-smoke.ps1` — the profile smoke only
    that workflow ran, invoked with the Frame's payload (59 files, `git rm`). They stay readable
    at `cv22-last-python-bearing` (`b0d34254`). `spikes/windows-frame-mockup/`, ES-004
    Experiment 1's static mockup, was first left in place as that exploration's evidence (its
    two files exempted, since they name installer scripts); **the Navigator chose to delete it
    with the Frame** the same day, and it joined the row's absent paths. He also cut the
    cutoff's line naming WSL as untested: a sentence shaped like a claim about something
    nobody has run does not belong in a release note.
  - **The `frame-installer` row** in the retired-surface guard: absence by path (the five
    above) and **by suffix** — no `.ps1`, `.psm1`, `.iss`, or `.cmd` anywhere in the tree, the
    claim a path list cannot make, as TS5's `.py` was; residue by file name (the workflow, the
    installer's scripts, the Frame's modules, the artifact's name), never by vocabulary, since
    "Windows" and "installer" are living words. The **eleven** `python-core-mentions`
    exemptions that said "until US3" expired with their files (the plan counted nine; the
    table held eleven, `docs/installer/`'s five among them), and the test that asserted them
    now asserts their absence. Residue the row found: the engineering-principles line that
    said the Windows installer rides its own workflow (now names the package smoke), the
    architecture listing's `frame/, installer/` row, two comments naming `frame/package.json`
    as a stray manifest, and a test walking `frame` and `installer` by name for session-naming
    residue (CR008 C) — the one caller a path grep for `frame/` could not see.
  - **The artifact half of the Zero Python gate.** `FORBIDDEN_CONTENT` in the pack guard
    gained the interpreter-invocation forms as a second rule, **imported from
    `INTERPRETER_INVOCATIONS`** so the tree half and the artifact half cannot drift. Measured
    before the rule was written: of 467 packed files, the forms appear only in `docs/releases/`
    (each version's record of what it said and what was removed, shown by `runtime
    release-notes` as written) and in the retired-surface guard itself (its patterns are the
    data). Both are allowed by name — `allowedIn` learned a trailing-slash prefix for the
    first — and every skill, template, hook, and the Operating Instructions are clean. The
    rule tripped twice while being written, on its own test: the retired-surface guard caught
    the seeded `uv run python` (now an exemption with the parity guard's reason) and, by
    accident, `memory web` and `memory eval` in the fixtures (reworded to a living command).
  - **The record.** The cutoff in `pending-cutoffs.md` (what was removed, why with D4's number,
    `npm install -g mirror-mind` on macOS and Linux, no Windows route, and two things an installed Frame's user must know: its `stable`
    fast-forward now lands on a tree with no engine for it, and the home it wrote at
    `.mirror\<user>` is an ordinary home the package can open — both read from the deleted
    installer, not assumed); the python-core cutoff's last paragraph points at it; REFERENCE's
    platform envelope rewritten (POSIX, no Windows product, what a Windows story would have to
    carry, none promised); the DS10 gate table's `frame/`/`installer/` row and its artifact
    verdict closed.

  Verified: typecheck, lint, 3046 tests (2 skipped by design, the global link), the five
  repository checks (retired surfaces with eleven rows, pack contents at 467 files, skill
  parity, doc links, wrappers in sync), `smoke_npm_package.sh` from a real `npm install -g`
  at `passed: 68 failed: 0` with no interpreter spawned; three commits
  `42f2277b`..`b05c84c5`, CI green on both legs and the smoke job (`37995518948`). Next:
  plateau 6 (§G).

## Where To Resume

Read the [plan](plan.md) (D1–D15 approved and recorded) and the *Plateau Progress* above.
- **Plateaus 0 through 4 are done and validated.** Plateau 3 was validated by the
  Navigator on 2026-10-09; plateau 4 the same day (route 3e). **Plateau 5 is implemented**
  (2026-10-09): it has no Navigator route of its own — its evidence is the two guards in CI
  and the package smoke, and the cutoff is a text for the Navigator to read.
- **The Ariad cursor** is at `implement` for CV22.DS10.US3 under the approved Plan.

**Next: plateau 6 (§G), docs, records, replay, review.** In the plan's order: the bridge
paragraphs out of `REFERENCE.md` and `docs/getting-started.md` (item 1) and out of the
compat-host and python-core cutoffs, which still print the checkout invocation; getting
started rewritten around `npm install -g` with "Upgrading from a clone"; REFERENCE's
running-a-command and configuration sections (the configuration section still says `.env` is
read by Node); architecture; the runtime-interface spec; the extension authoring guide
(CR093's half); troubleshooting; the Claude Code skill naming for a plugin install
(`/mirror-mind:mm:<skill>`); the `automation` handoff (item 8); the briefing's D2/D6/D8 and
Builder baseline (D11); the "after" capture through `mirror` diffed against
`tmp/us3/before.tsv`; the DS10 and CV22 indexes, the journey path, worklog, decisions (the
Frame's retirement deserves its own decision entry: plateau 5 wrote the cutoff and D4's
record, not the entry); `handoff.md`; the panel's handoff review; then Validation.

**Open for the Navigator:**
- F1 (the empty `ego/constraints` template makes a fresh `seed` exit 1);
- CR121's decision: keep, ask first, or only sessions newer than the home. A CV22
  release precondition since 2026-10-09, recorded with the release gate in
  [decisions](../../../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3);
- the two plateau-3 options (a Gemini extension; Codex hooks);
- a small CR, not yet captured: `smoke_claude_plugin.sh`'s "mirror-hook gone" case cannot
  fail-safe on a machine with a global `mirror-hook` (the wrapper's global-bin fallback
  finds it), so the smoke should isolate the global bin directories;
- for the release gate: the real `npm publish` runs with `--provenance` and a granular
  token (plateau 4's security finding).

**Working state:**
- `npm link` is in place: `mirror` and `mirror-hook` point at this checkout. Two
  `hookBin` tests skip while a global `mirror`/`mirror-hook` exists in a candidate
  directory, by design; and for the same reason `smoke_claude_plugin.sh` fails its last
  case **on this machine only** ("no hooks.log line after mirror-hook went missing"), as it
  did before plateau 4. CI has no global link and passes it. Do not read that local
  failure as plateau 5's.
- The plateau-0 capture lives in `tmp/us3/before.tsv` (gitignored) for plateau 6's replay.
- Plateau 6 also owns the Claude Code skill naming (`/mirror-mind:mm:<skill>` for a plugin
  install).
