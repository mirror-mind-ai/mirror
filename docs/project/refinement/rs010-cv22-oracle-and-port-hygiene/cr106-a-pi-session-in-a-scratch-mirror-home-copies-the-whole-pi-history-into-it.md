[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR106 — A Pi session started against a scratch Mirror home copies the whole Pi history into it

## Problem

When Pi starts, the Mirror extension runs session maintenance in a detached background
process against whatever Mirror home the session resolves. One of its steps backfills
Pi sessions (`ts/src/conversation/backfill.ts`, driven from
`ts/src/conversation/sessionComposites.ts`). It walks the sessions directory
recursively, across every project, and imports each session the target database does
not already track. The directory is an explicit argument, then `PI_SESSIONS_DIR`, then
`~/.pi/agent/sessions`.

In the user's own home, that fills gaps. A scratch home tracks nothing, so everything is
imported. This project's validation routes use scratch homes to keep runtime behavior
away from personal data, as the collaboration protocol requires, and launching Pi
against one silently defeats that. The whole Pi history lands in the scratch home, and a
pre-write backup copies it again. Maintenance also spends LLM calls retitling some of
it. All of this happens before the first prompt.

## Expected Behavior

Starting Pi against a scratch Mirror home keeps the user's Pi history out of it. The
home ends up holding only the conversations that happen in it. Nothing from the history
is backed up there or sent to a provider. The validation guidance names a route that
guarantees this.

## Impact

Every agent-facing validation route that launches Pi against a scratch home copies the
Navigator's entire conversation history, from every project, into a temporary directory.
That copy outlives the check unless someone notices it. The isolation the protocol
requires fails silently: the route looks isolated because the real home is untouched.

## Plan Or Decision

Pending. Captured while working the Ariad trust floor on CR001, whose validation
surfaced it
([decision](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3));
this CR is not on the floor. First decide whether the fix is behavior or guidance.
Behavior could mean a home backfills only sessions newer than itself, or maintenance
skips a home that is not the user's own. Guidance could mean validation routes launch Pi
with `PI_SESSIONS_DIR` pointed at an empty directory: the backfill already honors it and
`REFERENCE.md` mentions it, but no validation guidance uses it. Whether a scratch home
can be told apart from a real one is part of that decision.

## Evidence

Observed 2026-09-26 during
[CR001](../rs001-ariad-runtime-trust/cr001-scope-confirmation-checkpoint.md)'s Navigator
validation, in a fresh Pi session in this checkout with `MIRROR_HOME` pointed at a
scratch home under `/tmp`:

- The scratch home's `mirror-logger.log` recorded
  `session-maintenance started in detached background process`, then
  `Backfilled Pi sessions: 793 (7.3s)` and `Retitled pending conversations: 5 (12.1s)`.
  The first prompt was logged after both.
- When inspected, the database held 795 conversations and 50,737 messages; the
  maintenance log attributes 793 of those conversations to the backfill.
- The home also held `backups/frontdoor-pre-write-backup.db`, a 47 MB copy of that
  database that the front door wrote before a write.
- The walk is not limited to this checkout: `~/.pi/agent/sessions` held 835 session files
  across 32 project directories on this machine.
- Every copied file was owner-only (`0600`, with the backup directory at `0700`). The real
  Mirror home gained no `cr001-validate` journey or conversation.
- The scratch homes were deleted after inspection, at the Navigator's direction.

## Outcome

Pending.
