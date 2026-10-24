# Delivery Story Plan — CV21.DS11

**Journey:** mirror
**Method:** ariad
**Navigator Flow Unit:** delivery_story

## Delivery Story

Contract & Docs Refresh

## Objective

Every doc a user reads names the same five runtimes with the same honest parity, each row carrying the version, binary, and date it was measured on; the status line is a documented user step on Claude Code; Claude Code reading a project AGENTS.md is documented; and runtime diagnose reports the canonical plugin's agy copy, closing DS5.US2's deferred debt

## Child Work Packages

- CV21.DS11.TS1
- CV21.DS11.US2
- CV21.DS11.TS3
- CV21.DS11.TS4

## Scope

DS11 collects what CV21's per-runtime stories left to it. Three of its four stories
are documentation; one (TS4) is the code item DS5.US2's Debt Review deferred here, and
TS1 adds one guard test. Installed today: Claude Code 2.1.310, Pi 1.4.0, package
0.36.3 (Codex 0.164.0, agy 1.4.7, grok 1.0.70 are on the machine and are not
re-measured, see Non-Goals). Revised after a five-lens review (researcher, AI engineer,
engineer, quality assurance, product designer) before approval.

**TS1 — The parity matrix is written once, with version, binary, and date.**

- The [runtime interface contract](../../../../product/specs/runtime-interface/index.md)
  gains one `## Parity Matrix` section, the single authority every other doc points to.
  One row per runtime — Pi, Claude Code, Codex, Antigravity, Grok Build — with the
  columns the [DS12 decision](../../../decisions.md#cv21-converges-on-the-canonical-plugin-with-a-native-layer-for-antigravity-and-shared-hooks-that-know-their-runtime)
  used (skills, instructions at start, per-turn injection, logging, MCP, level) plus
  version, binary, date, and the record that measured it.
- The rows are sourced, not re-measured, and the binaries are located in the records:

  | Runtime | Version | Binary | Date | Record |
  |---|---|---|---|---|
  | Pi | 1.4.0 | `~/.local/bin/pi` (the managed install's 1.4.0 release) | 2026-10-22 | CR159, CR160 |
  | Claude Code | 2.1.296 | `~/.local/bin/claude` → `~/.local/share/claude/versions/2.1.296` | 2026-10-13 | DS12.TS1, DS2 (`recorded-versions.tsv`) |
  | Codex | 0.163.0 | `/opt/homebrew/bin/codex` → `/opt/homebrew/Caskroom/codex/0.163.0/bin/codex` | 2026-10-17 | DS4.US4 |
  | Antigravity | agy 1.4.2 | `~/.local/bin/agy` | 2026-10-18 | DS7.US4 (bar-walk evidence) |
  | Grok Build | 1.0.62 (1474f9cbdd91) | `~/.grok/bin/grok` → `~/.grok/downloads/grok-1.0.62-macos-aarch64` | 2026-10-18 | DS10.US3 |

  A cell whose record does not hold the fact reads "not recorded" or "not measured in
  CV21", never today's value. Claude Code's row carries 2.1.296: the two facts US2 and
  TS3 measure on 2.1.310 are written on their own lines in their own sections, and
  TS3's sessions do not re-confirm the row.
- Pi's cells are sourced cell by cell. Skills and logging: CR159/CR160 on 1.4.0.
  Instructions at start: the extension's context file (CV22.DS10.US3, D13), with the
  record that measured it or "not measured in CV21". Per-turn injection: none — the
  extension logs at `before_agent_start` and injects nothing; Mirror Mode comes from
  `/mm-mirror`, as the contract's injection section says. MCP: not wired — the
  extension calls the front door.
- The matrix states the levels, carried from
  [CV8's definitions](../../cv8-runtime-expansion/index.md#runtime-parity-levels),
  which CV21 says it reuses (L0's `uv run python -m memory` becomes `mirror`).
- The contract's "Mirror Mode injection models" table is corrected where the
  per-runtime stories moved it: Codex reads the inject hook's context (DS4.US4), so it
  leaves "Explicit invocation".
- [`docs/product/architecture.md`](../../../../product/architecture.md) §1 names five
  harnesses; §6 counts five, gains Grok Build's row, and names the plugin as Claude
  Code's installed path and the `.claude/hooks/` wrappers as the checkout's. Its levels
  equal the matrix's.
- README's "How It Works" and REFERENCE's Commands introduction link to the matrix.
  Getting Started's "How the mirror reaches each runtime" carries a compact table in
  plain words — per runtime, what the person gets (DS10.TS4's "Mirror Mode on request,
  no automatic context per turn" is the model), the version, and the date — and one
  sentence: each runtime was measured on the version named, newer versions are not
  re-measured, and `mirror runtime diagnose` says when the wiring is off. Levels stay
  in the contract and the architecture.
- `decisions.md` gains one decision: **the contract's parity matrix is the single
  authority for runtime parity; a matrix in a decision record is a dated snapshot; a
  cell changes only with a sourced measurement.** It records CV21's measured parity
  beside the 2026-10-13 bet (Codex and Antigravity from "L4 reachable" to L4, Grok
  confirmed L3) and the record that moved each. The 2026-10-13 decision is not edited.
- **A guard test**, `ts/test/scripts/runtimeParityDocs.test.ts`, written first and
  failing on today's tree: each of the five docs (contract, README, Getting Started,
  REFERENCE, architecture) names all five runtimes; the contract's matrix holds
  exactly one row per runtime, each with a non-empty version, binary, date, and record;
  the architecture's §6 level for each runtime equals the matrix's. It runs in
  `npm test`, so CI holds it.
- DS4, DS5, and DS10's own packages, which say "DS11 folds the matrix", are not
  rewritten; CV21's index row for DS11 and this package record the fold.

**US2 — The status line is a step the user does on Claude Code.**

- Measured on the installed Claude Code (2.1.310) in the route's logged-in scratch
  config directory (`CLAUDE_CONFIG_DIR`, real `HOME`, as the contract's
  [login note](../../../../product/specs/runtime-interface/index.md#claude-codes-login-in-isolated-routes)
  requires). The plugin is wired in that directory's `skills/` exactly as `mirror init`
  prints it for `~/.claude/skills`, and every hook writes to a scratch Mirror home
  (`MIRROR_HOME`), so the session is registered by the plugin's own hooks.
- Two forms: the global fallback (`mirror welcome --status-line`) and the
  session-scoped form, whose `--session-id` is the `session_id` Claude Code writes to
  the status line command's stdin, read with Node (no `jq`). A probe wrapper records
  each run's stdin and wall time. Measured: the stdin's `session_id` equals the one the
  plugin's hooks registered; how often Claude Code runs the command; the per-run wall
  time of each form. The scoped form counts as working only if two sessions side by
  side each show their own mode: one after a `/mm-build` turn shows `■ Builder Mode`,
  the other does not.
- The printed step is the simplest form that works with what Mirror already requires
  (Node). If only the fallback is honest without a new front-door route, the step is
  the fallback and the doc says what session-scoping would need.
- Placement: Getting Started "10. What's Next" gains the optional step, with the
  measured per-run time and the GUI-launch note (`MIRROR_BIN`/`MIRROR_NODE`, as for the
  hooks); `### Claude Code` gets one sentence pointing there. REFERENCE's
  `welcome --status-line` entry carries the exact command and names Claude Code beside
  Pi. The contract's
  [status line section](../../../../product/specs/runtime-interface/index.md#optional-runtime-status-line)
  names Claude Code as a runtime where the user wires it, with version and date, and
  keeps "a plugin cannot carry it" (DS12.TS1 static 3 and L7) as the reason. The DS2
  index's "becomes a documented user step in DS11" is left as written.

**TS3 — Claude Code reading a project `AGENTS.md` is written where a user reads it.**

- Re-checked on 2.1.310 in the same scratch config directory, one headless turn per
  case, **gated on the transcript** (the session file under `$CLAUDE_CONFIG_DIR/projects/`);
  the model's own answer is recorded as an observation, not the gate:
  - (a) a scratch project carrying an `AGENTS.md` with one canary sentence, the plugin
    wired: the project file loaded natively as project instructions and the plugin
    hook's `additionalContext` both present;
  - (b) a scratch worktree of this checkout (never the real tree): how many copies of
    the Operating Instructions reach the model — `CLAUDE.md`'s `@AGENTS.md` import,
    Claude Code's native load, the SessionStart hook's (withheld in a checkout) — and
    what the duplicate costs: the first turn's input tokens from the transcript's
    usage, with the import and without it (a second scratch worktree with the import
    line removed).
- The contract's `### Claude Code` section records both facts with version and date
  (DS12.TS1 L8 as the first measurement) and says **both reach the model** — no
  precedence claim either way. Getting Started gives the consequence in one sentence:
  a project's own `AGENTS.md` still applies, Mirror's instructions arrive beside it,
  and nothing needs merging. The header comment of the package's `AGENTS.md` ("Claude
  Code through the `@AGENTS.md` import in `CLAUDE.md`") is corrected to what was
  measured.
- If (b) shows the checkout's import is redundant, TS3 records the count and cost and
  stops: removing the import is a Navigator decision.

**TS4 — `runtime diagnose` knows the canonical plugin's agy copy.**

- First, in a scratch `HOME`: `agy plugin install` stages the canonical plugin from a
  worktree at the previous release (v0.36.2), and the staged copy's
  `.gemini/config/plugins/mirror-mind/.claude-plugin/plugin.json` is read — the file
  `agyPluginCopyState` was proven on only for the extensions plugin. The test fixture
  is written from what was staged, under the real name `mirror-mind`.
- Tests first, hermetic under a scratch `HOME`: `pluginWiringFindings`
  (`ts/src/runtime/diagnose.ts`) raises `agy_plugin_copy_behind` (severity: warning)
  for a copy behind the installed version — the copy's path as subject, both versions
  in the detail, the reinstall as recommendation and repair route — and nothing for
  current, ahead, or absent. `postUpdateHints` (`ts/src/runtime/update.ts`) says the
  same after an update lands with agy's copy behind.
- The command is one function in `wiring.ts`, built from the install root — as
  `grokPluginReinstallCommand(installRoot)` is — and used by `init`'s Antigravity step,
  the finding, and the hint. The branch takes Codex's shape. `.gemini` is derived from
  `HOME` as `extensionPluginWiring.ts` derives it; no new environment variable.
- REFERENCE's `runtime diagnose` and `runtime update` paragraphs name the finding and
  the hint; the contract's Antigravity wiring row names the stale copy and its
  level-up. DS5's index row for US2 gains "paid in DS11.TS4"; DS5.US2's sealed
  `review.md` is not edited.

## Non-Goals

- No re-measurement of parity. Every runtime's row carries the version, binary, and
  date its own record holds; today's newer binaries appear nowhere in the matrix, and
  TS3's sessions are not parity measurements.
- No change to any runtime's behavior: hook, plugin, MCP server, or injection path.
- No status line on Codex, Antigravity, or Grok Build, and no new front-door route
  that reads a runtime's status payload.
- No `mirror init` step for the status line.
- No removal of `CLAUDE.md`'s `@AGENTS.md` import.
- No rewrite of the 2026-10-13 decision's matrix; no rewrite of DS4, DS5, DS7, or
  DS10's packages beyond DS5's one US2 row.
- No agy finding for duplicated or dangling copies: agy stages by plugin name, one
  copy, and no failure of that kind has been measured.
- No release, tag, or publish. Release intent is recorded through `release-intent`
  when the Navigator says so, and is undecided until then.

## Acceptance Behavior

```text
Given the runtime interface contract, README, Getting Started, REFERENCE, and the
      architecture
When a user reads any of them for which runtimes Mirror supports and how well
Then each names the same five runtimes, and the contract's matrix and the
     architecture give each the same level
And each matrix row carries the version, binary, date, and record it was measured in,
    or says the fact was not recorded
And Getting Started says, in plain words, what each runtime gives and when it was
    measured, and that newer versions are not re-measured
And decisions.md names the matrix as the single authority for parity
And npm test fails if any of the five docs drops a runtime or the two levels diverge

Given a Claude Code user who wants Mirror's status line
When they follow the optional step Getting Started prints
Then the line shows in their session on the measured Claude Code version
And the step states what each run costs and what a desktop launch needs
And, if the step is session-scoped, two sessions side by side each show their own mode

Given a Claude Code user whose project carries its own AGENTS.md, with the plugin wired
When they read the contract's Claude Code section or Getting Started
Then they learn that both their file and Mirror's Operating Instructions reach the
     model, with the version and date measured, and that nothing needs merging
And the package's AGENTS.md header says the same

Given a home whose agy copy of the canonical plugin is behind the installed package
When the user runs mirror runtime diagnose, or an update lands
Then agy_plugin_copy_behind names the copy, both versions, and the reinstall command,
     and the post-update hint says the same
And after that command runs, diagnose no longer reports it
And a home with no agy copy reports nothing for it
```

## Validation Route

Automated checks, run before the Navigator route:

- `npm run typecheck`, `npm run lint`, `npm test`: TS1's guard and TS4's tests written
  first and seen failing, then green; the plugin-wiring, diagnose, and update suites;
  the repository's doc guards (`node ts/scripts/checkDocLinks.ts`,
  `node ts/scripts/checkSkillCommandParity.ts`) green.

One route, `route.sh` in this package, isolates every live step under a scratch
directory (`DS11_DIR`): the Claude login config directory, a scratch Mirror home,
the scratch projects, the scratch worktrees, and a scratch agy `HOME`. Navigator steps:

1. **The matrix.** Read the contract's `## Parity Matrix`, then README, Getting Started,
   REFERENCE, and architecture §6. Expected: five runtimes everywhere; the same level in
   the matrix and the architecture; every row with version, binary, date, and record, or
   "not recorded". Pass: no disagreement, and the guard test green. Fail: a doc drops a
   runtime, a level differs, or a cell claims a measurement its record does not hold.
2. **The status line.** After `route.sh login claude` (the Navigator's, once), two
   Claude Code sessions side by side in the route's config directory, wired by the
   printed step. In one, `/mm-build <the scratch journey>`. Expected: each footer shows
   Mirror's line; with the session-scoped form, only the Builder session's footer shows
   `■ Builder Mode`. If the step is the fallback, one session, and the line shows.
   Pass: as expected, and the step's per-run time matches the probe log. Fail: no line,
   or a mode in the wrong footer under the scoped form.
3. **A project's `AGENTS.md`.** The Driver's transcript extracts from (a) and (b):
   Expected: in (a) the project file loaded natively and the hook's `additionalContext`,
   both in the transcript; in (b) the count of instruction copies and the token
   difference. Pass: the contract and Getting Started say exactly that, with version
   and date. Fail: a doc claims more than the transcript shows, or a precedence.
4. **The agy finding**, in the route's scratch agy `HOME` (this machine has no agy copy
   of the plugin: `agy plugin list` reports none). The v0.36.2 plugin staged by
   `agy plugin install`; `mirror runtime diagnose` from this tree. Expected:
   `agy_plugin_copy_behind`, 0.36.2 < 0.36.3, with the install command; run that
   command; diagnose again: the finding is gone. Pass: both readings, the text matching
   REFERENCE. Fail: no finding while behind, or a finding after the reinstall.

E2E: steps 2–4 are live on the real binaries; the matrix is sourced, not re-run.
Cleanup, `route.sh clean`: the scratch directory, both scratch worktrees (`git worktree
remove`, then `git worktree prune`), the scratch Mirror home, the scratch agy `HOME`,
and the scratch login's `Claude Code-credentials-<hash>` keychain entry, named for the
Navigator to delete. `route.sh untouched` reads the real `~/.claude` settings, the real
Mirror homes' conversation counts, and `~/.gemini/config/plugins` against the baseline.

## Implementation Contract

- TDD for the behavior change and the guard: TS4's tests in
  `ts/test/runtime/pluginWiring.test.ts`, `ts/test/runtime/diagnose.test.ts`, and
  `ts/test/runtime/update.test.ts`, and TS1's guard, fail before the change, hermetic
  under a scratch `HOME`.
- A doc fact is written only with the measurement or record it cites. Version, binary,
  and date travel together. A measurement that contradicts a doc changes the doc's
  claim, not its wording alone.
- Hand-maintained in three places with no guard tying them: a finding code in
  `diagnose.ts`, REFERENCE's findings paragraph, and the contract's wiring row. The
  test guide lists them for a check by eye.
- Stop for the Navigator, never absorbed:
  1. a front-door route for the status line;
  2. removing `CLAUDE.md`'s import;
  3. an `init` step for the status line;
  4. an agy duplicate or dangling finding;
  5. a runtime whose sourced cells contradict its claimed level — found while sourcing
     this plan: Pi is claimed L4 by the architecture, and its Mirror Mode is on request
     with no per-turn injection, the model DS10 called L3 for Grok. TS1 writes every
     sourced cell and stops on the level;
  6. a mode activated from the agent's shell that binds to another session than the
     footer's: the step falls back, the finding is recorded, the binding is a follow-up.
- Child stories stay traceable work packages: each child `index.md` is authored with
  what its story is and marked Done as it completes; DS11's aggregate Validation is the
  Navigator checkpoint.
- Small commits in English saying why, one per story or coherent doc set. No push,
  tag, or release inside this plan.

---

_Approval and lifecycle state are tracked by the Builder runtime, not duplicated in this plan._
