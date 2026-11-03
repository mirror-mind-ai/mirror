[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR170 — An Antigravity execution with no new user input would hand the doorman the last prompt again

## Problem

Since CV9.DS8.TS6 the `PreInvocation` hook hands the doorman the payload's
`lastUserInput` at `invocationNum` 0. The field is the conversation's **last** user
input: every invocation of a turn carried the same value, and TS6's probe saw
invocation 0 fire once per user turn. agy also starts executions with no new user
input — timers and recurring jobs the agent schedules, background tasks and subagents
reporting back (agy's `/tasks`; the "background tasks have been stopped" notice it
injects on a resumed process). If such an execution fires invocation 0, the hook hands
the previous prompt to the doorman a second time: a delta — one more embedding, and the
next memories above the threshold — or, after an explicit-form prompt, a second full
folder.

## Expected Behavior

A delivery belongs to a user turn. An execution no user input started gets nothing
from the doorman, or the decision that it should is recorded.

## Impact

Low, and unmeasured: one extra embedding and context per such execution, in sessions
that use agy's scheduled or background work.

## Plan Or Decision

Captured, unassigned, 2026-10-25, from CV9.DS8.TS6's Debt Review, at the Navigator's
direction. A candidate key, if a re-fire is measured: the turn's `USER_INPUT`
`step_index` (TS6's plan had it, and its amendment dropped it for want of a measured
re-fire), or `initialNumSteps` against the last delivered turn. **Revisit:** an agy
session that uses timers or background tasks, or a double delivery seen in a transcript.

## Evidence

[TS6's probe](../../roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/cv9-ds8-ts6-antigravity-through-the-one-doorman/evidence/probe-20261025.md), observations 1, 3, and 5: the field on
every invocation of a turn, one invocation 0 per user turn across seven turns, and the
system notice agy injects on a resumed process. No execution without user input was
observed: headless agy ends the process with the turn.
