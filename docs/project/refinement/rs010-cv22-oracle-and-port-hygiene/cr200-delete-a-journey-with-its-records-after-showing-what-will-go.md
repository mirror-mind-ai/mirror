[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR200 · Delete a Journey with its records, after showing what will go

## Problem

`deleteJourney` (CV24.DS8) deletes only an empty leaf. `removeJourney` refuses a Journey with any
associated record: conversations, memories, tasks, attachments, journey paths, runtime sessions,
explorer and refinement stories, change requests, cursors. A Journey no longer needed has to be
emptied by hand, record by record, and a host has no call that can do it.

Nautilus for Mirror (formerly Mirror Desktop) asked for one act in its RS028 (CR204 there): delete a
Journey and everything that belongs to it, after a confirmation that lists what will go, behind a
backup. Its Navigator decided what each record does on 2026-11-05 and 2026-11-06.

## What a long-lived home showed before the design

Read from a copy of the Navigator's production home (2026-11-06):

- **956 memories belong to a Journey other than the conversation they came from.** 293 came from
  `mirror-mind` conversations alone. Memories are filed under the Journey they are about. Deleting a
  conversation's memories with it would delete other Journeys' history; foreign keys being on, the
  alternative is a deletion that fails.
- 274 memories with no Journey came from a conversation that has one; 101 runtime sessions name a
  conversation of another Journey.
- One extension, `maestro`, keeps rows keyed by Journey in four `ext_maestro_*` tables. The `maestro`
  Journey itself has two. A rule that refused any Journey with extension rows would refuse exactly
  the deletion the Navigator wanted to try first.
- The `scene_orientation` layer, from the Python era and read by no TypeScript code, keys rows as
  `journey:<id>`.

## Expected Behavior

Two calls on `mirror-mind/desktop`, whose principle the Navigator named: **transparency rather than
refusal**. The host shows everything that will change; the act refuses only what it cannot do
safely.

`previewJourneyDeletion(dbPath, { journeyId })` reads and changes nothing. It answers the Journey's
child Journeys, the counts of each record kind under the four rules below, the extension rows by
owning extension, and a digest over all of it.

`deleteJourneyWithRecords(dbPath, { journeyId, expectedDigest })` takes the digest back. Under one
immediate transaction it re-reads the preview and refuses `journey_changed` when the digest differs,
refuses `journey_has_children` naming the children, takes a backup with a name never reused
(`backups/pre-journey-deletion-<id>-<UTC stamp>-<random>.db`, 0600), verifies that the backup reads
as the same preview, and only then deletes. It answers the tree, the preview it acted on and the
backup's path, hash and size. A refusal writes nothing and leaves no backup.

The rules:

1. **A record that is the Journey's own is deleted**: its row, journey path, `journey:<id>` scene
   orientation, identity integrations, conversations, memories, tasks, attachments, runtime
   sessions, explorer and refinement stories, change requests and refinement cursor.
2. **What belongs to a deleted conversation or memory goes with it**: messages, summary embeddings,
   provider calls (`llm_calls`) and memory access log entries. Discarding one conversation keeps its
   provider calls (`conversationDeletion.ts`); deleting a Journey takes them, because their prompts
   are the Journey's own words.
3. **Another Journey's record that only points at something deleted is kept, its link cleared**:
   memories and runtime sessions of a deleted conversation, identity integrations naming a deleted
   conversation or memory, change requests and cursors naming a deleted story or change request.
4. **An extension row that names the Journey is deleted**, in a column called exactly `journey_id`
   or `journey` of an `ext_*` table, and the preview names the installed extension whose
   `ext_<id>_` prefix the table carries (null when none does). A table without such a column is
   never searched. A row another row still holds by foreign key refuses the whole deletion with
   `extension_rows_held`, naming the table: releasing it is the extension's job.

`journey_mutation_receipts` is kept: it is the administration's audit of what was done to the tree.

## Why a named backup

The front door's pre-write snapshot (`frontdoor-pre-write-backup.db`) has a fixed name and is
replaced before every routed write, a turn's append included, so it would hold the deleted records
for seconds. `migrateHome` (CV24.DS5) already takes a uniquely named, verified, retained backup for
an act that cannot be undone without one; this follows it. The core never deletes the file.

## Boundaries

- Child Journeys are not deleted with their parent. The host names them, and the person moves or
  deletes them first.
- Files on disk, the Journey's project folder included, are not the core's: a host that offers to
  delete them does so itself.
- A running agent anywhere in the Journey is the host's to know and refuse.
- `deleteJourney` and `removeJourney` are unchanged.

## Validation

`ts/test/journey/journeyDeletion.test.ts`, in a home `createHome` made:

- the preview counts every rule exactly and writes nothing; it names child Journeys;
- the deletion removes rules 1, 2 and 4, keeps rule 3's rows with only their links cleared, leaves
  other Journeys' records and extension rows alone, and `PRAGMA foreign_key_check` is empty;
- the backup is retained, named, 0600, hashed, reads as the home before the deletion, and is the only
  one; a backup that does not read as the preview is refused and removed;
- a stale digest, child Journeys and a held extension row each refuse, write nothing and leave no
  backup; an unknown Journey, a malformed request and a database that is not current are refused;
- **the closed inventory is read from the schema**: a core table that names a Journey, or that
  references a row the deletion removes, without a decision in `JOURNEY_DELETION_INVENTORY` fails
  the test. Its first run found `journey_mutation_receipts`.

Ten mutations, each caught: acting on a stale preview, cascading through children, keeping the
Journey's provider calls, deleting other Journeys' memories with the conversation, leaving the scene
orientation, skipping the backup's verification, leaving a refused deletion's backup, a raw error
for a held extension row, an unnamed extension owner, and searching every extension table.

Once the deletion has committed, the backup is kept whatever fails after it (reading the tree back,
for instance); only a refused deletion removes its backup.

Full gate, run with a clean environment and a throwaway `HOME` (2026-11-06): 3796 tests, 3792 pass,
1 fails. The failure, `runtime/diagnose.test.ts` "the two cores describe a broken index with the
same driver text", fails identically on a clean worktree of `origin/main`: the Node 24.6.0
`node:sqlite` build lets a write to an FTS5 shadow table through. It is not this change's.

The same suite run with the environment a Nautilus shell inherits (`MIRROR_HOME`, `DB_PATH` and the
other `MIRROR_*` variables pointing at a real home) wrote into that home and reported nine other
failures. The suite has no guard against an inherited home; that is worth its own Change Request.
