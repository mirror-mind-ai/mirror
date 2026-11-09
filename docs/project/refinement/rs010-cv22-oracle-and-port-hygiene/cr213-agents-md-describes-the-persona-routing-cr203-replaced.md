[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR213 · `AGENTS.md` describes the keyword persona routing CR203 replaced, and points the model at a command that still runs it

## Problem

The "Routing protocol" paragraph in `AGENTS.md` says:

- each persona carries `routing_keywords`;
- `detectPersona` (`ts/src/persona/detectPersona.ts`) scores the query against them at
  runtime;
- `mirror detect-persona "<query>"` inspects the active routing.

Since CR203 (v0.41.0), a turn's persona comes from the Decisions router
(`ts/src/mirror/personaRouter.ts`). If the router does not choose, the turn takes the
Journey's `default_persona`; if there is none, the turn has no persona.

`mirror detect-persona` (`ts/src/frontDoor/render/detectPersona.ts`) and the MCP tool
`detect_persona` (`ts/src/mcp/tools/deterministic.ts`) still run the keyword scorer. So
the instructions send the model to a command that answers a different question from the
one the runtime asks.

## Expected Behavior

- `AGENTS.md` describes routing as it runs, or it says that the delivered line names
  the persona and leaves the mechanism to the reference.
- `detect-persona` and `detect_persona` either say they are the keyword scorer or answer
  from the router.
- The generated plugin copy follows.

## Impact

Small. The model gets a wrong picture of routing, and runs an extra command when it
wants to check routing.

## Plan Or Decision

Captured, unassigned, 2026-11-09, at the Navigator's direction, while reading the shipped
operating instructions for CR211. It edits the same file, so the two can travel
together.

Not planned.

## Evidence

- `AGENTS.md` lines 109–114 and `plugins/mirror-mind/rules/AGENTS.md` (the same text).
- `ts/src/mirror/doorman.ts` `runDelta` and `ts/src/mirror/defaultResolution.ts` call
  `routeTurnPersona`. Neither calls `detectPersona`.
- The only remaining importers of `detectPersona` are
  `ts/src/frontDoor/render/detectPersona.ts` and `ts/src/mcp/tools/deterministic.ts`.

## Outcome

Pending: captured, not planned.
