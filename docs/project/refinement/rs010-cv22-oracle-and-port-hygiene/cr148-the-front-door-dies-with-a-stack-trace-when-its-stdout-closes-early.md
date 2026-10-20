[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR148 — The front door dies with a stack trace when its stdout closes early

## Problem

`mirror ext <id> | head -1` — or any pipe that stops reading before the front door
stops writing — ends in an unhandled `EPIPE`:

```text
node:events:487
      throw er; // Unhandled 'error' event
      ^
Error: write EPIPE
    at afterWriteDispatched (node:internal/stream_base_commons:159:15)
    …
    at emit (…/ts/src/frontDoor/extensionCatalogRoute.ts:83:39)
```

The route's `emit` writes `process.stdout.write(rendered.stdout)` and nothing in the
tree listens for `error` on `process.stdout` (`grep EPIPE ts/src` finds nothing). A
closed pipe is the reader's business, not an error of ours: `head`, `tail`, a pager
that quit, a `grep -q` that matched — every one of them closes stdout early on
purpose, and every one of them gets the stack trace instead of silence.

Seen on `mirror-mind@0.35.0` during CR145's validation, from a mistyped `tail -`;
the write path is the same on `main`.

## Expected Behavior

A closed stdout ends the command quietly: no stack trace, no partial line on
stderr, exit status as the shell convention has it (the reader's exit decides the
pipeline; the writer's `EPIPE` is not news). One handler at the front door's
entry — `process.stdout.on("error", …)` that swallows `EPIPE` and exits — covers
every route, including the ones that never see `extensionCatalogRoute.ts`.

## Impact

Low in frequency, high in how it reads: a Node stack trace on a shell idiom as
ordinary as `| head` is the kind of first impression the front door exists to
avoid. One listener, one test.

## Plan Or Decision

Captured, unassigned, 2026-10-20, from CR145's validation (the first run, step 8),
at the Navigator's direction. Current Focus unchanged.

## Evidence

The Navigator's transcript, 2026-10-20, 0.35.0 (`/opt/homebrew/lib/node_modules/mirror-mind`):
the trace above. `ts/src/frontDoor/extensionCatalogRoute.ts:83–87` (`emit`) on `main`.

## Outcome

Open.
