[< CV21](../index.md)

# CV21.DS11 — Contract & Docs Refresh

**Status:** 🟡 Planned
**Type:** Delivery Story
**Renamed from:** CV21.E11, in the CV21 Ariad taxonomy migration (2026-10-13). The
[code map](../index.md#code-map) resolves the old code.
**User-visible outcome:** A user who reads README, Getting Started, REFERENCE, the
architecture, or the runtime interface contract finds the same five runtimes with the
same honest parity, each row carrying the version, binary, and date it was measured
on. The two things CV21 left as "documented in DS11" are written: the status line as
a step the user does, and Claude Code reading a project's `AGENTS.md` on its own.

---

## What This Is

CV21's per-runtime Delivery Stories each wrote their own runtime's part of the docs and
left the cross-runtime view to this one. The pieces this story collects, and where each
was measured:

- The parity matrix. The
  [DS12 decision](../../../decisions.md#cv21-converges-on-the-canonical-plugin-with-a-native-layer-for-antigravity-and-shared-hooks-that-know-their-runtime)
  holds the one matrix there is, a snapshot of 2026-10-13 (Claude Code 2.1.296, Codex
  0.162.1, agy 1.3.4, Grok 1.0.52) with two rows at "L4 reachable". Since then:
  Codex at **L4** on 0.163.0 ([DS4.US4](../cv21-ds4-codex-through-the-canonical-plugin/index.md),
  2026-10-17); Antigravity at **L4** on agy 1.4.2
  ([DS7.US4](../cv21-ds7-antigravity-through-skills-and-a-native-layer/index.md),
  2026-10-18); Grok Build at **L3** on 1.0.62
  ([DS10.US3](../cv21-ds10-grok-build-through-the-canonical-plugin/index.md),
  2026-10-18). DS4, DS5, and DS10 each say "DS11 folds the matrix". The
  [architecture](../../../../product/architecture.md#6-runtime-model) still counts four
  harnesses and has no Grok row; the
  [contract](../../../../product/specs/runtime-interface/index.md) has a reference
  implementation per runtime but no matrix; README and Getting Started name five
  runtimes in prose.
- The status line. [DS2.US3](../cv21-ds2-mirror-plugin-mcp-foundation/index.md) was
  dropped on 2026-10-13: a plugin cannot carry a status line on Claude Code 2.1.296
  (DS12.TS1 static 3 and L7). The contract's
  [status line section](../../../../product/specs/runtime-interface/index.md#optional-runtime-status-line)
  describes Pi's and says other runtimes may ignore it. Whether a user's own Claude
  Code settings can run `mirror welcome --status-line` has not been measured.
- Claude Code reads a project's `AGENTS.md` natively
  ([DS12.TS1 L8](../cv21-ds12-runtime-re-baseline/cv21-ds12-ts1-claude-code-re-probe/index.md),
  2.1.296, 2026-10-13): the transcript showed "Contents of …/AGENTS.md (project
  instructions…)" and the model told it apart from the hook's copy. No doc says what
  that means for a checkout, whose `CLAUDE.md` imports `AGENTS.md`, or for a user's
  project that has an `AGENTS.md` of its own.
- One carried code item. [DS5.US2](../cv21-ds5-user-extensions-on-every-runtime/cv21-ds5-us2-a-home-s-installed-extensions-reach-every-runtime/index.md)'s
  Debt Review deferred the canonical plugin's agy copy finding to DS11: `runtime
  diagnose` knows a stale extensions plugin on agy through `agyPluginCopyState`, but
  not a stale canonical plugin. Its revisit trigger names this story.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV21.DS11.TS1 | The parity matrix is written once, with version, binary, and date | Technical Story | The contract holds the one parity matrix: for each of the five runtimes its skills, instructions at start, per-turn injection, logging, MCP, and honest level, with the version, binary, and date the per-runtime story measured it on, Pi included. README, Getting Started, REFERENCE, and the architecture carry the matrix or point to it; the architecture's Runtime Model counts five harnesses and gains Grok's row. A decision record makes the matrix the single authority for parity, beside the DS12 snapshot. A guard test fails when a doc drops a runtime or the architecture's levels leave the matrix's | 🟡 Planned |
| CV21.DS11.US2 | The status line is a step the user does on Claude Code | User Story | A Claude Code user who wants Mirror's status line wires `mirror welcome --status-line` in their own settings, in a step Getting Started prints. Measured on the installed Claude Code: the line shows, or the reason it cannot is written where the step would be. The contract's status line section names the step | 🟡 Planned |
| CV21.DS11.TS3 | Claude Code reading a project `AGENTS.md` is written where a user reads it | Technical Story | The contract's Claude Code reference implementation and Getting Started say that Claude Code loads a project's `AGENTS.md` on its own (DS12.TS1 L8), what that means inside a checkout beside `CLAUDE.md`'s import and the hook's copy, and what it means in a user's project with its own `AGENTS.md`. Re-checked on the installed Claude Code | 🟡 Planned |
| CV21.DS11.TS4 | `runtime diagnose` knows the canonical plugin's agy copy | Technical Story | Carried from DS5.US2. A canonical plugin copy agy staged behind an npm update is reported by `runtime diagnose` with its reinstall command, as the extensions plugin's copy already is; absence is not drift. The contract's wiring table and REFERENCE's diagnose findings name it | 🟡 Planned |

## Non-goals

- No new runtime, and no change to any runtime's parity. DS11 writes what DS2, DS4,
  DS5, DS7, DS8, and DS10 measured; a row that cannot be sourced to a measurement is not
  written.
- No re-measurement of every runtime. Versions and dates are the ones the per-runtime
  stories recorded. US2 and TS3 measure only the two Claude Code facts they document.
- No status line on Codex, Antigravity, or Grok Build. US2 is Claude Code's user step;
  a runtime with no status API stays "may ignore".
- No change to hook behavior, the plugin, or the MCP server.

## Done Condition

DS11 is done when:

- the contract holds the parity matrix, every row sourced to a per-runtime story with
  version, binary, and date, and README, Getting Started, REFERENCE, and the
  architecture agree with it, held by a guard test in `npm test`;
- the status line is a documented user step on Claude Code, measured;
- Claude Code reading a project `AGENTS.md` is documented in the contract and Getting
  Started, re-checked;
- `runtime diagnose` reports the canonical plugin's agy copy, and DS5.US2's deferred
  debt is closed;
- CV21's index row for DS11 is Done.
