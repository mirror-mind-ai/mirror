[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR218 · A host cannot list a Journey's memories, so it reads the `memories` table itself

## Problem

A host that embeds this core has no call that answers the memories Mirror kept for one
Journey. The listing exists, but only behind the CLI: `listRecentMemorySummaries` and
`countMemoriesByType` in `ts/src/memory/listing.ts` filter by `journey`, and `mirror
memories --journey <id>` renders them. `mirror-mind/desktop` exports neither, and
`ts/src/conversation/hostReads.ts` has no read of memories.

Nautilus for Mirror needed that list for its Journey memory panel (Nautilus PR #30, CR286 in
its workbench), so its host opens the home's database read-only and queries `memories`
directly. That works today, but it binds the app to this core's schema (`018_drop_hook_injected`)
outside the contract the other host reads keep: a column renamed or a readiness state added
here would break the app without any change to `DESKTOP_API_VERSION`.

## Expected Behavior

- A host can list one Journey's memories, newest first, with a bounded limit, and the counts
  by type over all of them, through `mirror-mind/desktop`.
- Each memory carries what a reading surface needs: id, type, layer, title, content, persona,
  tags, `createdAt`, and the Conversation it came from when known.
- The read behaves like the other host reads: opened read-only, never migrated, refused on a
  home that is not `current`, and `MIRROR_HOME` never read.

## Plan Or Decision

Captured 2026-11-25 at the Navigator's word, from Nautilus CR286, to be done later. No design
approved yet; no Driver or Delivery.

A starting point, not a decision: `listJourneyMemories(dbPath, { journeyId, limit })` beside
`readJourney` in `hostReads.ts`, reusing the query builder in `listing.ts` rather than writing a
second one, and re-exported additively so `DESKTOP_API_VERSION` stays `1` (the CR217 pattern).

### Open questions

- Whether the read answers memories of every layer or only those the runtime hands to a
  Journey's turns (`readiness_state`, `layer`).
- The limit's default and ceiling. The Nautilus host uses 200 and 1000.
- Whether a Journey that does not exist is refused `unknown_journey`, as `readJourney` does, or
  answers an empty list.

### Non-goals

- Search or ranking. `mirror memories --search` already reuses the hybrid ranker.
- Changing a memory. Forgetting one is CR219.

### Acceptance

- The read answers the same memories, in the same order, as `mirror memories --journey <id>`
  for the same limit, and counts that agree with `countMemoriesByType`.
- It writes nothing and refuses a home that is not `current`.
- Nautilus can replace its direct query with this call and remove its knowledge of the table.

## Evidence

Read on 2026-11-25 against `origin/main` (`4ceb76d9`):

- `ts/src/memory/listing.ts`: `ListRecentFilters.journey`, the CLI's listing.
- `ts/src/conversation/hostReads.ts`: no read of memories.
- Nautilus PR #30, `mirror-host/host.mjs`: `listJourneyMemories` queries `memories` through
  `node:sqlite` in read-only mode.
