[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR202 — A deleted journey leaves its extension bindings behind, and a new journey with the same slug inherits them

## Problem

`_ext_bindings` says which extension capability applies to which persona, journey, or
everything. A journey binding is a row with `target_kind = 'journey'` and the journey's
slug in `target_id`. Journey deletion does not look at it:

- **`deleteJourneyWithRecords`** (`ts/src/journey/journeyDeletion.ts`) removes the
  journey's identity rows, conversations, memories, tasks, attachments, sessions, stories,
  change requests, and refinement cursor, and its rule 4 deletes rows in `ext_*` tables
  that carry a column named exactly `journey_id` or `journey`. `_ext_bindings` is neither:
  its name starts with an underscore, and its journey is in `target_id`.
- **The inventory test** (`ts/test/journey/journeyDeletion.test.ts`) exists so that a
  table that names a journey cannot be forgotten. It skips every table whose name starts
  with `_` and looks for columns whose names contain "journey", so it cannot see this one.
- **`selectExtensionBindings`** (`ts/src/extensions/contextRuntime.ts`) matches
  `target_kind = 'journey' AND target_id = ?` and does not check that the journey exists.
  When a journey with the same slug is created again, the old bindings apply to it, and
  the extension's context sections go into that journey's Mirror context.

The person asked for the journey to be gone, and an extension's context may be sensitive:
it is whatever that extension collects, such as a mailbox or a drive.

The same table matters to a journey rename (CV9.DS11), which does not exist yet.
Bindings that point at the old slug would silently stop applying to the renamed journey.

## Expected Behavior

- The deletion preview lists the journey's bindings, naming the extension and the
  capability, as it does for rule 4's rows, and the deletion removes them in the same
  transaction. If a binding is kept on purpose, the preview says so and why.
- The inventory test covers tables whose names start with `_` and columns named by
  another column's value (`target_kind`), so the next table of this kind fails the test
  instead of passing it.
- A rename moves the bindings with the journey (CV9.DS11).

## Impact

Low today, and quiet when it happens. It needs a journey that had a binding, deleted, and
another journey created under the same slug. The consequence is an extension's context
appearing in a journey that never asked for it, and nothing says why.

## Plan Or Decision

Captured, unassigned, 2026-11-07, from the database-architect's review of the CV9
re-baseline plan ([evidence](../../roadmap/cv9-mirror-1-0/cv9-ds10-the-1-0-done-condition-describes-the-system-that-exists/evidence/2026-11-07-plan-review.md)).
Current Focus unchanged.

Not planned. [CV9.DS11](../../roadmap/cv9-mirror-1-0/index.md#delivery-stories) carries it,
because rename needs the same decision about this table. The first step of its plan is to
reproduce the leak in a scratch home: create a journey, bind a capability to it, delete
it, create it again, and load Mirror's context for it.

## Evidence

Read from code, 2026-11-07, not reproduced:

- `ts/src/journey/journeyDeletion.ts`: `JOURNEY_DELETION_INVENTORY` lists eleven core
  tables and keeps `journey_mutation_receipts` on purpose. It does not name
  `_ext_bindings`, and no code in `ts/src/journey/` mentions it.
- `ts/src/extensions/bindings.ts`: `bind` accepts a journey only when an identity row of
  the `journey` layer exists. `unbind` removes one named binding and the catalog's
  uninstall removes an extension's bindings. Nothing removes a journey's.
- `ts/test/journey/journeyDeletion.test.ts`: the table list excludes `_*` and `ext_*`.

## Outcome

Open.
