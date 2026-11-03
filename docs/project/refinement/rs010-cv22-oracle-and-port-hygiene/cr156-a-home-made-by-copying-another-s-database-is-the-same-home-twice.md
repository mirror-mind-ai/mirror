[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR156 — A home made by copying another's database is the same home twice, and the docs do not say so

## Problem

On the maintainer's machine the development home began on 2026-07-13 as a copy of the
production home's database. A copy carries everything: the `_migrations` ledger, so
both homes give the same birth (2026-03-25), which kept CR121's floor from ever
applying between them; and every conversation, memory, and session id, so 345 Pi
sessions are bound to the same conversation ids in both. From the copy on, two homes
grow different futures under shared ids, and anything that compares, merges, or moves
data between them meets the same id meaning two things.

Nothing in the docs says whether copying a home's database is a supported way to make a
second home, or what the copy carries.

## Expected Behavior

The docs say what copying a home's database gives: the same home twice — its history,
its ids, and its birth — not a new home. A new home is made with `mirror init` and a
seed. If copying is how a person makes a development home, the docs say what the copy
shares with its source and what not to do with the two afterwards.

## Impact

Low; documentation. CR153 removed the one reader that took the ledger's first
`applied_at` as a home's birth, so the copy defeats nothing in the product today. The
shared ids remain a trap for any future comparison or merge of two homes.

## Plan Or Decision

Captured, unassigned, 2026-10-21, from
[CR153](cr153-a-home-s-pi-backfill-imports-another-home-s-sessions.md)'s review
(finding D4), at the Navigator's direction. Current Focus unchanged.

## Evidence

CR153's measurement, 2026-10-21: the same `MIN(applied_at)` in both homes; 345 Pi
sessions bound to the same conversation id in both, the last ended 2026-07-13; the
development home's `mirror-logger.log` begins that afternoon.

## Outcome

Open.
