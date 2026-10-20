[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR153 — A home's Pi backfill imports another home's sessions

## Problem

Session-start maintenance runs the Pi backfill (`ts/src/conversation/backfill.ts`): it
reads every session file under `PI_SESSIONS_DIR`, else `~/.pi/agent/sessions`, and
imports each one that ended after this home's birth (CR121) and whose session the
home's hooks do not already track (`runtime_sessions`). Nothing asks which home the
session belongs to. A Pi session the Pi extension logged live into home A is untracked
in home B, so B's maintenance imports it — every message, then titles it through the
provider and, at its close, extracts memories from it.

CR106 and CR121 narrowed the import to sessions after the home's birth, which keeps a
new home from swallowing a lifetime of history. They did not scope it to the home: a
new home still takes every Pi session the person touches after it is born, from every
other home on the machine. Homes are the boundary a person draws between work and
personal life, or between clients; the import crosses it silently.

## Expected Behavior

A home imports only Pi sessions that belong to it — a session the Pi extension logged
for this home and could not finish (the case the backfill exists for). A session that
another home tracks, or that carries another home's identity, is not read. If a Pi
session file cannot say which home it belongs to, the backfill imports nothing from it
into a home younger than the session's start, or the extension starts recording the
home in the session it writes.

## Impact

Privacy between homes: another home's conversations — their content, their titles,
their memories — copied into a home that should not have them, and sent through the
provider again for titling. The trigger is ordinary: creating a second home, as any
developer, tester, or person splitting work from personal use does, then starting a
session on a hook-carrying runtime while Pi sessions are active elsewhere.

## Plan Or Decision

Captured, unassigned, 2026-10-20, from CV21.DS5.US3's live route, at the plan's stop
condition. The route's own exposure — a cell on the person's real `HOME` without
`PI_SESSIONS_DIR` pointed away — is fixed in the route, not here: every cell now points
the backfill at an empty directory, and `verify` asserts the scratch home holds no
`pi` conversation. Current Focus unchanged.

## Evidence

CV21.DS5.US3 route, 2026-10-20, scratch home `us3user` from the registry's
`mirror-mind@0.36.0`, born 18:10 UTC. The route's Claude Code cell runs with the real
`HOME` (Claude's login is keyed to it, CV21.DS5.TS1). At 20:40:58 UTC, two seconds into
the cell's first session, maintenance imported four Pi conversations — four of the
person's sessions from that day, across both real homes, 19 to 140 messages each,
`title_source: startup_maintenance` — and the scratch ledger shows seven
`conversation_title` calls to `google/gemini-2.5-flash-lite` (US$ 0.009) after it. No
memories were extracted before the scratch home was removed. The database was `0600`;
the copy was deleted by the route's `clean` the same evening. The real homes, both
old and each tracking its own sessions live, show no cross-home conversations for the
journeys concerned.

## Outcome

Open.
