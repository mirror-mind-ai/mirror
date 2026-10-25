[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR173 — On Antigravity the doorman's steps accumulate, and agy's compaction has no hook to re-deliver the folder

## Problem

Since CV9.DS8.TS6 the doorman's blocks reach agy as persistent `systemMessage` steps,
which stay before the model on later turns — the premise of every delta. Two things
follow that TS6 did not measure:

- every delta stays in the trajectory: `doorman_delivered` keeps memories from
  repeating, but each turn's delivered line, and each newly routed persona's section,
  add to a long conversation;
- agy compacts (`/compact`, and automatically as the context fills) by summarizing the
  trajectory. None of its hook events — `SessionStart`, `PreToolUse`, `PostToolUse`,
  `PreInvocation`, `PostInvocation`, `Stop` — signals a compaction, so nothing tells
  the doorman the folder left the context, as Pi's extension does on `session_compact`
  (`mirror doorman --forget`, CV9.DS8.US5). After a compaction, deltas stand on a summary.

## Expected Behavior

After agy compacts a conversation in Mirror Mode, the next ordinary turn is the full
folder again, as on Pi; or the decision that agy needs no such refresh is recorded with
its measurement.

## Impact

Low to medium, and unmeasured: long Antigravity conversations in Mirror Mode, where the
mirror's identity layers would survive only as a summary.

## Plan Or Decision

Captured, unassigned, 2026-10-25, from CV9.DS8.TS6's Debt Review, at the Navigator's
direction. A signal to look for first: whether `initialNumSteps` or the transcript's
step count drops across a compaction. **Revisit:** long agy sessions in Mirror Mode, or
agy adding a compaction event to its hooks.

## Evidence

[TS6's probe](../../roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/cv9-ds8-ts6-antigravity-through-the-one-doorman/evidence/probe-20261025.md), observation 5 (the persistent step
recalled two turns later in a new process); agy 1.4.7's hook events
(`builtin/skills/agy-customizations/docs/hooks.md`); its changelog's compaction entries.
