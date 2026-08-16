[< RS008](index.md) · [Canonical status](../index.md#change-requests)

# CR054 — Assign Workspace And Web Hierarchy Parity Ownership

## Problem

The CV22 strangler primarily defines its unit as `command + args → stdout`, but
`v0.31.9` also changed observable Python-backed Workspace and web contracts:
`journeyMap`, complete `locationPath`, immediate siblings, journey selectors with
lineage, recursive All Journeys rendering, and bounded visibility for malformed cycles.
No current CV22 slice clearly owns preserving those JSON and browser-facing contracts
when the Python web backend is ported or retired.

## Expected Behavior

CV22 names one concrete Delivery Story or convergence slice that owns each affected
Workspace/web contract and its parity evidence. Ownership distinguishes the TS core
read model from the already-JavaScript renderer, defines the stable JSON shapes that
must survive backend transfer, and prevents Python retirement while an unnamed web
surface still depends on Python-only recursive behavior.

The decision preserves exact selected-journey scoping: ancestors organize navigation
but never contribute inherited conversations, memories, tasks, attachments, search,
instructions, status, routing, or Builder state.

## Impact

Without named ownership, CLI parity can be green while Python retirement silently drops
or changes a released browser surface. The migration's command inventory would be
complete only on paper.

## Plan Or Decision

Not planned. Planning should inventory the affected server endpoints, Workspace surface
DTOs, static JavaScript consumers, and runtime ownership after convergence. It should
then either bind them to an existing CV22 story or promote a bounded Delivery Story.
This CR does not require simultaneously rewriting the browser client.

## Evidence

`v0.31.9` changed `src/memory/surfaces/workspace.py` and
`src/memory/web/static/app.js` alongside the journey service and CLI. The current CV22
done condition names CLI/MCP commands but does not explicitly account for these
Workspace API projections.

## Outcome

Captured. No roadmap ownership, implementation, assignment, or focus was selected.
