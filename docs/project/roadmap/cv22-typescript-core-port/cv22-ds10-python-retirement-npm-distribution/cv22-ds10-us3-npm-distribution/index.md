[< Parent](../index.md)

# CV22.DS10.US3 — npm distribution

**Status:** 🟡 Plan approved — pulled 2026-09-30, [Plan](plan.md) drafted and
panel-reviewed the same day; a second panel pass on 2026-10-05 (prompt-engineer,
ai-engineer, product-designer, experience-designer) found six things, the sharpest that
the operating instructions did not ship in the tarball; all six folded, and the Plan
**approved by the Navigator on 2026-10-05 with D1–D13**. Implementation starts at plateau 0.
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
All thirteen approved 2026-10-05.

## Plateau Progress

_None yet. The Plan is approved; plateau 0 (§A) is next._

## Where To Resume

Read the [plan](plan.md) and its Review section; D1–D13 are approved as recorded there.
The first plateau is §A: two renames and one capture.
