[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR209 · A journey cannot be set for one session: a load that names its session also moves the global default, and `mode activate` moves only the status line

## Problem

A Codex user asked the agent how to set the journey for the current session only. No
command does that, and the closest ones do something else:

- **`mirror mirror load --session-id S --journey J`** sets session S's journey. It also
  writes J into `__global_sticky_defaults__` and `__global_operating_mode__`, always:
  `runMirrorLoad` calls `persistStickyDefaults` and calls `activateOperatingMode` without
  a session before it writes the named session. A later session that names no journey
  then opens on J.
- **`mirror mode --session-id S activate "<mode>" --journey J`** writes J only into S's
  `operating_mode` metadata, which is what `mode status` and the status line show. It
  leaves `runtime_sessions.journey` alone, and that column is what the doorman and the
  conversation binding read. After it, the session shows one journey and runs on
  another.

Nothing the package ships says which command to use (see CR210). So the agent went
looking. It found that the Python core used `MemoryClient`, which was deleted in v0.32,
and then had to work out the TypeScript equivalent from the source.

## Expected Behavior

- One documented command sets the journey of a named session and of nothing else: no
  global default and no global mode. Afterwards the doorman, the conversation binding
  and the status line all read the same journey.
- Whether a load that names its session should still move the global defaults is
  decided explicitly in planning. That is a Navigator decision: the sticky default
  exists for CLI calls that name no session.
- `mode activate --journey` and the session's `journey` column agree, or the
  documentation states the difference.

## Impact

- **Two windows on two journeys:** the last load sets the global default, so a new
  session opens on the other window's journey. Related: CR167 (the status line shows
  another session's journey) and CR100 (the resolver guesses).
- **A simple switch:** an agent asked for one has no safe command to run, and the person
  pays for its search.

## Plan Or Decision

Captured, unassigned, 2026-11-09, at the Navigator's direction. This CR came out of
investigating two reports from Codex users. In one of them, this exact request used up
the rest of a five-hour usage window.

Not planned. It needs the Navigator decision named above.

## Evidence

Measured on 2026-11-09 with `mirror` 0.44.0 from this checkout (`11712d26`), against a
copy of the `vinicius-dev` home under `/tmp`, with `MIRROR_SESSION_ID`,
`CODEX_SESSION_ID` and `CLAUDE_CODE_SESSION_ID` unset:

```text
before:
  __global_operating_mode__   journey ∅  metadata ∅
  __global_sticky_defaults__  journey mirror

mirror mirror load --session-id probe-b --journey mirror --context-only
mirror mirror load --session-id probe-a --journey kia-desktop --context-only

after:
  __global_operating_mode__   {"active_mode": "Mirror Mode", "active_journey": "kia-desktop"}
  __global_sticky_defaults__  journey kia-desktop
  probe-a                     journey kia-desktop
  probe-b                     journey mirror

mirror mode --session-id probe-b status   → Mirror Mode · mirror
mirror mode status                        → Mirror Mode · kia-desktop

mirror mirror load --session-id probe-c --context-only   (no journey named; MEMORY_RECEPTION=0)
  → renders === journey/kia-desktop ===, and probe-c's journey is kia-desktop

mirror mode --session-id probe-b activate "Mirror Mode" --journey personal-growth
  → "Activated Mirror Mode for personal-growth"
  probe-b: journey column still mirror;
           metadata {"operating_mode": {"active_mode": "Mirror Mode", "active_journey": "personal-growth"}}
```

Code:

- `ts/src/mirror/orchestration.ts`, `runMirrorLoad`: `persistStickyDefaults(...)` and
  `activateOperatingMode(db, { mode: "Mirror Mode", journey })` run before the named
  session's write.
- `ts/src/mode/operatingMode.ts`, `activateOperatingMode`: it writes only the session's
  metadata.
- `ts/src/mirror/doorman.ts`, `readDoormanSessionState`: it reads `session.journey`.

## Outcome

Pending: captured, not planned.
