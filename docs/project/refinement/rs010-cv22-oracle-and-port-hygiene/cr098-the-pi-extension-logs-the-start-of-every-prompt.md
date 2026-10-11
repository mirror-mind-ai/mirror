[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR098 — The Pi extension logs the first 80 characters of every prompt

**Refinement Story:** RS010 — CV22 Oracle And Port Hygiene
**Status:** captured
**Driver:** —
**Delivery:** —

## Problem

`.pi/extensions/mirror-logger.ts` writes an INFO line for every user turn
it logs:

```ts
log("INFO", `log-user: ${prompt.slice(0, 80)}...`);
```

So `<mirror home>/mirror-logger.log` holds the opening of every prompt the
user has typed in Pi, in plain text, since the initial import (2026-04-21).
Every other log the product writes records metadata only. The front-door log
is redacted and tested (`hookPayloadRedaction.test.ts`). `hooks.log` names the
command, not its arguments, since the TS5 handoff review (finding P1). The
extension's own error lines already cut arguments to the command name
(`args.slice(0, 2)`). This line is the exception.

## Expected Behavior

The logger records that a user turn was logged, and for which session. It
does not record what the user said. The conversation itself is in the
database, which is where content belongs and where the user's other controls
apply (mute, discard, backup). A test drives a turn through the extension and
asserts the prompt's text is absent from `mirror-logger.log`.

## Impact

Privacy, low severity. The file is owner-only on a personal machine. But it
is a diagnostic log, the kind that gets pasted into issues when something
breaks, and in Mirror the prompts are often personal.

## Plan Or Decision

Not planned. Captured without selecting; Current Focus unchanged. Not
CV22.DS10.TS5's: the line predates the port, and TS5 did not touch it.

## Evidence

- `.pi/extensions/mirror-logger.ts`, the `log-user` INFO line.
- The TS5 Navigator walk's runbook greps `mirror-logger.log` for
  `[INFO] log-user: Say hello in one sentence....`. The line exists, and the
  walk read it.
- [CV22.DS10.TS5 handoff review, P1](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts5-python-core-deletion/handoff-review.md#p1--hookslog-records-prompts-and-responses-security-engineer).

## Outcome

Open.
