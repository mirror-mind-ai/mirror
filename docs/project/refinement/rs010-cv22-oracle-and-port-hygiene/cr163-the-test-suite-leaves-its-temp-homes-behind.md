[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR163 — The test suite leaves its temp homes behind, about 450 directories a run, and nothing notices

## Problem

Many tests make a temp home with `mkdtempSync`, a directory holding a database and
sometimes backups, and many never remove it. Some make it under a hardcoded `/tmp`
(`mkdtempSync("/tmp/<prefix>")`), others under `os.tmpdir()`; either way it stays
unless the file removes it, and in 40 files it does not. A full `npm test` run on
`main` leaves 448 directories behind, and the identity-edit golden's fake editor leaves
a `.seen` file beside the product's temp file. Nothing reports it: the run passes and
the directories pile up. On the maintainer's machine they had reached 47,774, the
oldest from 9 September.

The idiom exists: `storyWorld` and `builderWorld` record the roots they make and remove
them in one `test.after`, `skillTurnsRoute.test.ts` does the same since `f5636940`, and
164 test files call `rmSync(…, { recursive: true, force: true })`. What is missing is
that every test does it, and that a run which does not is noticed.

## Expected Behavior

A full `npm test` run leaves nothing in `/tmp` or the system temp folder: every temp
home a test makes is removed when its test or its file ends, through one shared helper
rather than forty copies of the same clean-up, for example a temp-home helper in
`ts/test/helpers` that registers its own removal. And a run that leaves one behind is
noticed, for example by running the suite with `TMPDIR` pointed at an empty directory
and failing if anything is left there, which needs every temp home made under
`os.tmpdir()` rather than a hardcoded `/tmp`. Whether any test depends on the `/tmp`
path is for planning to find out.

## Impact

None on the product, which none of this touches. On a machine that runs the suite, about
450 directories a run, never removed: on the maintainer's machine, 41,246 of them
measured 1.6 GB, 22,443 from the MCP tool fixture alone. CI runners are discarded
after each run, so CI never shows it; a contributor's machine does.

## Plan Or Decision

Captured, unassigned, 2026-10-24, at the Navigator's direction, after
`skillTurnsRoute.test.ts` was fixed on its own (`f5636940`) the night v0.36.3's repair
ran on the real homes, in RS010 beside CR058 and CR065, test hygiene of the same kind.
Not planned. Current Focus unchanged.

Selected 2026-10-24 (Current Focus).

**Plan, proposed 2026-10-24, not yet reviewed or approved.** One helper makes every
temp home the suite needs under `os.tmpdir()` and removes it when the test file's
process exits; the 40 sources move to it; the files that already clean up move their
homes under `os.tmpdir()`; a repository guard keeps a literal `/tmp` out of `ts/test`;
and CI fails a run that leaves anything behind.

1. **Tests first.** The helper's test runs `node --test` on a probe file the suite's
   glob does not pick up, with `TMPDIR` at an empty directory, and finds it empty after
   a passing probe and after a failing one, the probe's own `after` hook still finding
   its home. The guard's test gives it each forbidden form and a clean file.
2. **The helper**, `ts/test/helpers/tempDir.ts`: `tempDir(prefix)` makes
   `mkdtempSync(join(tmpdir(), prefix))`, records it, and returns it; the module removes
   every directory it recorded on the process's `exit` event (`rmSync`, recursive,
   force). Not in a `node:test` `after`: hooks run in the order they are registered, so
   one registered when the helper is imported runs before the file's own, and
   `zipBackup.test.ts` closes its zip writers in its own. Both measured; see Evidence.
3. **The 40 sources move to it**, each prefix kept so a leftover would still name its
   test: the MCP tools fixture (`withSeededDatabase`, `seededDatabase`, behind six test
   files) and the 39 test files listed in Evidence. A site that already removes what it
   makes keeps doing so; in the six files that remove some homes and not others, only
   the ones left move. `skillTurnsRoute.test.ts` gives up the registry `f5636940` gave
   it. `identity/identityEdit.test.ts` removes the `.seen` file its fake editor writes
   beside each temp file it collects; the golden's editor is unchanged.
4. **The 22 files that already clean up** keep their clean-up and make their homes
   under `os.tmpdir()`: `mkdtempSync(join(tmpdir(), …))`, and `realpathSync(tmpdir())`
   where they canonicalize (`runtime/diagnose`, `welcome/welcome`); `storyWorld` and
   `builderWorld` among them, their registries kept. Literal `/tmp/…` strings that name
   a path no test creates (goldens, asserted replay and sync paths) stay.
5. **A repository guard**, `ts/scripts/checkTestTempHomes.ts`, beside
   `checkRetiredSurfaces.ts`: it fails, naming file and line, when a file under
   `ts/test` makes a temp directory under a literal `/tmp`: `mkdtemp` or `mkdtempSync`
   given a `/tmp` string, template, or `join("/tmp", …)`, or `realpathSync("/tmp")`. A
   step in the Tests workflow runs it. It is what lets step 6 see every home; a `/tmp`
   held in a variable would escape it, and none is today. The rule is broken at 90 call
   sites in 55 files, past the bar the engineering principles set for a guard (§4).
6. **The run-level check in CI** (`.github/workflows/tests.yml`): the first `npm test`
   step runs with `TMPDIR` at an empty directory under the runner's temp folder, and the
   step after it fails if anything is left there, listing what is left by prefix, on
   both runners, ubuntu and macOS. The interpreter-shadow run, the suite's second, is
   unchanged.
7. **Docs.** §4 of the engineering principles: temp homes are made with `tempDir` and
   removed when the file's process exits; the new guard joins the list; CI fails a run
   that leaves one behind. The worklog records the change.

- **Acceptance:** a full `npm test` on macOS with `TMPDIR` at an empty directory leaves
  it empty, and `/tmp` gains nothing a test made; the suite's counts are unchanged
  (3,448 tests: 3,445 pass, 3 skipped, none failing); typecheck and lint clean; the
  guard passes on the tree and fails on each forbidden form, naming file and line; the
  CI check fails on a directory holding one leftover, shown locally, and passes on the
  real run on both runners, with Node 24.
- **Validation route (the Navigator):** in the repository, the suite run the usual way
  with its own empty temp folder, `/tmp` counted before and after:

  ```bash
  before=$(ls /tmp | wc -l); T=$(mktemp -d)
  TMPDIR="$T" npm test
  ls -A "$T"; echo "/tmp: $before -> $(ls /tmp | wc -l)"; rmdir "$T"
  ```

  Pass: `ls -A` prints nothing, `rmdir` succeeds, and `/tmp` holds as many entries as
  before. Fail: anything listed, or a new `/tmp` entry named after a test
  (`logger-cli-…`, `soul-state-…`).
- **Conscious exclusions:** product code, which makes none of these homes; the files
  already under `os.tmpdir()` that remove what they make; the repository's ignored
  `tmp/`, where `artifactWriter.test.ts` makes a relative root it removes; literal
  `/tmp` strings naming paths no test creates; `ts/smoke` and `ts/evals`, not measured
  here, captured separately if they leak; the Windows job, whose two files do not use
  the helper; per-test removal (`t.after`), which nothing here needs; a run-level check
  outside CI. No release: tests, CI, and docs only (versioning's process-only changes).
- **Authority:** the status stays `captured` until the Navigator approves this plan; a
  Driver and a Delivery are named before `in_progress` (CR160's were @viniciusteles and
  `main`); commits and pushes at the usual checkpoints; no release.

**Reviewed 2026-10-24 through five lenses** (engineer, quality assurance, devops
engineer, security engineer, quartermaster; the database architect sat out, no schema,
query, or migration being involved). Thirteen amendments proposed, not yet folded,
awaiting the Navigator's approval:

- A1 (engineer): the exit handler never changes a test's verdict: each removal
  wrapped, one stderr line on failure, the CI check reports what is left.
- A2 (engineer): the helper returns the directory's real path, so the two files that
  canonicalize need no special form and macOS's `/var` → `/private/var` cannot bite.
- A3 (engineer): commits in order, suite green at each: helper and test; the 40
  sources, folder by folder; the 22 cleaning files; the guard and its CI step; the
  run-level check; docs.
- A4 (engineer): `storyWorld` and `builderWorld` make their roots through the helper and
  drop their own registries and `remove*` exports (nine call sites).
- A5 (engineer): the golden's `echo_back` editor removes its own `.seen` scratch file
  (`rm -f "$1".seen`); no test clean-up for it.
- A6 (QA): acceptance restated: no test removed or skipped, the count grows by exactly
  the tests added, none failing.
- A7 (QA): the validation route's primary pass condition is the empty `TMPDIR`; `/tmp`
  is compared by name, before and after, not by count.
- A8 (QA): the guard's test covers the tree's forms (string, template,
  `join("/tmp", …)`,
  `realpathSync("/tmp")`, async `mkdtemp`) and the negatives (a `/tmp` in an
  assertion, a golden-style literal, a comment); reports file and line; scope every
  `.ts` under `ts/test`.
- A9 (QA): before any code moves, one run of the current tree with `TMPDIR` at an
  empty directory, its leftovers recorded in Evidence: the red the flip is dated
  against.
- A10 (devops): one script, `scripts/test_leaves_nothing.sh`, run by the workflow step
  and by the Navigator's validation route alike: empty directory under
  `${RUNNER_TEMP:-$(mktemp -d)}`, `TMPDIR` exported, `npm test`, leftovers listed by
  prefix with counts, exit 1 if any.
- A11 (devops): the leftover step runs only after a passing suite; the shadow run keeps
  the runner's default temp folder, a comment saying which run proves what.
- A12 (security): the helper removes only what it created, from its registry, never a
  path from an argument or the environment; its header says so; the probe proves a
  directory made beside the registry's survives the exit.
- A13 (quartermaster): if a file resists the mechanical move because a test depends on
  the `/tmp` path itself, stop and capture it rather than reshape that test here.

The quartermaster's sort: steps 1 to 3 and the run-level check are the gates; steps 4
and 5 are required by the check, which is otherwise blind to a home under a literal
`/tmp`; A2, A4, A5 are improvements at zero marginal cost; per-test removal, a
`tempFile` helper, `ts/smoke` and `ts/evals`, a pre-commit hook, and the shadow run
stay excluded. Known risk, not an amendment: a child a test spawns writing after its
parent exits would trip the check; that is an orphan to fix, not a retry.

## Evidence

- **One full run on `main` at `f5636940`**, 2026-10-24: 3,448 tests, none failing, 53
  seconds. The two temp folders listed before and after: 372 new entries in `/tmp` and
  77 in the system temp folder, each traced to a test: 448 directories from 39 test
  files and the MCP tools fixture, and one `.seen` file. The largest:
  `mcp/support/fixture.ts` 58 (one shared fixture behind the MCP tool tests),
  `soul/state.test.ts` 40,
  `conversation/replyLogging.test.ts` 34, `conversation/loggerCli.test.ts` 32,
  `backup/zipBackup.test.ts` 26, `conversation/journeyRepair.test.ts` 24.
- **The 40 sources, homes per run**, under `ts/test`. `conversation/`: replyLogging 34,
  loggerCli 32, journeyRepair 24, logger-lifecycle 18, sessionComposites 16,
  logger-hooks 16, loggerRuntime 11, logger 11, importedConversations 11,
  extractionDriver 11, closeTail 7, append 7, deferredCloseTail 6, piSkillTurns 5,
  transcriptBackfill 4, loggerGolden 3, conversationDeletion 3. `mirror/`:
  orchestration 5, context 4, defaultResolution 3, mirrorModeGolden 2,
  mirrorStateGolden 1. `soul/`: state 40, apply 16, prompts 10. `mode/`:
  operatingModeMetadata 8, operatingMode 3. `mcp/`: support/fixture 58, serve 6.
  `frontDoor/`: importedConversationsRoute 13, backupRoute 8, searchRoute 1. And
  backup/zipBackup 26, cultivation/promptContext 15, repair/encodingRepair 4,
  providers/replay 2, runtime/release 1, pi/mirrorLoggerExtension 1,
  observability/ledgerParity 1, builder/oneLanguage 1. 448 in all.
- **How the homes are made.** 49 files under `ts/test` call `mkdtempSync("/tmp/…")`, two
  of them the helpers that clean up and left nothing; 143 call
  `mkdtempSync(join(tmpdir(), …))`; others build the prefix at run time
  (`soul-state-${name}-`, `backup-${name}-`, …) or wrap the folder
  (`realpathSync("/tmp")`); `providers/replay.test.ts` uses the async `mkdtemp`.
  The identity-edit golden's fake editor (`echo_back` in
  `ts/test/goldens/identity-edit.golden.json`) writes `"$1".seen` beside the temp file
  the product makes; the product removes its file, and the `.seen` file outlives it.
- **The backlog on the maintainer's machine**, measured 2026-10-23 and removed by hand
  that night at the Navigator's direction: 14,155 directories in `/tmp` (897 MB, the
  oldest from 16 October) under 45 fixed prefixes from 32 files; 27,091 in the system
  temp folder (686 MB, the oldest from 9 September) under 16 prefixes from 14 files,
  22,443 of them `mirror-core-mcp-tools-*`; then 6,528 more the first search missed,
  under prefixes built at run time and `mirror-provider-replay-*` from the async
  `mkdtemp`; and 27 `.seen` files. Each directory was matched by the name `mkdtemp`
  gives, the prefix and six characters, only under prefixes the tests make, and no
  product code makes any of them; each `.seen` file by its name and the fake editor's
  `seen:` mark. The repository's own ignored `tmp/` holds route scripts and logs from
  earlier CRs, not test homes, and was left alone.
- **The first one, fixed.** `skillTurnsRoute.test.ts` left six homes a run; `f5636940`
  records each home and closes and removes it in one `test.after`, as `storyWorld`
  does, with the homes made under `os.tmpdir()`. Checked with `TMPDIR` pointed at an
  empty directory: the five tests pass and the directory is empty afterwards.
- **Planning's measurements**, Node 26.12.1, 2026-10-24, in scratch folders removed
  after. Hook order: an `after` registered when a helper is imported ran first, then the
  file's `after`, then its `test.after`. Removal on the process's `exit` event, with
  `TMPDIR` at an empty directory each time: a file with a failing test still failed
  (exit 1) and left nothing; the file's own `after`, writing into its home, still found
  it; a name filter, `--test-isolation=none` across two files, and default isolation
  each left nothing; a WAL database left open in a home removed under it reported no
  error. The suite's leaking files reach `/tmp` only through the forms step 5 names: a
  `/tmp` string or template given to `mkdtempSync`, and `realpathSync("/tmp")` (in
  `runtime/diagnose`); no `/tmp` is held in a variable.

## Outcome

Open.
