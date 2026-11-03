[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR178 — A configuration error counts as an extraction attempt, so a typo can quarantine conversations, and nothing releases a quarantine

## Problem

Every extraction runs inside `runExtractionWithAccounting`
(`ts/src/conversation/extractionRun.ts`), the port of Python's `_run_extraction` and
`_record_failed_extraction_attempt` (CV9.E2.S7). The logger runtime hands it to the
close hooks, so session end and maintenance both go through it. Any failure is
recorded as an attempt:

- `extraction_attempts` goes up;
- `extraction_status` becomes `llm_failed`;
- at `MEMORY_EXTRACTION_MAX_ATTEMPTS` (3 by default), the conversation is marked
  `extraction_quarantined`.

The extraction driver skips a quarantined conversation from then on, and nothing in
`ts/src` clears the flag: no command, no maintenance step, no documented route.

The accounting cannot tell a failure of one conversation from a configuration that
fails every conversation. The live provider resolves its configuration per call,
inside `LiveLlmProvider.complete()`, and `extractMemoriesWithStatus` does not catch
what it throws. Three cases today:

- a missing `OPENROUTER_API_KEY`, which raises `ProviderConfigError`;
- a non-numeric `MEMORY_LLM_TIMEOUT_EXTRACTION`, whose resolver throws by design
  rather than substitute a value;
- a non-numeric `MEMORY_LLM_MAX_RETRIES`, for the same reason.

While such a configuration stands, each conversation that closes is attempted at
session end and retried by maintenance until it is quarantined. Correcting the
configuration afterwards does not bring it back.

## Expected Behavior

- A failure that belongs to the configuration, not to the conversation, does not count
  against the conversation. The conversation stays pending, and the failure is
  reported where the operator looks: `runtime status`, `runtime diagnose`, and the
  session-start line.
- Once the cause is fixed, a quarantined conversation can be released, by a command
  or a maintenance step that resets its attempts, and the release is documented.

## Impact

Medium: silent and durable. The memories and tasks of every conversation closed while
the configuration was wrong are lost to extraction for good, and nothing says which
setting caused it. In a configured home this is rare, but the first rotated or
mistyped key, or a mistyped setting, does it unannounced.

## Plan Or Decision

Captured, unassigned, 2026-10-26, from the persona review of CV9.DS9.TS1's plan, at
the Navigator's direction.

TS1 adds `MEMORY_EXTRACTION_REASONING`, and its most natural typo (`off`) would have
taken this path. TS1 contains it for its own setting: an invalid value is treated as
unset at call time and reported by `runtime status` and `runtime diagnose`. The
general behavior is left to this CR.

It has two separable halves:

1. Classify configuration errors so they do not count as attempts.
   `ProviderConfigError` and the numeric resolvers' errors share no type today.
2. A release route for existing quarantines.

**Revisit:** the next change to extraction accounting or to `runtime diagnose`, or
the first quarantine seen in a production home.

## Evidence

- `ts/src/conversation/extractionRun.ts`: `runExtractionWithAccounting` records any
  failure, and `recordFailedExtractionAttempt` sets `extraction_quarantined` at the
  maximum.
- `ts/src/conversation/extractionDriver.ts`: the eligible conversations exclude
  `extraction_quarantined IS 1`.
- `ts/src/conversation/loggerRuntime.ts`: the close hooks run extraction through the
  accounting.
- `ts/src/extraction/conversation.ts`: `extractMemoriesWithStatus` calls the provider
  with no `try`, so a configuration error propagates to the accounting.
- `ts/src/providers/llm.ts`: configuration resolves inside `complete()`.
- `ts/src/providers/config.ts`: `parsePythonInt` and `parsePythonFloat` throw on a
  non-numeric value, and `resolveProviderConfig` throws `ProviderConfigError` without
  a key.
- Nothing clears `extraction_quarantined`. Searched `ts/src`, `REFERENCE.md`, and
  `docs/process/troubleshooting.md` on 2026-10-26.

## Outcome

Pending: captured, not planned.
