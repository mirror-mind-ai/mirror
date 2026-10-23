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

## Evidence

- **One full run on `main` at `f5636940`**, 2026-10-24: 3,448 tests, none failing, 53
  seconds. The two temp folders listed before and after: 372 new entries in `/tmp` and
  77 in the system temp folder, each traced to a test: 448 directories from 40 test
  files, and one `.seen` file. The largest: `mcp/support/fixture.ts` 58 (one shared
  fixture behind the MCP tool tests), `soul/state.test.ts` 40,
  `conversation/replyLogging.test.ts` 34, `conversation/loggerCli.test.ts` 32,
  `backup/zipBackup.test.ts` 26, `conversation/journeyRepair.test.ts` 24.
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

## Outcome

Open.
