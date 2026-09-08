[< RS009](index.md)

# CR059 — Route the Pi extension and Gemini hook calls through the front door

**Status:** captured
**RS:** RS009
**Driver:** —
**Delivery:** —

## Problem

`.pi/extensions/mirror-logger.ts` (`runPy`, `runPyBackground`) and
`.gemini/hooks/*.sh` invoke `uv run python -m memory …` directly. They never
enter `ts/src/frontDoor/cli.ts`, so the routing table in
`ts/src/frontDoor/routing.ts` does not decide which engine answers them. The
mirror home's `front-door.log` on the Navigator's install carried zero
`conversation-logger` lines on 2026-09-07 despite the burn-down ledger
recording that family as 15/15 "routed to TS": every flipped hook route —
`session-start --fast`, `session-maintenance`, `session-end-pi`, `welcome`,
the `user-prompt` hook — was reached by the lifecycle smoke and by the
skills, not by a live Pi or Gemini session.

CV22.DS7.TS1 moved exactly one call, the session-shutdown `backup --silent`,
through a new `runFrontDoor` helper (`node --no-warnings
--env-file-if-exists=.env ts/src/frontDoor/cli.ts …`), and the Navigator's
validation route observed the first hot-path front-door entry from a real
session. The remaining calls still bypass it.

## Expected Behavior

Every Mirror command the Pi extension and the Gemini hooks run enters the
front door, so the routing table — and each family's revert control — governs
production hot paths, and `front-door.log` records them. Unported commands
keep falling back to Python inside the front door; the switch is behavior-
preserving for them apart from Node startup latency. The ledger's "routed to
TS" claim then means what it says for live sessions, not only for the smoke.

## Impact

High. Until this lands, a flipped family's TS code is exercised in production
only where a skill happens to call it, while the ledger and the DS7 done
condition ("every routing flip produced no user-visible change") read as if
live sessions already ran through TS. A defect in a flipped hook route would
be found by the smoke, never by daily dogfooding — and a revert control set
in the environment would not revert the hook.

## Plan Or Decision

1. Replace `runPy`/`runPyBackground` bodies with the front-door invocation
   (keep the helper names and call sites; the background variant spawns
   `node` detached the same way it spawns `uv`), and switch the four Gemini
   hook scripts to the same invocation.
2. Verify the hot path budget: Node startup plus front-door dispatch on
   `session-start --fast` and `user-prompt`, against the 30 s `pi.exec`
   timeout; record numbers in the CR.
3. Prove it the way TS1 did: a real session start and shutdown, then
   `front-door.log` shows every expected command with its route; the
   redaction check passes for hook payloads (stdin, never argv).
4. Re-read the burn-down ledger's flip entries and add one line stating
   which flips reach live sessions only from this CR onward.

Keep RS009's boundary: no new port, no flip decision re-litigated.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Found while planning CV22.DS7.TS1 (recorded in its plan's Terrain section)
and captured at that story's Debt Review on 2026-09-08.
