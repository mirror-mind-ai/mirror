[< CV21](../index.md)

# CV21.DS8 — Gemini CLI Sunset

**Status:** 🟢 In Progress — US1 done 2026-10-18
**Type:** Delivery Story
**User-visible outcome:** Mirror no longer ships a Gemini CLI integration. The
package carries no `.gemini/hooks`, `mirror init` prints no Gemini steps, every
runtime-facing doc names four runtimes — Pi, Claude Code, Codex, Antigravity —
and a release note tells a Gemini CLI user what is gone, what to install
instead, and what they will see if they do nothing.

---

## Outcome

The Navigator retired Gemini CLI on 2026-09-25 and recorded it on 2026-10-13
([decision](../../../decisions.md#gemini-cli-is-retired-and-antigravity-is-its-successor)),
but v0.32.1 still ships it as one of four supported runtimes: four
`.gemini/hooks` wrappers and the `gemini` hook family behind them, two setup
steps printed by `mirror init`, a Gemini smoke, and the runtime named as
supported in the README, Getting Started, REFERENCE, the runtime-interface
spec, the Operating Instructions, and the package's own description and
keywords. A retirement that lives in a decision while the release advertises
the runtime has not happened. DS8 makes it happen, behind a cutoff a user can
read.

The cutoff answers the three questions
[the CV22 cutoffs](../../../../releases/pending-cutoffs.md) answered: **what
no longer exists**, **what to do instead**, and **what still works if they do
nothing**. The third needs care here. `mirror init` told Gemini users to write
absolute paths into the package into `~/.gemini/settings.json`; after the
update those four `mirror-*` hooks point at files that no longer exist, and
Gemini CLI will report them. The note names the entries to remove, and the
`~/.gemini/skills/` links `gemini skills link` created.

## The Gate (DS7.US4, measured 2026-10-18)

The removal waited for Antigravity to meet the bar DS12.TS3 set — the five
things a Gemini CLI user had: all of Mirror's skills, the Operating
Instructions at session start, Mirror Mode context once per user turn, user
and assistant messages logged and the conversation closed, setup in no more
documented steps than Gemini CLI's two.
[CV21.DS7.US4](../cv21-ds7-antigravity-through-skills-and-a-native-layer/cv21-ds7-us4-antigravity-at-the-bar-measured-live/index.md)
measured all five PASS on agy 1.4.2, one-step install, MCP reachable (7
tools). The decision's honest cost — losing per-turn injection — did not
materialize: agy's `PreInvocation` hook carries it. **The gate is met.** A
Gemini CLI user who moves loses nothing and gains MCP.

## What Goes, What Stays

Goes (the integration):

- `.gemini/hooks/*.sh` (four wrappers), their rows in
  `scripts/generate_hook_wrappers.sh`, and the checkout's `.gemini/settings.json`;
- `ts/src/hooks/gemini.ts` and the `gemini` family in `ts/src/hooks/main.ts`,
  with its tests and the Gemini rows in `ts/test/frontDoor/hookPayloadRedaction`;
- the `gemini` entry in `ts/src/runtime/wiring.ts` (`RuntimeName`, the two
  `init` steps, `geminiHooksSettings`), with its tests (`wiring`, `initCli`);
- `.gemini/hooks` in `package.json` `files`, the `gemini-cli` keyword, and the
  runtime in the description; the `.gemini/hooks/` rows in
  `ts/src/guards/packContents.ts`;
- `scripts/smoke_gemini_cli.sh`, and section 9 of `scripts/smoke_npm_package.sh`;
- Gemini CLI as a runtime in every runtime-facing doc: README, Getting Started,
  REFERENCE, `docs/index.md`, AGENTS.md (root, plugin `rules/`, and the Claude
  copy through CLAUDE.md), the runtime-interface spec and its parity table, the
  welcome spec, architecture, troubleshooting, configuration, the development
  guide, and the skills that name it (`mm-help`, `mm-build`, `mm-explore`,
  `mm-soul`, and their plugin copies).

Stays (not the integration):

- Gemini *models*: extraction on `google/gemini-2.5-flash-lite` through
  OpenRouter, `consult`'s `gemini` family in `ts/src/consult/modelCatalog.ts`,
  the cost table, and the skills that name the model (`mm-consult`,
  `mm-consolidate`, `mm-shadow`, the `gemini` family row in `mm-help`);
- Antigravity's own home under `~/.gemini/` — `~/.gemini/config/plugins/`,
  the `.gemini-plugin/` marker `ts/src/guards/claudePlugin.ts` recognizes. The
  sunset touches nothing agy reads;
- conversations logged with `interface = 'gemini_cli'`, readable in every
  home through `mm-conversations` and `mm-recall`; the label stays valid as
  history and nothing migrates them;
- history: release notes, decisions, roadmap packages, refinement records,
  and the worklog keep saying what was true when they were written.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV21.DS8.US1](cv21-ds8-us1-gemini-cli-sunset/index.md) | The package and `mirror init` drop Gemini CLI | User Story | `npm pack` lists no `.gemini/` path; `mirror-hook gemini:*` is an unknown family; `mirror init` prints no Gemini steps with `gemini` on the PATH; the Gemini smoke and the npm smoke's Gemini section are gone; a retired-surface row keeps `.gemini/`, `hooks/gemini.ts`, and `smoke_gemini_cli` from returning (the doc-facing names join in US2). Gemini models, agy's `~/.gemini/` paths, and `gemini_cli` history untouched. Done 2026-10-18: 3306 tests, npm smoke 70/70, five observations accepted; the P1 redaction test now runs through the Claude family | ✅ Done |
| [CV21.DS8.US2](cv21-ds8-us2-every-runtime-facing-doc-names-four-runtimes/index.md) | Every runtime-facing doc names four runtimes, Antigravity as the successor | User Story | README, Getting Started, REFERENCE, AGENTS.md and its copies, the runtime-interface spec and parity table, the welcome spec, and the skills that named Gemini CLI describe Pi, Claude Code, Codex, and Antigravity; `rg -i "gemini cli"` outside history, models, and the cutoff finds nothing; the operating-instructions and skill-copy guards agree | 🟡 Planned |
| [CV21.DS8.US3](cv21-ds8-us3-the-cutoff-ships-in-its-own-release-note/index.md) | The cutoff ships in its own release note | User Story | A cutoff record in the CV22 shape — removed, why, what to do instead (`agy plugin install`, one step), what still works (Gemini models, logged conversations), and what a user who does nothing sees (four unresolved `mirror-*` hooks in `~/.gemini/settings.json`, the `~/.gemini/skills/` links) with the exact entries to delete; the release note carries it; the release is cut | 🟡 Planned |

## Non-Goals

- Antigravity itself: DS7 built and measured it; DS8 only points at it.
- Migrating `gemini_cli` conversations to another label, or hiding them.
- Deleting a user's `~/.gemini/settings.json` entries or `~/.gemini/skills/`
  links for them: Mirror never wrote those files, and will not edit them now.
  The note says what to remove.
- Gemini models anywhere: extraction, `consult`, cost.
- Rewriting history: no release note, decision, or closed story is edited to
  say Gemini CLI was never supported.
- Grok Build (DS9/DS10): a different runtime, its own stories.

## Done Condition

The package built from `main` carries no Gemini CLI integration and `mirror
init` prints none; the runtime-facing docs name four runtimes with Antigravity
as the successor; the cutoff is recorded in the CV22 shape, with the
do-nothing outcome and the entries to remove named, and shipped in a release
with its own note; `gemini_cli` history, Gemini models, and agy's `~/.gemini/`
paths are untouched; and a retired-surface guard keeps the removal removed.
