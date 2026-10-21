[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR154 — A home cannot list or remove the Pi conversations it imported rather than logged

## Problem

[CR153](cr153-a-home-s-pi-backfill-imports-another-home-s-sessions.md) stops session
maintenance from importing Pi sessions. It does not touch what was already imported,
and a person has no way to act on that. An import looks like any other `pi`
conversation: nothing in `mirror conversations` tells it from one the extension logged,
and it lists as the newest conversation, because its `started_at` is the moment it was
imported. No command removes a past conversation either: `discard-current` removes only
the current one, and the routing has no conversation `delete`.

On the maintainer's machine that is 543 conversations one real home logged and the
other imported, both ways, plus 34 sessions neither logged that both imported (CR153's
measurement). Any person who ran two homes on 0.36.0 or earlier has their own.

## Expected Behavior

A home can list the Pi conversations it imported rather than logged, read-only. An
import is told apart by construction: `importClosedConversation` stamped `started_at`
at import time and `ended_at` from the session's last message, so `interface = 'pi'`
and `started_at` at or after `ended_at` hold for every import and for no live
conversation. The listing shows each one's title, its dates, and its message count.

The person can then remove the ones they choose — named, or every one listed — through
the deletion `discard-current` already performs (`deleteConversation`: messages and
embeddings deleted; memories, the `llm_calls` ledger, and the session binding
unlinked). Removal says how many it will remove and asks before it does; it says that
the home's dated backups and its pre-write backup keep copies until they are deleted
or replaced.

## Impact

Privacy clean-up after CR153, for anyone who ran more than one home on 0.36.0 or
earlier. Without it, the honest answer
("deleting them is your decision") is a decision a person can make only in SQL.

## Plan Or Decision

Captured, unassigned, 2026-10-21, from CR153's review (findings P1, S3, D2), at the
Navigator's direction. Current Focus unchanged.

## Evidence

CR153's measurement, 2026-10-21. `deleteConversation` in
`ts/src/conversation/logger.ts`, called by `discardCurrentConversation`. No
conversation `delete` among the front door's routes (`ts/src/frontDoor/routing.ts`).
Until this lands, the read-only selector in CR153's plan (Behavior 6) lists a home's
imports.

## Outcome

Open.
