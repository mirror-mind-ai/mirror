[< RS009](index.md)

# CR064 — Log the engine that answered, not the engine that was chosen

**Status:** captured
**RS:** RS009
**Driver:** —
**Delivery:** —

## Problem

`main()` in `ts/src/frontDoor/cli.ts` writes `decision.engine` to
`front-door.log` — the routing table's choice, decided before dispatch. Some
TS routes fall back to Python *inside* dispatch: `runConversationLoggerWrite`
returns `fallbackPython(argv)` when the logger command reports
`{ handled: false }`, which `loggerCli` does when the LLM close tail is
unconfigured (`LlmTailUnconfiguredError`), as defense in depth behind the
replay gate. In that case the command is answered by Python and the log says
`ts`.

This was harmless while `front-door.log` only recorded skill invocations. CR059
made it the production record of which engine answers every Pi and Gemini turn,
and the burn-down ledger's rules paragraph now points at it as the evidence
that a flip reached live sessions. An entry that says `ts` when Python answered
undermines exactly that claim.

## Expected Behavior

The logged route is the engine that produced the exit code. Dispatch reports
the engine it actually used — a returned value or a small result object, not a
mutable module variable — and `main` logs that, falling back to
`decision.engine` only when dispatch made no engine choice of its own. A
routing decision that differs from the answering engine is visible rather than
silently normalized, because that difference is a real event worth seeing:
it means a gate is set one way and the runtime disagrees.

## Impact

Observability, not behavior: no command runs differently. The consequence is
that an audit of `front-door.log` — now the only production evidence that a
flipped route reaches live sessions — can overstate TypeScript coverage for
the replay-gated `conversation-logger` subcommands on an install where the
transport is misconfigured.

## Plan Or Decision

Small and local: have `dispatch` return `{ exitCode, engine }` (or an
equivalent), thread it into the existing `logFrontDoor` call, and add a test
that a TS-routed logger subcommand with the replay transport unconfigured logs
`python`. Check the other internal-fallback sites (`consult`, `memories
--search`) for the same shape while there.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Found while reviewing CR059, whose whole point is that `front-door.log` now
records live sessions. Captured at CR059's review on 2026-09-08 rather than
fixed inside it: CR059 changes callers, this changes the front door's logging
contract.
