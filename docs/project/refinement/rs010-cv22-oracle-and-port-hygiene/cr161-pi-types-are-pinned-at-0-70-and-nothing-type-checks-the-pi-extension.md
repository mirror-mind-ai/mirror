[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR161 — `.pi/` pins Pi's types at 0.70.0, and nothing type-checks the Pi extension

## Problem

The Pi extension (`.pi/extensions/mirror-logger.ts`) is the one piece of Mirror that
runs inside Pi, and it is typed against Pi's extension API through `.pi/`'s own
`package.json` and `tsconfig.json`. Those types are stale, and nothing checks the
extension against them:

- `.pi/package.json` asks for `@mariozechner/pi-coding-agent` at `latest`, the name
  Pi published under before it became `@earendil-works/pi-coding-agent`; the copy
  installed in `.pi/node_modules` is 0.70.0, while the Pi this project runs is 1.4.0.
- `tsc -p .pi` reports 3 errors from before CR160, in the handler that appends the
  Operating Instructions (`files` possibly undefined). It would report 6 more for the
  events CR160 uses (`InputEvent.streamingBehavior`,
  `BeforeAgentStartEvent.messageType`, `agent_settled`), which the 0.70.0 types do not
  have; CR160 reads those through narrow casts so as to add no error.
- `npm run typecheck` covers `ts/` only, and CI does not run `.pi/`'s `tsc`.

## Expected Behavior

- `.pi/` takes its types from the package Pi publishes now, at the version this
  project supports.
- `tsc -p .pi` is clean and runs where the repository's checks run.
- CR160's casts give way to Pi's own types.

## Impact

Low. Pi strips the extension's types when it loads it, so nothing breaks at run time.
But a mistake in the extension's use of Pi's API goes unseen until a session
misbehaves, and the types the extension is read against describe a Pi nobody runs.

## Plan Or Decision

Captured, unassigned, 2026-10-23, at the Navigator's direction, from CR160's debt
review (item 4), in RS010 beside it. Not planned. Current Focus unchanged.

## Evidence

- `.pi/node_modules/@mariozechner/pi-coding-agent/package.json`: version 0.70.0. The
  installed Pi: `~/.pi/agent/install/releases/1.4.0`, package
  `@earendil-works/pi-coding-agent` 1.4.0, whose `dist/core/extensions/types.d.ts`
  declares `InputEvent.streamingBehavior`, `BeforeAgentStartUserEvent.messageType`,
  and `AgentSettledEvent` (added in Pi 0.80.4).
- `tsc -p .pi`, 2026-10-22: 3 errors before CR160's change, 9 with it before the casts,
  3 after them.
- `package.json` `typecheck` is `tsc --noEmit` over `ts/`; `.github/workflows/` name
  `.pi/` only in a comment.

## Outcome

Open.
