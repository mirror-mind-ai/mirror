[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR097 — New record ids are 32 bits because the oracle's were, and `messages` already collides

**Refinement Story:** RS010 — CV22 Oracle And Port Hygiene
**Status:** captured
**Driver:** —
**Delivery:** —

## Problem

`newId()` (`ts/src/util/pyGenerators.ts`) returns
`randomUUID().replace(/-/g, "").slice(0, 8)`: eight hex characters, 32 bits.
It gives conversations, messages, memories, and most other rows their primary
key. It is 32 bits because Python's `_uuid()` was `uuid4().hex[:8]`, and the
port kept the width so its goldens and injected id sequences would line up
with the oracle. The oracle was deleted by CV22.DS10.TS5, so the width no
longer has a reason. It is the same kind of choice as CR095: parity whose only
justification was the oracle.

The odds grow with the square of the table. Measured on a copy of a real home
(the TS5 walk's, 2026-09-25), with 33,341 messages:

- a single new message collides with an existing id about once in 129,000;
- a session-start import of several hundred messages collides about once in
  200 to 500;
- the expected number of collisions over the table's life is already about
  0.13.

One has probably happened. Production's `hooks.log` recorded
`claude:session-start: UNIQUE constraint failed: messages.id` on 2026-09-24.
The TS5 inventory attributed it to "two transcript backfills overlapping", but
that mechanism cannot produce this error on that path. Every inserted message
draws a fresh random id, and the session binding is checked inside a
transaction, so overlapping writers duplicate rows or do nothing. They cannot
collide on the key.

Today a collision is loud and recoverable. The insert fails, the import's
transaction rolls back, and the next session start retries with fresh ids.
The cost is a failed hook, a `hooks.log` line, and that run's maintenance.
There is one place where a collision would be silent: exploratory stories are
written with `ON CONFLICT(id) DO UPDATE`. A new story whose id matched another
journey's would overwrite that story's content. That table is small, so the
odds are negligible, but it is the one silent path.

## Expected Behavior

New rows get ids wide enough that a collision is not a practical event: at
least 64 bits, or a whole UUID. Existing 8-character ids keep working, since
the columns are `TEXT` and nothing parses them. Every renderer that shows an
id's first eight characters keeps doing so, and the upsert on exploratory
stories cannot overwrite a row it did not mean to.

## Impact

Low today, rising. Nothing has been lost, but the chance of a failed import
grows with every message, and the fix only gets more valuable. It must not
change a rendered byte: the renderers already truncate ids to eight
characters.

## Plan Or Decision

Not planned. Captured without selecting; Current Focus unchanged. For
whoever plans it: check whether any frozen golden records a *generated* id's
width rather than an injected sequence. Not verified at capture. A golden
that moves with the width is recording the generator, not the product.

## Evidence

- `ts/src/util/pyGenerators.ts` — `newId()`, and the comment naming Python's
  `_uuid()`.
- `ts/src/conversation/sessionImport.ts`, `transcriptBackfill.ts`,
  `logger.ts`: every message insert draws `deps.newId()`.
- `ts/src/explorer/story.ts` — the upsert; `ts/src/frontDoor/exploreRoute.ts`
  wires `uuid: newId`.
- The arithmetic: p(one new id collides) = n / 2^32; expected lifetime
  collisions ≈ n² / 2^33.
- [CV22.DS10.TS5 handoff review, Q1](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts5-python-core-deletion/handoff-review.md#q1--the-messagesid-failure-has-a-different-mechanism-than-recorded-database-architect).

## Outcome

Open.
