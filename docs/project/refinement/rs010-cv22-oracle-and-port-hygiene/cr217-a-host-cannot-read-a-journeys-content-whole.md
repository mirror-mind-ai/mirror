[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR217 · A host cannot read a Journey's content whole, only its collapsed description

## Problem

A host that embeds this core reads Journeys through `readJourneyTree` (CV24.DS3). Each node
carries `description`: the body of `## Description` or `## Descrição`, cut at the next `## `
and collapsed into one line (`ts/src/journey/journeyTree.ts`, `nodeOf` and `collapse`). No
call answers with the rest of the Journey's content, although that content is what the
runtime delivers to every turn (`ts/src/mirror/context.ts`, `getIdentityContent(db,
"journey", key)`).

Mirror Desktop's Journey Briefing panel shows a Journey's briefing from that `description`, so
a Journey whose content carries several sections (a field, its trails, a current focus) shows
one flattened paragraph and loses its paragraph breaks.

## Expected Behavior

- A host can read one Journey's content exactly as it is stored, with its identity, name and
  `updatedAt`, without reading the whole tree.
- `readJourneyTree` and its `description` keep their behavior: sidebars and listings depend on
  them.

## Plan Or Decision

Captured 2026-11-21 at the Navigator's word, from Mirror Desktop CR263. Design approved by the
Navigator on 2026-11-21. Driver: @alissonvale. Delivery: a PR from
`cr217-read-a-journeys-briefing-whole`.

- **One read, not a field on the tree.** `readJourney(dbPath, { journeyId })` in
  `ts/src/conversation/hostReads.ts`, beside the tree, answers `{ id, name, content,
  updatedAt }`. `content` is the identity row's content, uncut, or `""` when it has none;
  `name` follows the tree's rule (`journeyNameOf`, now shared by both).
- **Why not a field on each node.** The tree is read on a host's turn path, on every sidebar
  reload and on deletion, and a host writes it to its cache each time. In the Navigator's home
  the 67 Journeys' contents add up to about 160 KB (2.4 KB on average, 26 KB at most), which
  only one panel needs.
- **Refusals.** A Journey that does not exist is refused with `JourneyCallRejectedError`
  `unknown_journey`; a request without a non-empty string `journeyId`, with `invalid_request`.
  Like every DS3 read, a home that is not `current` is refused with `DatabaseNotCurrentError`,
  opened read-only, never migrated, and `MIRROR_HOME` is never read.
- **Additive.** `mirror-mind/desktop` re-exports `readJourney`; `DESKTOP_API_VERSION` stays
  `1`, since no name is removed or changes meaning.

### Non-goals

- Cutting or rendering the content. Which lines a host shows is the host's decision; the core
  answers the text the runtime delivers.
- A CLI verb. `mirror identity get journey <id>` already prints the content.

### Acceptance

- `readJourney` answers a Journey's content byte for byte, with its sections and paragraph
  breaks, and the tree's `description` for the same Journey is unchanged.
- A Journey with no content answers `content: ""`; an unknown one is refused
  `unknown_journey`.
- The read writes nothing and refuses a home that is not `current`, as the other DS3 reads do.

## Evidence

Read on 2026-11-21 against `origin/main` (`7e85536c`):

- `ts/src/journey/journeyTree.ts`, `nodeOf`: `description` from one section, collapsed.
- `ts/src/conversation/hostReads.ts`: three reads, none answering a Journey's content.
- `lib/desktop.js`: no export that does.
- Mirror Desktop `src/app/App.tsx` passes `selectedJourneyItem.description` as the panel's
  briefing.
