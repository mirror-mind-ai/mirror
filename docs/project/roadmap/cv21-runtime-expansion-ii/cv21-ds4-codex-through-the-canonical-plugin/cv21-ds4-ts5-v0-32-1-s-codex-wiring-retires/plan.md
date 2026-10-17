# Plan — CV21.DS4.TS5

## Objective

Remove the v0.32.1 Codex wiring now that its gate is met: US4 measured Codex at
L4 through the shipped plugin, live (binary 0.163.0, committed 86358947). The
wrapper script, its two generated hooks, the `codex:*` hook family, the JSONL
backfill they drove, their pack-contents guards, and their CI step all retire;
the docs describe Codex through `codex plugin marketplace add` and
`codex plugin add mirror-mind@mirror-mind`, and nothing else.

One decision this plan resolves from the Delivery Story's conditional — "the
Codex JSONL backfill stays only if the plugin's SessionEnd fallback reads it":
it does not. `claudeSessionEnd` (`ts/src/hooks/claude.ts`) runs
`conversation-logger session-end --interface <runtime>` and `backup --silent`;
no plugin path calls `backfill-codex-session`, and its only live caller is the
retiring wrapper's session-end hook (`ts/src/hooks/codex.ts`). The backfill
retires with the wrapper. (The v0.32.0 cutoff record said the transcript
backfills "stay" — that was CV22's statement about the port, made while the
wrapper still shipped; it is history and keeps its text.)

## Scope

**Deleted files:**

- `scripts/codex-mirror.sh` — the wrapper.
- `scripts/codex-hooks/` — its two generated hook wrappers.
- `ts/src/hooks/codex.ts` — `codexSessionStart` / `codexSessionEnd`.
- `scripts/smoke_codex.sh` — its only subject is `backfill-codex-session`.
- `ts/test/fixtures/backfill/codex/` — the backfill's fixtures.

**Code edits:**

- `ts/src/hooks/main.ts` — drop the `codex` dispatch case and its import; the
  header comment no longer says only the Codex wrapper passes arguments.
- `ts/src/conversation/backfill.ts` — remove `backfillCodexSession`.
- `ts/src/conversation/loggerCli.ts` — remove the `backfill-codex-session`
  subcommand and its help line.
- `ts/src/frontDoor/routing.ts` — remove the `backfill-codex-session` route.
- `ts/src/conversation/loggerRuntime.ts` — update the lazy-loading comment.
- `ts/src/guards/packContents.ts` — remove `scripts/codex-hooks/` from
  `ALLOWED_PREFIXES`, `scripts/codex-mirror.sh` from `ALLOWED_FILES`, and both
  codex entries from `REQUIRED_FILES`.
- `package.json` — remove `scripts/codex-hooks` and `scripts/codex-mirror.sh`
  from `files` (the `codex` keyword stays: the plugin still serves Codex).
- `scripts/generate_hook_wrappers.sh` — remove the two codex rows and the
  comment naming `scripts/codex-hooks`.
- `scripts/smoke_npm_package.sh` — remove step 10 (the Codex wrapper around a
  stand-in codex) and all of its scaffolding: the `$WORK/bin/codex` stub, the
  fake `~/.codex/sessions` tree, and the `REAL_SQLITE` row check that reads
  the rows step 10 wrote. Verify no later step depends on them before
  renumbering.
- `.github/workflows/tests.yml` — drop `smoke_codex` from the smoke loop; the
  step name and comment stop naming the Codex wrapper. Check `publish.yml`
  and `docs.yml` for codex wiring references during implementation, not at
  the sweep.
- `ts/src/guards/retiredSurfaces.ts` — add a retired-surface row for the
  Codex wrapper (amendment approved at Plan review): seeds
  `scripts/codex-mirror.sh`, `scripts/codex-hooks/session-start.sh`,
  `scripts/codex-hooks/session-end.sh`, and `ts/src/hooks/codex.ts`, so the
  retired wiring coming back fails a test — the frame-installer pattern.

**Test edits:**

- `ts/test/hooks/hooks.test.ts` — the two codex wrappers leave `TREE_WRAPPERS`
  and the covered-directories list; "the Codex wrapper" describe block goes;
  the counts baked into names and comments follow the lists — "the fourteen
  wrappers" becomes twelve, "the eleven in-tree wrappers" becomes nine.
- `ts/test/scripts/retiredSurfaces.test.ts` — seed tests for the new
  codex-wrapper row, per the existing row patterns.
- `ts/test/scripts/packContents.test.ts` — codex expectations follow the guard.
- `ts/test/conversation/backfill.test.ts`, `loggerCli.test.ts`,
  `loggerRuntime.test.ts`, `ts/test/frontDoor/routing.test.ts` — the codex
  backfill cases go; the other backfills' cases stay.
- `ts/test/scripts/retiredSurfaces.test.ts` — references to the deleted paths
  in existing rows' live assertions are cleaned where they would go stale
  (they name files in "does not trip" lists; behavior unchanged).
- `ts/test/runtime/wiring.test.ts` — unchanged; its assertion that `mirror
  init` never names the wrapper keeps passing.

**Doc edits (the story's doc gate):**

- `README.md` — verify no wrapper mention remains (none found; confirm in the
  residue sweep).
- `docs/getting-started.md` — the "still ships for now and retires with
  CV21.DS4.TS5" paragraph becomes past tense: the wrapper no longer ships; the
  un-wiring steps for pre-plugin installs stay.
- `REFERENCE.md` — the POSIX-surface sentence stops naming the Codex wrapper.
- `docs/product/specs/runtime-interface/index.md` — the Codex section describes
  the plugin path only: the wrapper event table, the `codex-hooks` tree-wrapper
  mentions, the `backfill-codex-session` command block, and the wiring table's
  "still ship until DS4.TS5" clause all go.
- `docs/product/architecture.md` — the Codex row reads L4 through the plugin,
  not L3 through the wrapper.
- `docs/process/development-guide.md` — the smoke list drops `smoke_codex.sh`
  and the "Codex wrapper" mention.

**Cutoff record (owner named here so it is not lost):** the Done record of
this story authors the user-facing cutoff text — what no longer exists (the
wrapper, its hooks, `backfill-codex-session`), what to do instead (the
marketplace install; the un-wiring steps in Getting Started), and what still
works if the user does nothing (an old installed package keeps its own
wrapper copy; only the already-documented double logging). The next release
note carries it from there, per the v0.32.0 cutoff practice.

## Non-Goals

- Do not implement sibling roadmap item CV21.DS4.TS6 (an updated Mirror
  reaches Codex's plugin cache).
- Do not touch the living Codex path: `runtimeDetection.ts`'s `codex` runtime,
  the plugin hooks, the deferred close tail, `MIRROR_STALE_ORPHAN_MINUTES`.
- Do not remove `session-end-pi`, `backfill-pi-sessions`, or
  `backfill-assistant-messages`.
- Do not rewrite historical records (worklog, refinement, shipped release
  notes, the v0.32.0 pending-cutoffs document, closed roadmap stories).

## Acceptance Behavior

```text
Given US4 proved Codex at L4 through the shipped plugin
When the v0.32.1 Codex wiring is removed
Then the tree holds no scripts/codex-mirror.sh, scripts/codex-hooks/, or
  ts/src/hooks/codex.ts, and the hook entry knows no codex:* name
And the packed tarball neither requires nor allows those files, proven by the
  pack-contents guard and scripts/smoke_npm_package.sh
And CI's smoke loop runs smoke_gemini_cli, smoke_claude_plugin, and
  smoke_mirror_mcp without smoke_codex
And backfill-codex-session is no longer a route, a logger subcommand, or a
  documented command
And README, Getting Started, REFERENCE, the runtime interface contract, and
  the architecture doc describe Codex only through the marketplace install
And out-of-scope sibling roadmap items remain untouched
```

## Validation Route

Automated:

- `node --test` (the full suite): hooks, pack contents, routing, backfill, and
  retired-surfaces tests pass with the codex cases removed.
- `bash scripts/smoke_npm_package.sh <scratch>`: packs this tree, installs
  from nothing, and exercises the bins — now with no Codex wrapper step.
- The remaining runtime smokes: `smoke_gemini_cli.sh`, `smoke_claude_plugin.sh`,
  `smoke_mirror_mcp.sh`.

Navigator-visible route:

- Observation 1: `git grep -In "codex-mirror\|codex-hooks\|codex:session\|backfill-codex" -- ':!docs/project' ':!docs/process/worklog.md' ':!docs/releases'`
  — pass: no matches in live code, guards, CI, or user-facing docs; fail: any
  live surface still names the retired wiring.
- Observation 2: `npm pack --dry-run` — pass: the file list carries no
  `scripts/codex-mirror.sh` and no `scripts/codex-hooks/`; fail: either ships.
- Observation 3: `docs/getting-started.md` and the runtime interface contract
  read Codex as two steps, marketplace add then plugin add — pass: no wrapper
  instruction anywhere in them; fail: a wrapper step survives.

E2E decision: `scripts/smoke_npm_package.sh` is the E2E — it installs the
packed tarball from nothing and proves the shipped artifact. A live
`codex plugin add` walk is not repeated here; US4 measured it at L4 and this
story removes code that path never touches.

Coverage residue, named so it is not believed otherwise later: step 10 of the
npm smoke was the only automated check that Codex-labeled rows reach the
database from the shipped artifact. After this story, Codex logging
confidence rests on `runtimeDetection.test.ts` (unit: a Codex payload gets
the `codex` label), `smoke_claude_plugin.sh` (the Claude-family hooks Codex
runs as-is), and US4's live measurement. The sweep's `:!docs/project`
exclusion is wide; validation also runs one unfiltered grep pass with eyes
on it.

## Implementation Contract

- Characterization-first: update the failing assertions (pack contents, hooks
  wrapper lists, routing) in the same change as the removal they describe.
- Keep changes scoped to `CV21.DS4.TS5`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected — any removal that would touch the living plugin path.
- plan_rule_conflict.
- failing_required_check_without_clear_fix.
- navigator_decision_needed — a live caller of `backfill-codex-session` that
  this plan's inventory missed.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
