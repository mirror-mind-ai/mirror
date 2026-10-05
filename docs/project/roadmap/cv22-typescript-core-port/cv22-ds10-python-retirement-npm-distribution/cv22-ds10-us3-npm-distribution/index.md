[< Parent](../index.md)

# CV22.DS10.US3 — npm distribution

**Status:** 🟡 Plan approved — pulled 2026-09-30, [Plan](plan.md) drafted and
panel-reviewed the same day; a second panel pass on 2026-10-05 (prompt-engineer,
ai-engineer, product-designer, experience-designer) found six things, the sharpest that
the operating instructions did not ship in the tarball; all six folded, and the Plan
**approved by the Navigator on 2026-10-05 with D1–D13**; D14 and D15 taken during plateau 1.
Plateaus 0 and 1 done the same day.
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
- **Plateau 2 — skills and Pi (implemented 2026-10-05, `86d9014b`, `fb22e2fa`; awaiting the
  Navigator's first walk).** All 399 invocation lines (135 / 132 / 132) say `mirror`, rewritten by
  a script with asserted counts and reviewed as a diff; the plugin regenerated; the parity guard
  forbids `cli.ts`, `NODE_OPTIONS`, and `--env-file` in every skill copy (D7); `AGENTS.md`'s one
  prose invocation followed. The extension spawns `bin/mirror.js` from its own file (D6, D15),
  resolves the mirror home in the core's order (tree `.env`, then the user's config file, never
  the cwd's), says once at session start when `mirror` is not on the `PATH` (naming `npm link`
  or the global bin), appends `AGENTS.md` to the system prompt's context files when Pi did not
  load it from the cwd (D13), and registers once per process. The dev guide names `npm link`.
  The test guide's routes 1 and 2 were rewritten to what the tree does: route 2b must `env -u`
  the two variables rather than blank them, since an empty variable blocks the config file.
  Deferred: `init`'s wiring-step print (plateau 3). **Waiting on:** route 1, 1b, and 2 — the
  D13 prompt and the double-load observation are the walk's.

## Where To Resume

Read the [plan](plan.md) and its Review section; D1–D13 are approved as recorded there.
The first plateau is §A: two renames and one capture.
