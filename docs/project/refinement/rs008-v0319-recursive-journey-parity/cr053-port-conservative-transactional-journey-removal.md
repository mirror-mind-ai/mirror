[< RS008](index.md) · [Canonical status](../index.md#change-requests)

# CR053 — Port Conservative Transactional Journey Removal

## Problem

`v0.31.9` added a conservative journey-removal domain operation: only an empty leaf may
be deleted, association checks and deletion occur under `BEGIN IMMEDIATE`, and no child
is reparented or associated record cascaded. The TS core has a reusable immediate
transaction helper but no equivalent journey association inventory or removal
operation.

Removal has no public UI today, yet Python cannot be retired while it remains the only
implementation of this domain behavior.

## Expected Behavior

TypeScript refuses removal when the journey does not exist, has child journeys, or is
referenced by any known journey path, conversation, memory, task, attachment, runtime
session, Explorer story, Builder refinement story, change request, or refinement
cursor. The check and delete execute atomically in an immediate transaction.

Only an empty leaf is removed. Failure leaves all state untouched. There is no cascade,
automatic reparenting, orphan creation, filesystem deletion, or public removal UI added
implicitly by this CR.

## Impact

Without this operation, Python retirement remains incomplete. A weaker TS deletion
would risk orphaning durable personal and Builder data under concurrency.

## Plan Or Decision

Not planned. Planning should verify the current schema inventory, define a typed
association result, reuse the writable database transaction seam, reproduce Python
error behavior where observable, and validate success, every blocking association, and
the check-then-delete race on isolated database copies.

## Evidence

No `removeJourney`, `deleteUnassociatedJourney`, `countJourneyAssociations`, or journey
association guard was found under `ts/src` at remote commit `ea54d4c`.
`ts/src/db/database.ts` already provides an explicit `BEGIN IMMEDIATE` helper that may
be reused after planning.

## Outcome

Captured. No deletion path, public UI, assignment, or focus was created.
