[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR101 — Explorer and Soul activation stamp their mode onto a guessed session

## Problem

Mode activation outside Builder picks its target session the way `build load`
did before CR008:

- `explore load` (`ts/src/frontDoor/exploreRoute.ts`, `runLoad`) resolves the
  session with `resolveRuntimeSessionId(db, sessionId)`, without passing
  `MIRROR_SESSION_ID`, and stamps `Explorer Mode · <slug>` onto whatever that
  returns: in an agent shell, the most recently updated row
  ([CR100](../rs010-cv22-oracle-and-port-hygiene/cr100-the-session-resolver-guesses-from-a-table-of-three-row-kinds.md)).
- `explore deactivate` clears the operating mode of a session guessed the same
  way.
- Soul activation (`ts/src/frontDoor/soulRoute.ts`) does the same with
  `MIRROR_SESSION_ID` passed, which changes nothing in an agent shell, where it
  is unset.

No command binds a journey from Explorer or Soul mode. The readers of
operating mode are the Builder resolver, the welcome status line, and
`mode status`, so the effect lands on mode state, not on project files. A
guessed stamp can overwrite or clear another window's mode, and that window's
footer then shows it.

## Expected Behavior

Explorer and Soul activation, and `explore deactivate`, follow the write-side
rule that CR008 settles for `build load`. The three modes must not disagree on
where a mode activation lands.

## Impact

Low. Display and mode state only. After CR008, a known-session Builder
command whose session stamp was clobbered by a guessed Explorer or Soul
activation refuses. It does not bind elsewhere.

## Plan Or Decision

Not planned. Captured without selecting; Current Focus unchanged. Captured by
the Navigator's decision approving
[CR008's plan](cr008-bind-lifecycle-commands-to-active-journey.md) as that
plan's excluded write-side twin.

Filed under RS001 as CR008's twin, as the capture decision named it. Explorer
and Soul are not Ariad. If RS001 is kept strictly to Ariad surfaces, this
belongs in RS010 next to CR100. That move is a Navigator call.

## Evidence

- `ts/src/frontDoor/exploreRoute.ts`: `runLoad` and the `deactivate` case.
- `ts/src/frontDoor/soulRoute.ts`: the Soul load path's `activateOperatingMode`
  call.
- `ts/src/welcome/statusLine.ts`: reads the session's own stamp before the
  global row, which is how a guessed stamp becomes another window's footer.

## Outcome

Open.
