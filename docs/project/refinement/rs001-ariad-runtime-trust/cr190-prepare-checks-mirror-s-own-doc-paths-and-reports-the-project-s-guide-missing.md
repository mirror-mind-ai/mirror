[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR190 — Prepare checks Mirror's own doc paths, so a project that keeps its rules in `CLAUDE.md` is reported missing its development guide

## Problem

Prepare's `PREPARE_FIELD_READING` card has a `terrain read` block. It checks three fixed
paths in the target project and marks each one `present` or `missing`: `README.md`,
`docs/project/roadmap/index.md`, and `docs/process/development-guide.md`. The third path
is Mirror Mind's own layout. A project that keeps its rules somewhere else gets a
`○ … missing` row for a file it was never asked to have.

Seen on 2026-11-02, when CV5.DS18.TS3 was pulled in `kia-desktop`:

```text
terrain read
✓ README.md: present
✓ docs/project/roadmap/index.md: present
○ docs/process/development-guide.md: missing
```

kia-desktop has no `docs/process/` directory. Its rules live in `CLAUDE.md` and
`docs/testing.md`, and the block names neither file.

So the card says two things that are not true for this project:

1. The `○ missing` row reads as a gap in the project. The gap is in Prepare's list.
2. `terrain read` claims more than happened. Prepare checks that three paths exist and
   reads none of them. The files whose rules govern the story were never part of the
   reading.

CR019 met this same row on kia-desktop on 2026-09-07 and set the rule: a missing guide
"does not mean the project has no rules; it may keep them where its agents already read
them, such as `CLAUDE.md`." CR019 applied that rule to the Plan and left Prepare's row
as it was.

## Expected Behavior

- Prepare never presents an absent Mirror-layout file as a gap in the target project.
  On kia-desktop, the card no longer shows `docs/process/development-guide.md: missing`.
- The block describes what Prepare actually did, in words that are true for any project.
  If Prepare only checks fixed paths, the card does not call that a reading of the
  project's terrain.
- The card still shows whether the Plan's Implementation Contract will point to a
  development guide. CR019's debt review noted that Prepare's guide row is the only
  place that shows this today.

## Impact

Low. The row is read-only and changes neither the cursor nor any file. What it costs is
trust, which is RS001's outcome: the card does not describe the project's real state.

- It costs Navigator turns. On 2026-11-02, the Driver relayed the row, and the Navigator
  had to ask what the missing guide meant.
- It invites the wrong fix. The obvious way to clear the row is to create
  `docs/process/development-guide.md` in the project. That file would be a second copy of
  `CLAUDE.md`, and since CR019 a guide also adds a pointer line to every Plan's contract.
  Two copies of the same rules drift apart.
- It has stood since at least 2026-09-07, on every story of every project that keeps its
  rules outside Mirror's layout.

## Plan Or Decision

Captured, unassigned, 2026-11-02, at the Navigator's direction, during the Pull of
`kia-desktop` CV5.DS18.TS3.

Not planned. The options below are for Plan; none has been chosen:

- **Smallest:** drop the guide row when the file is absent.
- **Truer reading:** also report the instruction files that runtimes already load
  (`AGENTS.md`, `CLAUDE.md`) when they are present.
- **Per-project guide path:** CR019 excluded this kind of per-project method
  configuration.

Any of the three changes strings the goldens pin, so the goldens move with the fix.

## Evidence

- The `PREPARE_FIELD_READING` surface for `kia-desktop` CV5.DS18.TS3, 2026-11-02,
  Mirror Mind 0.39.0 (`/opt/homebrew/bin/mirror`, the Homebrew package): the three rows
  above.
- kia-desktop on the same date had no `docs/process/` directory, no `AGENTS.md`, and no
  file that mentions a development guide. Its rules were in two files:
  - `CLAUDE.md` (621 lines): commands, the gates to run before every push, working
    rules, architecture, the testing map, and "Before you claim done".
  - `docs/testing.md` (794 lines): the full test-harness guide, split out of `CLAUDE.md`.
- `contextSummary()` in `ts/src/builder/prepare.ts` checks the three fixed paths with
  `existsSync` alone and opens no file. `projectContractRules()`, next to it, already
  documents that "a missing guide says nothing about the project".
- CR019's evidence from 2026-09-07 records the same row on kia-desktop CV8.DS4.TS1–TS3:
  "The Prepare surface for each story reported
  `○ docs/process/development-guide.md: missing`". Its panel's prompt-engineer dissent
  says the same: "kia-desktop, which reported CR019, keeps its rules in `CLAUDE.md`".
- The card strings are pinned by `ts/test/goldens/builder-command.golden.json` and
  `ts/test/goldens/builder-lifecycle.golden.json`. The guide path is pinned by
  `ts/test/builder/prepare.test.ts`.

## Outcome

Pending: captured, not planned.
