# Plan — CV21.DS8.US1

## Objective

Remove the Gemini CLI integration from the package now that its gate is met:
DS7.US4 measured Antigravity at L4 on agy 1.4.2 (2026-10-18), all five bar
items PASS. The four `.gemini/hooks` wrappers, the `gemini:*` hook family
behind them, the two Gemini steps `mirror init` prints, the Gemini smoke, and
the npm smoke's Gemini section retire; the pack-contents guard stops allowing
`.gemini/`, and a retired-surface row keeps the removal removed. After this
story the shipped tarball carries no Gemini CLI path and `mirror init` prints
no Gemini section, with `gemini` on the PATH or not.

What this story does not reach, by the Delivery Story's split: the
runtime-facing docs and the skills that still say "Pi and Gemini CLI" (US2),
and the cutoff record and the release note (US3). Two docs are touched here
anyway, because they describe a live automated surface this story deletes:
the development guide's smoke loop and CI's.

One decision this plan resolves: `HookPayload.response` in
`ts/src/hooks/payload.ts` reads Gemini's `prompt_response` and nothing else
reads it (`rg "\.response\b" ts/src/hooks` finds only `gemini.ts`). It goes
with its reader and its test; the shared reader in
`ts/src/conversation/hookPayload.ts` carries no `prompt_response` and is not
touched.

## Scope

**Deleted files:**

- `.gemini/hooks/session-start.sh`, `log-user.sh`, `log-assistant.sh`,
  `session-end.sh` — the four generated wrappers.
- `.gemini/settings.json` — the checkout's own hook registration; nothing
  else under `.gemini/` exists, so the directory goes.
- `ts/src/hooks/gemini.ts` — `geminiSessionStart`, `geminiLogUser`,
  `geminiLogAssistant`, `geminiSessionEnd`.
- `scripts/smoke_gemini_cli.sh` — the Gemini smoke.

**Code edits:**

- `ts/src/hooks/main.ts` — drop the `gemini` dispatch case and its import.
- `ts/src/hooks/payload.ts` — drop `response` from `HookPayload` and the
  `prompt_response` read with its comment (decision above).
- `ts/src/runtime/wiring.ts` — remove `gemini` from `RuntimeName` and `ORDER`,
  the `gemini` wiring entry, and `geminiHooksSettings`; the header comment's
  Gemini CLI paragraph goes. Pi, Claude Code, Codex, and Antigravity stay as
  they are, with their counts.
- `scripts/generate_hook_wrappers.sh` — remove the four `.gemini/hooks` rows
  and the comment naming `.gemini/hooks`.
- `scripts/smoke_npm_package.sh` — remove section 9 (the Gemini wrappers run
  from under npm root -g) with its `GEMINI_HOOKS`/`GEMINI_ENV` scaffolding and
  the `REAL_SQLITE` row check that reads the rows it wrote; renumber the
  sections after it. Verify no later step reads `$WORK/gemini-*` before
  renumbering.
- `package.json` — remove `.gemini/hooks` from `files` and `gemini-cli` from
  `keywords`; the `description` stops naming Gemini CLI and names Antigravity
  in its place (the package's own description is a shipped surface, and the
  tarball is this story's artifact).
- `ts/src/guards/packContents.ts` — remove `.gemini/hooks/` from
  `ALLOWED_PREFIXES` and `.gemini/hooks/session-start.sh` from
  `REQUIRED_FILES`, so a tarball that ships `.gemini/` fails `checkPackContents`.
- `ts/src/guards/retiredSurfaces.ts` — add a `gemini-cli` retired-surface row,
  story `CV21.DS8.US1`, **split by story** (review amendment 1): the sweep
  reads every tracked file outside `HISTORY_PREFIXES`, and the doc-facing
  names (`.gemini/hooks`, the `gemini:*` routes, `gemini skills link`) still
  appear today in five documents US2 owns — Getting Started, troubleshooting,
  architecture, the runtime-interface spec, configuration. So this story's
  row carries what its own removal clears: `absentPaths` `.gemini/`,
  `ts/src/hooks/gemini.ts`, `scripts/smoke_gemini_cli.sh`, and
  `forbiddenPatterns` only code and CI name — `smoke_gemini_cli`,
  `geminiHooksSettings`, `hooks/gemini\.ts`. US2 widens the row with the
  doc-facing names when it clears the docs. No exemption is staged: an
  exemption pre-approves whatever lands at its path. Patterns are file and
  route names, never vocabulary — `gemini` is a living word (the models,
  agy's `~/.gemini/` home, the `gemini_cli` history label). `absentPaths:
  [".gemini/"]` belongs here and not in US2 because users' settings files
  hold a standing instruction to execute four absolute paths under that
  directory; this row is the control that keeps a future release from ever
  shipping a file there again.
- `.github/workflows/tests.yml` — drop `smoke_gemini_cli` from the runtime
  smoke loop; the step's comment stops crediting the Gemini smoke with F11 as
  a live fact (it stays as history, past tense).
- Comments that describe the Gemini hooks as live, rewritten or trimmed:
  `ts/src/hooks/runtime.ts` (the runtime list, the D13 `{}` note, the "Gemini
  logger passes the prompt and the response" note),
  `ts/src/conversation/commandTurn.ts`, `ts/src/conversation/deferredCloseTail.ts`,
  `ts/src/conversation/logger.ts` (the "Gemini CLI 30 s" bound),
  `ts/src/frontDoor/stdinSource.ts`, `ts/src/guards/piSourcedSkills.ts`.

**Test edits (written first, where they describe behavior):**

- `ts/test/frontDoor/initCli.test.ts` — new case: with a `gemini` stub on the
  PATH, `init` prints no `Gemini CLI:` section (characterization of the
  removal; the existing `doesNotMatch(/Gemini CLI:/)` on the no-runtime case
  stays).
- `ts/test/runtime/wiring.test.ts` — the "honest counts" test drops
  `gemini: 2`; the "Gemini CLI: link the skills, then the four hooks" test
  goes; the Antigravity test's comment stops saying "supported until DS8"; the
  header comment follows.
- `ts/test/hooks/hooks.test.ts` — the four `.gemini/hooks` wrappers leave
  `TREE_WRAPPERS` and the covered-directories list; "Gemini's AfterAgent
  names the assistant's text `prompt_response`", "a failed Gemini turn is
  recorded without the prompt or the response", and "Gemini's AfterAgent hook
  logs the assistant turn it is given" go; the failure-log fixtures that spell
  `gemini:log-user` as a sample hook name are respelled with a living family;
  the counts in names and comments follow the lists ("nine tree wrappers"
  becomes five).
- `ts/test/frontDoor/hookPayloadRedaction.test.ts` — the header comment stops
  naming the Gemini hooks; any `gemini:*` case goes.
- `ts/test/scripts/packContents.test.ts` — Gemini expectations follow the
  guard.
- `ts/test/scripts/retiredSurfaces.test.ts` — seed tests for the `gemini-cli`
  row, per the `codex-wrapper` pattern; `.gemini/hooks/` leaves the "no longer
  catches the runtime hooks" list.
- `ts/test/builder/namedSessionPrecondition.test.ts` — `.gemini` leaves
  `INTEGRATION_ROOTS`.
- `ts/test/scripts/piSourcedSkills.test.ts`,
  `ts/test/scripts/operatingInstructions.test.ts`,
  `ts/test/conversation/logger-lifecycle.test.ts` — header comments only.

**Doc edits (the live automated surface only):**

- `docs/process/development-guide.md` — the runtime smoke list and loop drop
  `smoke_gemini_cli.sh`; the hooks-history paragraph (how the Claude and Gemini
  hooks each parsed JSON) stays as history.

## Non-Goals

- Do not implement sibling roadmap item CV21.DS8.US2: every runtime-facing
  doc names four runtimes, Antigravity as the successor — README, Getting
  Started, REFERENCE, AGENTS.md and its copies, the runtime-interface spec,
  the welcome spec, architecture, troubleshooting, configuration, and the
  skills that say "Pi and Gemini CLI".
- Do not implement sibling roadmap item CV21.DS8.US3: the cutoff record and
  the release note.
- Do not touch the `gemini_cli` interface label where it names history: the
  logger, `runtimePolicy.test.ts`, `mm-conversations`/`mm-recall` output.
- Do not touch Gemini models: `ts/src/consult/modelCatalog.ts`,
  `providers/config.ts`, `providers/cost.ts`, their tests and goldens.
- Do not touch anything Antigravity owns under `~/.gemini/`, the
  `.gemini-plugin/` marker in `guards/claudePlugin.ts`, or `ts/src/hooks/agy.ts`.
- Do not rewrite historical records: release notes, decisions,
  `pending-cutoffs.md`, closed roadmap stories, refinement records, the
  worklog.

## Acceptance Behavior

```text
Given DS7.US4 proved Antigravity at L4 on agy 1.4.2
When the Gemini CLI integration is removed
Then the tree holds no .gemini/, no ts/src/hooks/gemini.ts, and no
  scripts/smoke_gemini_cli.sh, and the hook entry knows no gemini:* name
And the packed tarball neither requires nor allows .gemini/, proven by the
  pack-contents guard and scripts/smoke_npm_package.sh
And `mirror init` with a `gemini` binary on the PATH prints no Gemini CLI
  section, while Pi, Claude Code, Codex, and Antigravity print as before
And CI's smoke loop runs smoke_claude_plugin and smoke_mirror_mcp without
  smoke_gemini_cli
And the retired-surface guard names .gemini/, ts/src/hooks/gemini.ts, and
  scripts/smoke_gemini_cli.sh as absent and smoke_gemini_cli,
  geminiHooksSettings, and hooks/gemini.ts as forbidden, and the tree is
  clean of them; the doc-facing names wait for US2's widening
And `mirror-hook gemini:session-start` exits 0 with empty stdout and notes
  `unknown hook name` in the hooks log, as any unknown name does
And conversations logged as gemini_cli still list and load
And Gemini models, agy's ~/.gemini/ home, and the sibling stories' surfaces
  remain untouched
```

## Validation Route

Automated:

- `npm test` (the full suite): hooks, wiring, init, pack contents, and
  retired-surfaces tests pass with the Gemini cases removed and the new
  `init`-with-`gemini`-on-PATH case added.
- `bash scripts/smoke_npm_package.sh <scratch>`: packs this tree, installs
  from nothing, and exercises the bins — now with no Gemini section.
- The remaining runtime smokes: `smoke_claude_plugin.sh`, `smoke_mirror_mcp.sh`.

Navigator-visible route:

- Observation 1: `npm pack --dry-run` — pass: the file list carries no path
  under `.gemini/`; fail: any `.gemini/` path ships.
- Observation 2: a scratch directory with an executable `gemini` stub on the
  PATH, then `mirror init <name>` — pass: the "Wire your runtime" section
  prints no `Gemini CLI:` block; fail: it prints one.
- Observation 3: `mirror-hook gemini:session-start` — a hook never breaks
  its runtime, so an unknown name does not fail: `main.ts` notes it and
  returns 0. Pass: exit 0, empty stdout, and one
  `hooks: unknown hook name: gemini:session-start` line in the hooks log;
  fail: it runs the Gemini session start (Operating Instructions on stdout),
  or exits non-zero.
- Observation 4: `git grep -In "\.gemini/hooks\|gemini:session\|gemini:log\|smoke_gemini_cli\|geminiHooksSettings" -- ':!docs/project' ':!docs/process/worklog.md' ':!docs/releases'`
  — pass: no matches in live code, guards, CI, or the development guide; fail:
  a live surface still names the retired wiring. (US2's doc mentions of
  "Gemini CLI" as a runtime are expected to remain and are not this story's
  fail condition.)
- Observation 5: `mirror conversations` in a home that has a `gemini_cli`
  conversation — pass: it lists as before; fail: it is missing or errors.

E2E decision: `scripts/smoke_npm_package.sh` is the E2E — it installs the
packed tarball from nothing and proves the shipped artifact. No Gemini CLI
session is run: the story removes the integration, and there is nothing to
measure live on a runtime being retired.

Coverage residue, named so it is not believed otherwise later:

- The Gemini smoke and the npm smoke's section 9 were the only automated
  checks that fed a `prompt_response` payload through a generated wrapper to
  the database. That path retires with them; no living runtime uses
  `prompt_response`, so nothing loses coverage.
- `smoke_gemini_cli.sh` is the smoke that caught F11 — every assistant turn
  dropped in silence because a payload field was read under the wrong name.
  The runtime leaves; the class of bug does not. What holds that line now:
  `smoke_claude_plugin.sh` for the Claude-family hooks Claude Code and Codex
  run, `ts/test/hooks/agy.test.ts` for Antigravity's transcript reader, and
  DS7.US4's live measurement. Whether agy has a smoke of its own is DS7's
  question, not this story's.
- The sweep's `:!docs/project` exclusion is wide; validation also runs one
  unfiltered grep pass with eyes on it.

Not independently releasable: the release tripwire in `publish.yml` runs the
same retired-surface sweep, and between this story and US2 the five
documents above still name the retired wiring — only through US2's widened
row, not this story's, so `npm test` stays green, but the tree as a whole
is not the tree a release describes. Release is US3's, after US2.

Inputs handed to US3, established here because they are cheapest to state
while the files still exist: after `npm update -g`, the four `mirror-*`
commands in a user's `~/.gemini/settings.json` dangle, while the
`~/.gemini/skills/` links `gemini skills link` created keep resolving because
`.pi/skills` keeps shipping — a do-nothing user keeps the skills in Gemini CLI
and loses logging and injection; what Gemini CLI prints for a missing hook
command is to be measured by US3, not guessed; the rollback is a pin to the
last Gemini-bearing release, `v0.34.0`; and whether Antigravity also reads
`~/.gemini/skills/` (which would offer a migrated user the skills twice) is
one probe for US3.

## Implementation Contract

- Characterization-first: write the `init`-with-`gemini`-on-PATH case and the
  retired-surface seed tests before the removal; update the failing assertions
  (pack contents, wrapper lists, wiring counts) in the same change as the
  removal they describe.
- Stage deletions (`git rm`) before running the retired-surface guard: it
  walks `git ls-files`, which lists the index, so a deleted but unstaged
  file still counts as present and the guard stays red for no reason.
- Keep changes scoped to `CV21.DS8.US1`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected — any removal that would touch Antigravity's
  `~/.gemini/` surfaces, `hooks/agy.ts`, a Gemini model pin, or the
  `gemini_cli` history label.
- plan_rule_conflict.
- failing_required_check_without_clear_fix.
- navigator_decision_needed — a live reader of `HookPayload.response` or a
  later npm-smoke step depending on section 9's rows that this plan's
  inventory missed.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
