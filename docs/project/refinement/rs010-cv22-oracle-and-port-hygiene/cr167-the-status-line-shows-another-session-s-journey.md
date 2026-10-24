[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR167 — The status line shows another session's journey beside Mirror Mode

## Problem

`mirror welcome --status-line --session-id <id>` shows the session's own operating
mode. When the session has none, `modeStatusSegment` (`ts/src/welcome/statusLine.ts`)
falls back to Mirror Mode carrying the **global** sticky journey
(`__global_sticky_defaults__`), which `build load` writes through
`persistStickyDefaults` for whichever session ran it. So a session that chose no
journey shows the journey another session chose last.

The contract says journey context stays visible "when it is still sticky inside the
active session". The row it reads is not inside any session.

## Expected Behavior

A session's status line shows its own journey or none. A journey chosen in one
session does not appear beside another session's Mirror Mode. The global row still
serves callers that name no session.

## Impact

Low to medium. Display only, but it misleads in the case `--session-id` exists for:
two windows side by side. Getting Started's Claude Code status line step now says so.
The same function draws Pi's line; not measured on Pi.

## Plan Or Decision

Captured, unassigned, 2026-10-24, from CV21.DS11's Debt Review, at the Navigator's
direction. Filed in RS010 beside CR101, the mode side of the same session question.
Not planned. Current Focus unchanged.

## Evidence

- CV21.DS11's route, Claude Code 2.1.310, two sessions side by side (drives 1 and 3):
  after session A ran `mirror build load personal-growth`, session B, which chose
  nothing, showed `◇ ds11user · Personal Growth on ◌ Mirror Mode · ✓` under every form
  of the command; its first refresh, before A's load, had shown `◌ Mirror Mode` alone.
- `ts/src/welcome/statusLine.ts`, `modeStatusSegment`: "No active mode: fall back to
  Mirror Mode carrying the sticky journey".
- The runtime interface contract, "Optional: Runtime Status Line", and Getting Started,
  "Mirror's status line in Claude Code".

## Outcome

Open.
