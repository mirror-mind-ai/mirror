[< RS010](index.md)

# CR066 — Skip a naive timestamp instead of crashing the diagnosis

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`_front_door_error_findings` in `src/memory/cli/runtime.py` scans
`front-door.log` for recent ERROR lines:

```python
try:
    stamp = datetime.fromisoformat(parts[0].replace("Z", "+00:00"))
except ValueError:
    continue
if stamp >= cutoff:
    recent_errors += 1
```

A timestamp with **no offset** parses successfully as a *naive* datetime, so
the `except ValueError` never fires. The comparison against the timezone-aware
`cutoff` then raises `TypeError: can't compare offset-naive and offset-aware
datetimes`, which nothing catches. A read-only diagnostic crashes on a log line.

The same file's sibling already knows better: `_cache_is_stale` in
`cli/welcome.py` explicitly does `checked_at.replace(tzinfo=timezone.utc)` for
exactly this case. Two answers to the same question in the same codebase.

Not reachable today. The only writer is `frontDoorLog.ts`, which always emits
`new Date().toISOString()` with a `Z`. It becomes reachable through a
hand-edited log, a log copied from another tool, an older or future writer, or
any format change — none of which should be able to break `runtime diagnose`.

## Expected Behavior

A timestamp the scanner cannot confidently place in time is skipped, exactly
as an unparseable one is. `runtime diagnose` reports the errors it can date and
stays green on the rest; it never raises while reading a file.

Alternatively, and consistently with `_cache_is_stale`, a naive timestamp is
read as UTC. Either is defensible; what is not defensible is the third
behavior, which is to crash.

## Impact

Low likelihood, poor failure mode. `runtime diagnose` is what a user runs when
something is already wrong, and it is the command the web layer exposes as a
controlled operation — so the crash surfaces as an opaque failed run rather
than a message. A diagnostic that dies on malformed input is worse than one
that under-reports.

## Plan Or Decision

Catch `TypeError` alongside `ValueError`, or normalize a naive stamp to UTC
before comparing, matching `_cache_is_stale`. Prefer whichever makes the two
call sites agree, and say which rule won in the code.

The TypeScript port already declines to reproduce this: `parseLogTimestamp` in
`ts/src/runtime/diagnose.ts` returns null for a timestamp without an offset,
so the line is skipped. That is a deliberate non-port of a crash, documented in
the module, and **not** a behavioral divergence on any log the front door
writes — but the two cores should agree explicitly rather than by the accident
of the input never occurring.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Found while porting the diagnose surface in CV22.DS7.TS3 (plateau 3b) and
captured at that story's Debt Review on 2026-09-08.
