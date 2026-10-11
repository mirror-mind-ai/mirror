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

Done in **CV22.DS8.US3 plateau 1** (2026-09-11), as the story's first change —
before any new family could copy the rule a fourth time.

`ProviderTransportSpec.replayVar` became `replay`, a record naming a fixture
variable per provider kind, and `incomplete_replay` became a transport MODE
whose reason names both halves: which variable is set and which is missing.
`routing.ts` and the runtime now read the same spec, so the route's recorded
reason cannot contradict what happens one layer later.

Keyed rather than the bare list the capture imagined: the provider factory has
to know what each fixture IS, not only that it is required, and a list would
have forced a second mapping somewhere — the drift shape this CR exists to
close.

The generalisation was driven by real cases rather than designed ahead of them,
and one of them was a surprise the capture did not anticipate: `consult` is
ASYMMETRIC. The credits fixture alone is a COMPLETE replay setup for `consult
credits`, which needs no chat provider, and HALF a fixture for `consult ask`,
which refuses. `mirror load --query` has a second such case —
`MEMORY_RECEPTION=0` removes the classifier on both engines, after which the
embedding fixture alone is complete. A single per-family rule could not have
expressed either; per-leaf specs sharing one revert variable can.

Verified 2026-09-12 by `ts/parity/route_matrix.ts`, which checks six
replay-pair cases including both asymmetries, and by the hermetic suite.
