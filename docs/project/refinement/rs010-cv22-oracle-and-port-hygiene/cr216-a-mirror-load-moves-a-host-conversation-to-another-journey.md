[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR216 · A Mirror load can move a host's Conversation to another journey, and a terminal's replies can land in it

## Problem

A full `mirror mirror load` (not `--context-only`) ends in `bindConversationContext`
(`ts/src/mirror/orchestration.ts`). It finds the open Conversation bound to the resolved
runtime session and runs:

```sql
UPDATE conversations SET persona = ?, journey = ? WHERE id = ?
```

with whatever the load resolved. Three behaviors compose into a defect:

- **The session can be someone else's.** When the load names no session (no
  `--session-id`, no `MIRROR_SESSION_ID`, `CLAUDE_CODE_SESSION_ID` or `CODEX_SESSION_ID`),
  `resolveRuntimeSessionId` falls back to `guessRuntimeSessionId`: the active session
  updated last, of any interface. A host that embeds the core (Nautilus) keeps one active
  `runtime_sessions` row per Conversation through `ensureConversation`, so the guess can
  land on a host's session.
- **The journey written is incidental.** It is whatever the load resolved: an explicit
  `--journey`, reception, the sticky default, or detection. A host's Conversation belongs
  to the journey the host named; the host asserts it on every append and rejects every
  later delivery with `journey_mismatch` once it differs.
- **An unresolved column is nulled.** A load that resolves no journey or no persona writes
  `NULL` over the Conversation's value.

The guess also misroutes the rest of the load's writes: `logMirrorResponse` (`mirror log`)
resolves the session the same way, so a terminal's reply is appended to the host's
Conversation and retitles it.

Mirror Desktop recorded the incident this produced on 2026-09-26, on the Python core
(Mirror Desktop CR094, RS022): a Mirror Mode activation moved a live `mirror-desktop`
Conversation to another journey; two turns already accepted stayed in the wrong journey,
every later delivery was rejected, and the rewrite left no trace but three `updated_at`
values. The TypeScript port kept the behavior line for line.

## Expected Behavior

- A guessed session is never a host's session. A host names its sessions explicitly, so
  only an explicit name reaches one.
- A Mirror load never changes the journey of a Conversation a host ensured, even when it
  names that session. The host's `rebindConversationJourney` stays the one way to move it.
- A load never writes `NULL` over a Conversation's journey or persona it did not resolve.
- Terminal Conversations keep today's behavior otherwise: a load that resolves a journey
  still sets it.

## Impact

Silent: a Conversation changes journey with no event, no receipt and no log, and the host
discovers it only as rejections. Turns move between journeys' records. Rare in practice:
Nautilus delivers context with `contextOnly` and runs Pi with `--no-skills`, and Pi in a
terminal names its session through `MIRROR_SESSION_ID`. It takes a full load from a runtime
that names no session while a host Conversation is the most recently updated session.

## Plan Or Decision

Captured 2026-11-17 at the Navigator's word, promoted from Mirror Desktop CR094 (RS022).
Plan approved by the Navigator on 2026-11-17. Driver: @alissonvale. Delivery: a PR from
`cr216-a-mirror-load-moves-a-host-conversation`.

- **Mark what a host owns.** `ensureConversation` records `journey_authority: "host"` in
  the Conversation's `metadata`, merged into what is there, written through the narrowed
  handle it already uses (`UPDATE conversations SET metadata = ? WHERE id = ?`). No schema
  change, no change to the host's request.
- **The guess skips host sessions.** `guessRuntimeSessionId` leaves out a session whose
  Conversation carries the mark.
- **The bind keeps a host's journey and never nulls.** `bindConversationContext` writes
  `journey` only when it resolved one and the Conversation is not a host's, and `persona`
  only when it resolved one.

### Non-goals

- Recording a journey change as an audited mutation (the CR094 option 3): with the host's
  journey protected, the remaining moves are terminal Conversations following their load.
- Changing which session a named load binds, or the sticky defaults (CR209).

### Acceptance

- With a host Conversation the most recently updated session, a load that names no session
  binds no host session, and `mirror log` writes nothing into it.
- A load that names a host's session leaves its journey as the host set it.
- A load that resolves no journey or no persona leaves both columns as they were.
- A terminal Conversation still takes the journey its load resolved.
- A Conversation ensured before this change gets the mark the next time it is ensured.

## Evidence

Read on 2026-11-17 against `origin/main` (`e6dca9e7`, v0.44.0 plus 13 commits):

- `ts/src/mirror/orchestration.ts`, `bindConversationContext`: the unconditional `UPDATE`.
- `ts/src/mirror/runtimeSession.ts`, `guessRuntimeSessionId`: `active = 1`, any interface,
  `ORDER BY updated_at DESC LIMIT 1`.
- `ts/src/conversation/hostCalls.ts`, `ensureConversation`: writes the host's session row
  active, with its interface and journey.
- `ts/src/mirror/doorman.ts`, `runFull`: the doorman loads with `contextOnly: true`, so
  context delivery to a host never reaches the bind.

## Outcome

Implemented on `cr216-a-mirror-load-moves-a-host-conversation`, 2026-11-17; not yet committed.

- **The mark.** `ensureConversation` (`ts/src/conversation/hostCalls.ts`) merges
  `journey_authority: "host"` into the Conversation's metadata, read inside the write
  (`markJourneyAsTheHosts`), and skips the write when the mark is there.
- **The guess.** `guessRuntimeSessionId` (`ts/src/mirror/runtimeSession.ts`) leaves out a
  session whose Conversation carries the mark; malformed metadata counts as unmarked
  (`json_valid` first). `conversationJourneyIsHosts` answers the same question for one id.
  Every caller of the guess gains it: Mirror, Builder, Soul and Explorer loads and the
  prompt logger.
- **The bind.** `bindConversationContext` (`ts/src/mirror/orchestration.ts`) sets `persona`
  only when the load resolved one, and `journey` only when it resolved one and the
  Conversation is not a host's.

Checks:

- `ts/test/conversation/hostCalls.test.ts`: the mark is written, merged into existing
  metadata, and added to a Conversation ensured before this change.
- `ts/test/mirror/runtimeSession.test.ts`: the guess skips a host's session and still finds
  a terminal one beside malformed metadata; a named host session still resolves.
- `ts/test/mirror/orchestration.test.ts`: a load naming no session leaves the host's
  Conversation alone and `mirror log` writes nothing into it; a load naming the host's
  session keeps its journey; a load resolving neither keeps both columns. The five new
  tests failed before the change, each on the defect.
- In a clean environment (`env -i`, throwaway `HOME`, no `mirror` on the PATH): `npm test`
  3,909 tests, 3,906 pass, 0 fail, 3 skipped; `tsc`, Biome (one warning, already present in
  `testTempHomes.test.ts`), `git diff --check`, the four repository checks, the plugin check,
  both custody proofs and the five end-to-end smokes are clean.
- Validation route through `bin/mirror.js` in a scratch home: `ensureConversation` for
  session `nautilus-s1` in `host-journey`, then `mirror load --journey other-journey` and
  `mirror log "A terminal reply."`, naming no session. On `origin/main` the Conversation
  moved to `other-journey`, was retitled "A terminal reply" and received the message. On
  this branch it stayed in `host-journey`, titled "Host", with no message.
