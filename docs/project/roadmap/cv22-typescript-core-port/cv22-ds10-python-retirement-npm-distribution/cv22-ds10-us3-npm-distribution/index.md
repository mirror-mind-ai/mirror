[< Parent](../index.md)

# CV22.DS10.US3 — npm distribution

**Status:** 🟡 Plan approved — pulled 2026-09-30, [Plan](plan.md) drafted and
panel-reviewed the same day; a second panel pass on 2026-10-05 (prompt-engineer,
ai-engineer, product-designer, experience-designer) found six things, the sharpest that
the operating instructions did not ship in the tarball; all six folded, and the Plan
**approved by the Navigator on 2026-10-05 with D1–D13**; D14 and D15 taken during plateau 1.
Plateaus 0 and 1 done the same day; plateau 2 validated 2026-10-06; plateau 3 implemented
2026-10-06 and validated by the Navigator 2026-10-09.
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

## Where To Resume

Read the [plan](plan.md) (D1–D15 approved and recorded) and the *Plateau Progress* above.
- **Plateaus 0, 1, 2, and 3 are done and validated.** Plateau 3 was validated by the
  Navigator on 2026-10-09.
- **The Ariad cursor** is at `implement` for CV22.DS10.US3 under the approved Plan.

**Next: plateau 4 (§E):**
- D-026 paid (one updater pipeline body, two apply strategies);
- `mirror runtime channel [stable|main]` per install kind (D9);
- the install kind in `runtime status`/`version`;
- the clone post-update `npm link` line;
- the newer-database refusal naming `mirror runtime update` (item 12);
- `release:promote`'s dry-run publish steps;
- `smoke_runtime_update.sh` extended.

**Open for the Navigator:**
- F1 (the empty `ego/constraints` template makes a fresh `seed` exit 1);
- F4 (two shipped skills address the author);
- CR121's release relevance;
- the two plateau-3 options (a Gemini extension; Codex hooks).

**Working state:**
- `npm link` is in place: `mirror` and `mirror-hook` point at this checkout. Two
  `hookBin` tests skip while a global `mirror`/`mirror-hook` exists in a candidate
  directory, by design.
- The plateau-0 capture lives in `tmp/us3/before.tsv` (gitignored) for plateau 6's replay.
- Plateau 6 also owns the Claude Code skill naming (`/mirror-mind:mm:<skill>` for a plugin
  install).
