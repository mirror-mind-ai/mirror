[< CV24](../index.md)

# CV24.DS3 — Journey Reads

**Status:** 🟠 Implemented (2026-10-28) on branch `desktop/library-seam-1a`. Not merged, not released.

## Outcome

A host renders its sidebar from three reads through `mirror-mind/desktop`. None of them uses the CLI
or Python, and none of them writes:

1. **`readJourneyTree(dbPath)`** returns every Journey as a tree. Each node carries:
   - `id`, `name` and `updatedAt`;
   - when present, `status`, `stage`, `description`, `parentId`, `projectPath` and
     `siblingPosition`;
   - `children`.

   It also returns `findings`, which name any data it had to read around.
2. **`listJourneyConversations(dbPath, { journeyId, limit })`** returns a Journey's Conversations,
   newest first. Each entry carries `conversationId`, `title` (or null), `startedAt`,
   `messageCount` and `persona` (or null). The limit runs from 1 to 100.
3. **`inspectConversation(dbPath, { conversationId })`** looks up one Conversation by exact id. It
   returns `conversationId`, `journeyId`, `title`, `startedAt`, `endedAt` and `messageCount`, or
   refuses with `conversation_unavailable`.

## A New Contract, Not a Revival

Mirror Desktop's 0.2 line built its Journey tree from `journey export-registry`.
[CV22.DS10.TS4](../../../../releases/pending-cutoffs.md#journey-admin-verbs) retired that verb. Its
cutoff says that a future consumer needing a machine-readable registry gets "a new contract with a
named consumer, not a revival of this one". This is that contract, and the named consumer is
Mirror Desktop 0.3. So:

- It is a library function. No CLI verb comes back, and the retired verb keeps answering *removed*.
- It drops `sourceVersion`. That hash existed only so that `journey mutate` could detect a stale
  write, and `journey mutate` stays retired.
- It has no `schemaVersion`, `source` or `syncedAt` envelope. Those served the dump's file on disk,
  and the host can stamp its own.

## Measured Before Planning

- **The read side of Conversations is ported.** `listRecentConversationSummaries`
  (`conversation/listing.ts`) is the same query as Python's `list_recent`.
- **The Journey hierarchy is ported, but not its order.** `listJourneyOptions`
  (`journey/journeyOptions.ts`) takes parentage from `resolveParentJourney`, the metadata authority.
  It sorts siblings by active-first and then by name. **Nothing in `ts/src` reads
  `sibling_position`.**
- **Production carries an order of its own.** In the Navigator's production home, read-only:
  - 81 Journeys in all;
  - **65 carry `sibling_position`**, written through Desktop's Journey ordering;
  - 76 carry `project_path`.

  A tree in the core's existing order would silently reorder the Navigator's sidebar on the day of
  the migration (DS-005 phase 5).
- **The removed export's rules** (Python `JourneyAdminService.export_registry`, read in the
  installed 0.31.14):
  - the `name` is `display_name`, then the content's first `# ` heading, then the key;
  - `status` and `stage` come from `**Status:**` and `**Stage:**` lines;
  - `description` is the collapsed body of `## Description` or `## Descrição`;
  - siblings sort by an integer `sibling_position`, then by key, with unpositioned siblings last;
  - a malformed order or a cycle **failed the whole export**.

## Decisions Inside the Plan

- **Order:** honour `sibling_position` exactly as the removed export did. It is data in the row,
  and reading it changes nothing.
- **Malformed data does not fail the read.** The read is the sidebar's only source, so failing would
  leave it empty. The tree falls back deterministically, and each fallback is a `finding`:
  - a sibling set with duplicate, negative or non-integer positions is ordered by key, with the
    finding `malformed_order`;
  - a cycle, or depth past 16, attaches the offending node as a root, with the finding
    `malformed_hierarchy`.

  The removed export exited instead in both cases.
- **The names are the export's rules,** not `listJourneyOptions`'s first-line rule. Desktop's users
  see the export's names today, and the two rules differ when a Journey has `display_name`.
- **A host's fallback title,** such as "Untitled conversation", stays the host's. The core returns
  `title: null`.

## Custody

All three reads open the database read-only, after DS1's report says it is `current`. They refuse
anything else with `DatabaseNotCurrentError` and never migrate. As measured in DS1, the only trace
on a WAL database is `-wal` and `-shm`.

## Acceptance

- **The tree.** Fixtures cover:
  - nested Journeys three levels deep;
  - positioned and unpositioned siblings;
  - each of the three name sources;
  - `status`, `stage`, `description` (both headings), `parentId`, `projectPath`;
  - a node with no children, which carries no `children` key, as the export did;
  - one fixture per finding, where the tree is still complete and every Journey appears exactly
    once.
- **Parity with the removed export.** The check runs on a **scratch copy** of the production home,
  made through SQLite's backup API, never on the home itself:
  - the installed Python 0.31.14 exports the registry from the copy;
  - `readJourneyTree` reads the same copy;
  - with the three dropped envelope fields and `nativeId` removed, the two trees must be equal.

  Only the counts and a hash of the result are recorded. No production data is committed. The copy
  is deleted afterwards.
- **The catalog:**
  - Journey filter, newest first, the limit's bounds, and message counts;
  - another Journey's Conversations never appear;
  - `inspectConversation` takes an exact id only, so a prefix is refused.
- **Custody:**
  - a home at 016 is refused, and so is a missing one, which is not created;
  - the bytes are unchanged and no backup is taken;
  - `MIRROR_HOME` aimed at a canary is ignored.
- **The installed entry.** Step 7 of the package smoke runs the three reads from the tarball.
- **Mutation controls.** Each of these fails a test:
  - sorting siblings by name instead of position;
  - throwing on `malformed_order`;
  - a prefix lookup in `inspectConversation`;
  - skipping the `current` check.

## Exclusions

- Writing `sibling_position`, or any Journey administration. 0.3 does not carry Journey
  administration at first (DS-005).
- The Canvas and altitude read models.
- Recall, conversation delete and memory reads.
- No CLI verb, no release, and no change to `journeys` or `journey <slug>`.

## Validation

- typecheck, lint, `npm test` against DS2's baseline (3,552 passing, plus the local-only diagnose
  failure), and the package smoke;
- Core CI dispatched on the branch;
- every command under DS1's isolation, with the production ledger read before and after.

## Built (2026-10-28)

### What changed

- **`ts/src/journey/journeyTree.ts`** holds `buildJourneyTree(rows)`. It is pure, with the export's
  node rules and sibling order, and it names findings instead of failing.
- **`ts/src/conversation/hostReads.ts`** holds the three reads:
  - `readJourneyTree`;
  - `listJourneyConversations`, which builds on the ported `listRecentConversationSummaries`;
  - `inspectConversation`.

  Each opens a `current` home read-only. They reuse DS2's two errors.
- **`lib/desktop.js`** re-exports the three reads, for 11 names in all. `DESKTOP_API_VERSION` stays
  at 1, because the change is additive.
- **Package smoke, step 7,** runs the three reads from the installed tarball.

### Parity with the removed export

The check ran on the Navigator's production home, through scratch copies only:

1. **Copies.** Two copies were made through SQLite's read-only backup API. That read updated the
   production `-shm`, as every SQLite reader does, and changed nothing else.
2. **Python.** The installed Python 0.31.14 ran `journey export-registry` on one copy.
   - `MIRROR_HOME` and `MIRROR_USER` both named the copy, so the checkout's `.env` could not
     redirect it.
   - A file snapshot of the production home taken around a second run was unchanged.
   - Two runs gave the same tree.
3. **TypeScript, two ways:**
   - `buildJourneyTree` read the 016 copy's rows;
   - `readJourneyTree` read the other copy after `ensureMigratedOnOpen` brought it to current.

**Result.** 81 Journeys in 13 roots. Both TypeScript trees are **equal** to the export's, with
`nativeId` and the envelope removed. There were no findings, and the tree's canonical hash is
`2a153cacdbdb`. A name-ordered tree (mutation 1) makes the comparison fail. No production data was
committed, and the copies were deleted.

### Evidence

- **`ts/test/journey/journeyTree.test.ts`**, 9 tests. They cover:
  - the fields and the three name sources;
  - both description headings;
  - position, then key, with the unpositioned last;
  - an orphan parent and malformed metadata;
  - five malformed orders;
  - a cycle, and a 21-node chain cut at depth 17. Every Journey appears exactly once.

  One test's expected value had a misplaced bracket. It was corrected; the code was not changed.
- **`ts/test/conversation/hostReads.test.ts`**, 6 tests. They cover:
  - the stored order;
  - the catalog's filter, order, counts and limit bounds;
  - exact-id inspection;
  - refusal of a home at 016 and of a missing home;
  - no write, and no `MIRROR_HOME`.

  Both files were red first, on missing modules. The entry test was red, then green, with 11 names.
- **Mutations, each caught and then restored:**
  - name order: 3 failures, and the parity check failed too;
  - throwing on `malformed_order`: 1;
  - a prefix in `inspectConversation`: 1;
  - no `current` check: 1.
- **Gates:**
  - typecheck: clean;
  - lint: clean, apart from the baseline warning;
  - `npm test`: 3,567 passed, 1 skipped, and the local-only `diagnose` failure;
  - package smoke: 87 of 87.
- **Production** stayed at migration 016.

