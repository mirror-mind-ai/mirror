[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR219 · A memory that no longer holds cannot be forgotten, only buried with its whole Journey

## Problem

Mirror extracts memories from Conversations and hands them back to later turns. Some stop
being true: a decision reversed, a learning that was a misreading, a detail the person would
rather Mirror did not keep. Nothing in this core removes one memory. The only `DELETE FROM
memories` is in `ts/src/journey/journeyDeletion.ts`, which removes every memory of a Journey
as part of deleting the Journey. The CLI has no verb for it, and `mirror-mind/desktop` exposes
no call.

Nautilus for Mirror now shows a Journey's memories (Nautilus PR #30, CR286 in its workbench).
Its panel says, in its source, that "a memory that no longer holds is a matter for Mirror, not
for this panel". A person who reads a wrong memory there has nowhere to take it.

## Expected Behavior

- A person can forget one memory by its id, from the CLI and from a host, after seeing what
  will go.
- Forgetting removes the memory and what exists only because of it, in one transaction, and
  leaves every other record intact and pointing at nothing that is gone.
- A memory forgotten stays forgotten: it is not handed to a turn, found by search, or
  proposed again by consolidation from the same evidence.

## Plan Or Decision

Captured 2026-11-25 at the Navigator's word, from Nautilus CR286, to be done later. No design
approved yet; no Driver or Delivery.

What a forgetting touches, read from the schema and from Journey deletion, which already
removes memories in an order every foreign key accepts:

- `memories`: the row, with its `embedding`. The `memories_fts_ad` trigger removes the
  full-text entry.
- `memory_access_log`: rows with its `memory_id`, deleted first, as Journey deletion does.
- `identity_integrations.journal_id`: a journal is a memory, so an integration that points at
  it is unlinked (`SET journal_id = NULL`), as Journey deletion does for another Journey's.
- `consolidations.source_memory_ids`: the JSON array of memory ids behind each merge,
  identity-update and shadow-candidate proposal, not a foreign key. Whether a forgotten id is removed from them, left as a dangling
  reference the renderers tolerate, or makes a pending proposal stale is a design question.

A starting point, not a decision: a preview and a forget, in the shape of
`previewJourneyDeletion` and `deleteJourneyWithRecords` (CR200) and of `previewPersonaDeletion`
and `deletePersona` (CR207),
with a `mirror memories forget <id>` verb that shows the preview and asks before it acts.

### Open questions

- Hard delete or a tombstone. A tombstone (a state the runtime never delivers) is reversible
  and lets learning skip what was forgotten; a hard delete is what "forget" says to a person.
  The Navigator's request was the deletion of the record.
- Whether a forget takes a verified backup first, as Journey and persona deletion do
  (`verifiedJourneyDeletionBackup`, `verifiedPersonaDeletionBackup`), or whether that is too
  heavy for one record.
- Whether learning can extract the same memory again. Learning reads only past a watermark
  (`learned_through`, `ts/src/conversation/learnFromConversations.ts`), so the same stretch is
  not read twice, but a later turn may restate it.
- Forgetting several at once, or every memory of one Conversation.

### Non-goals

- Editing a memory's text.
- Nautilus's own control for it, which is that app's change once this call exists.

### Acceptance

- After a forget, the memory is absent from `memories`, `memories_fts`, the access log, search,
  and the context delivered to a turn, and no foreign key fails.
- The preview names the memory and every record the forget changes, and the forget changes
  exactly those.
- An unknown id is refused without writing anything.

## Evidence

Read on 2026-11-25 against `origin/main` (`4ceb76d9`):

- `ts/src/journey/journeyDeletion.ts`, `deleteRecords`: the only `DELETE FROM memories`.
- `ts/src/db/schema.ts`: `memories` (with `embedding`), `memories_fts` and its delete trigger,
  `identity_integrations`, `consolidations.source_memory_ids`.
- Nautilus PR #30, `src/app/JourneyMemoryPanel.tsx`: the panel reads and changes nothing.
