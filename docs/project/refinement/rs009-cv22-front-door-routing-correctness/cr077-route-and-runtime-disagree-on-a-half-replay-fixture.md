[< Refinement Workbench](../index.md) · [RS009](index.md)

# CR077 — The route and the runtime disagree on a half-configured replay fixture

**Refinement Story:** RS009 — CV22 Front-Door Routing Correctness
**Status:** captured
**Driver:** —
**Delivery:** —

## Problem

CV22.DS8.US2 gave the conversation close tail one transport precedence
(`resolveProviderTransport`), consumed in two places: `routing.ts` decides the
engine, `loggerRuntime.ts` builds the providers. The family needs **two**
replay fixtures, but the shared spec names only one (`replayVar`), so the
"both or neither" rule lives in `loggerRuntime` alone.

Consequence: with only `MIRROR_TS_CONVERSATION_LLM_REPLAY` set,

- `routing.ts` reports `engine=ts, reason=... replay transport`;
- `loggerRuntime` then refuses with `ReplayFixtureIncompleteError`.

The refusal is correct and loud, and no money is spent — the behavior is safe.
But the route's recorded reason is a statement the runtime contradicts one
layer later, and the front-door log will carry a `replay` reason for an
invocation that never replayed anything.

The same asymmetry will reappear in DS8.US3: `mirror load --query` and the
cultivation family also carry an LLM fixture plus an embedding fixture, and
each would have to re-implement the pairing rule in its own consumer.

## Expected Behavior

The spec carries the whole rule. `ProviderTransportSpec` accepts a *set* of
required replay variables rather than one, and `resolveProviderTransport`
returns an explicit `incomplete_replay` outcome naming the missing half.
Routing and the runtime then agree by construction, the front-door log records
what actually happened, and US3's two-fixture families inherit the rule
instead of copying it.

## Impact

Low today — the dangerous case (a live call under a half fixture) is already
prevented, and the refusal names the missing variable. It is a coherence and
observability defect, not a spend or safety one.

It grows with US3: three or four more families re-deriving a pairing rule is
exactly the `LLM_ROLES` drift shape that CV22.DS8.US1 introduced
`resolveProviderTransport` to end.

## Plan Or Decision

Not planned. Natural owner is **CV22.DS8.US3**, which adds the remaining
two-fixture families and would otherwise duplicate the rule three more times.
Doing it there means the generalisation is driven by a third and fourth real
case rather than designed ahead of them.

## Evidence

- `ts/src/providers/transport.ts` — `ProviderTransportSpec.replayVar`, singular.
- `ts/src/conversation/loggerRuntime.ts` — `halfConfiguredReplay`, the rule
  living outside the spec.
- `ts/test/conversation/loggerRuntime.test.ts` — "half a replay fixture
  REFUSES by name instead of going live".

## Outcome

Open.
