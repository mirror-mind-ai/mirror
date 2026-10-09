[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR120 — A failed Pi session import aborts the rest of session maintenance

## Problem

Session maintenance (`sessionMaintenance` in `ts/src/conversation/sessionComposites.ts`)
runs four steps in sequence: close stale conversations, backfill Pi sessions, retitle
pending conversations, extract pending conversations. Claude Code's and Gemini CLI's
SessionStart hooks run it through the full `conversation-logger session-start`; the Pi
extension runs it as a detached background `session-maintenance`.

The backfill (`backfillPiSessions` in `ts/src/conversation/backfill.ts`) imports each
untracked Pi session in its own call to `importClosedConversation`. It catches one
failure, a session file that does not parse. An insert that throws escapes the loop.
The one observed is `UNIQUE constraint failed: messages.id`. The sessions after the
failing one are not attempted, and the retitle and extraction steps never run. Nothing
in `sessionMaintenance` catches a step. The hook does what it was designed to do: one
line in `hooks.log`, exit 0, the turn unharmed. The run's maintenance is lost.

The next run starts again at the first untracked session and faces the same odds.

Why an insert collides is [CR097](cr097-new-ids-are-32-bits-because-the-oracle-s-were.md)'s
subject: every message draws a fresh random 32-bit id, and the odds grow with the table
and with the size of the import. This CR is about the cost of one collision, not its
cause. A bulk import is the step most likely to collide, because it inserts the most
rows at once. That same step currently takes the rest of the run down with it.

## Expected Behavior

A session whose import fails is skipped for that run. The skip is recorded with no
content, in the maintenance report or log, and the backfill continues with the next
session. Retitling and extraction still run. A failure stays visible through
`hooks.log` and `runtime diagnose`, but it no longer costs the rest of the run.

## Impact

Medium, and it rises with CR097's odds and with the size of the untracked backlog. Two
kinds of home carry a large backlog:
- every new install whose owner has used Pi before ([CR121](cr121-a-new-home-s-first-maintenance-imports-the-whole-pi-history.md));
- any home that tracks only part of its owner's Pi history, such as a second home on the
  same machine.

In those homes the import is large, a collision is likely, and each one costs that run's
retitling and extraction.

## Plan Or Decision

Not planned. Captured without selecting; Current Focus unchanged. Two separable changes:
- contain the failure per session, here;
- widen the id, in CR097.

Containment makes CR097's odds survivable; widening makes containment rarely needed.
Whoever plans this decides whether a session that failed is retried on the next run,
where fresh ids would likely succeed, or quarantined after repeated failures, as
extraction already does. Also check whether the Pi extension's background maintenance
loses its run the same way. Its `mirror-logger.log` in the home below holds no such
line, and that was not investigated.

## Evidence

- **The Navigator's TS-migration home (`vinicius-ts`).** Its `hooks.log` holds 9 lines
  `UNIQUE constraint failed: messages.id` between 2026-09-24 and 2026-10-05:
  5 `claude:session-start` and 4 `gemini:session-start`. A successful session start
  leaves no line, so the failure *rate* is unknown. The home held 34,531 messages on
  2026-10-09.
- **Reproduced on 2026-10-08 while writing CV22.DS10.US3's route 3.** A home freshly made
  by `mirror init` received the Claude plugin's SessionStart hook with the real
  `~/.pi/agent/sessions`. The backfill imported 430 conversations (26,036 messages) and
  then failed with the same error. `hooks.log` recorded
  `claude:session-start: UNIQUE constraint failed: messages.id`. The scratch home was
  deleted afterwards.
- **CR097's arithmetic for these imports.** Importing 26,036 messages into an empty table
  collides with probability ≈ n²/2³³ ≈ 8%. Into a home of about 34,000 messages the
  chance is roughly a third. Both are consistent with random collisions, without proving
  them.
- **Code.** In `backfill.ts`, `backfillPiSessions` wraps only `parsePiSessionFile` in
  `try`. In `sessionComposites.ts`, `sessionMaintenance` awaits its steps in sequence
  with no per-step `catch`. In `sessionImport.ts`, `importClosedConversation` draws
  `deps.newId()` for every message.
- **Recorded in context.** [CV22.DS10.US3 story index, plateau 3](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-us3-npm-distribution/index.md#plateau-progress), finding F2.

## Outcome

Pending.
