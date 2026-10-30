[< CV24](../index.md)

# CV24.DS8 — Administer Journeys as Calls

**Status:** 🟠 Implemented — on branch `desktop/library-seam-1a`, not released
**Consumer:** Mirror Desktop's CV-010.DS-005, phase 4, slice 4b.

## Outcome

A host that embeds this core creates, edits, moves and deletes Journeys through five calls, each
answering with the home's Journey tree as `readJourneyTree` reads it. Mirror Desktop 0.2 did four of
these through Python's `journey mutate`, which this core retired; the fifth, editing a Journey's name,
description and status, no released Mirror had (Mirror Desktop's CR100 and CR130).

## Why

Desktop 0.3 creates a home seeded with the template Journeys and cannot add one: the core's
`createJourney` is unexported, and Desktop's administration route answers "not carried". Daily use on
a new home needs Journeys of its own.

Name and description were never editable from Desktop. Python updates title and status only through
its web server, bypassing the receipt ledger, and nothing updates a description. Desktop shows them
read-only (CR130) and parked the debt as CR100.

## The Calls

Each takes an explicit database path first, never reads the environment, refuses a database that is
not `current` with `DatabaseNotCurrentError` (CV24.DS2), and writes through `openLiveWriteDatabase`,
the same verified pre-write snapshot the front door's writes take. Each write is one immediate
transaction. Each answers `{ journeyId, tree }`, the tree read on the same connection after commit.

| Call | Request | Writes |
|---|---|---|
| `addJourney` | `{ slug, name, description, parentId?, position?, projectPath? }` | a new Journey |
| `updateJourney` | `{ journeyId, expectedUpdatedAt, name?, description?, status? }` | its content; `display_name` when present |
| `setJourneyProjectPath` | `{ journeyId, projectPath }`, `null` to clear | `project_path` |
| `moveJourney` | `{ journeyId, parentId, position }` | `parent_journey`, sibling positions |
| `deleteJourney` | `{ journeyId }` | removes an empty leaf |

A refusal is a `JourneyCallRejectedError` with a `reason`; nothing is written.

### Ported rules (from `journey mutate`, Python 0.31.14)

So the requests Desktop already sends mean what they meant on 0.2:

- **Slug:** `^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$`, not taken → else `invalid_or_duplicate_slug`.
- **Name:** trimmed, 1 to 160 characters → else `invalid_name`.
- **Description:** trimmed, 20 to 4,000 characters → else `invalid_description`.
- **Parent:** an existing Journey, or none for a root → else `unknown_parent`. A move whose parent is
  the Journey, a descendant of it, or on a broken lineage → `invalid_parent` (the core's
  `validateParentJourney`).
- **Position:** an integer from 0 to the number of siblings → else `invalid_position`. Default for a
  new Journey: last. The sibling set is renumbered 0..n into `sibling_position`; a move renumbers
  the set it left.
- **Project path:** an absolute path to an existing directory that is not a symlink, stored resolved
  → else `invalid_path`. Python expanded `~`; these calls do not, since they read no environment.
- **New content:** Python's template, byte for byte: `# <name>`, `**Status:** active`,
  `**Stage:** Starting`, `## Description`, `## Current focus` ("Clarify the next concrete
  movement."). Metadata `display_name`, and `parent_journey`, `project_path`, `sibling_position`
  when set. The migration-017 `parent_journey` column is written in the same transaction, as
  `createJourney` and `setParentJourney` do.
- **Delete:** the core's `removeJourney`: an existing leaf with no associated records →
  `unknown_journey` or `journey_not_empty` with the populated classes listed.

### `updateJourney` (new)

- `expectedUpdatedAt` is the Journey's `updatedAt` from the tree the host showed. If the row's
  `updated_at` differs, the call refuses `journey_changed`. A terminal edit after the host read the
  tree is never overwritten silently. This stands in for 0.2's whole-tree `sourceVersion`, which
  refused any change to any Journey (Desktop's CR110).
- At least one of `name`, `description`, `status`; an unchanged value writes nothing and keeps
  `updated_at`.
- **Name:** Python's `_replace_title`: the first `# ` line becomes `# <name>`, or one is prepended.
  When metadata holds `display_name`, which the tree reads before the heading, it is set to the same
  name; when it does not, none is added.
- **Status:** Python's `_validate_status` and `_replace_status`: `active`, `completed`, `paused` or
  `planned` (lower-cased) → else `invalid_status`; the `**Status:**` line is replaced, or inserted
  after the title.
- **Description:** the body of the first `## Description` or `## Descrição` section, up to the next
  `## ` heading, becomes the new text. Without that section, `## Description` is inserted before the
  first `## ` heading, or appended. Everything else in the content is kept as it was.

Writing the content keeps the row's `version` and `metadata`, as Python's `update_identity_fields`
does.

## What Changes in Existing Code

Only additions, so the terminal's behaviour cannot change:

| File | Change |
|---|---|
| `lib/desktop.js` | Re-exports the five calls and `JourneyCallRejectedError`. |

Everything else is new: `ts/src/journey/journeyCalls.ts` and its test. It reuses exported functions
unchanged: `upsertIdentity`, `updateIdentityMetadata`, `withTransaction`, `validateParentJourney`,
`removeJourney`, `buildJourneyTree`, `inspectMigrationState`,
`openLiveWriteDatabase`. No terminal test changes; the one existing test touched is the entry's own
name list (`desktopEntry.test.ts`).

Not reused: `createJourney` and `setParentJourney` each open their own transaction and write no
`display_name` or `sibling_position`, so creating with a position would take two transactions.

## Exclusions

- Changing a Journey's id (slug). It keys Conversations, memories, tasks and Builder records;
  changing it is a migration.
- `icon`, `color`, `sync_file`, `stage`, the Journey path layer.
- The receipt ledger (`journey_mutation_receipts`) and request-id idempotency. A retried create
  answers `invalid_or_duplicate_slug`, which a host can read back from the tree.
- Expanding `~` in a project path.

## Validation

Tests with a home `createHome` made: each rule above and its refusal, that a refusal writes nothing,
the template content byte for byte, the renumbering on create and move, the 017 column, `display_name`
kept in step, the description section replaced and inserted with the rest of the content intact,
`journey_changed`, the unchanged-value no-op, the snapshot taken, and a non-current database refused.
Mutation controls as in DS1–DS7. The whole suite passes with no terminal test changed.
