[< RS008](index.md) · [Canonical status](../index.md#change-requests)

# CR051 — Restore Recursive Journey Read And CLI Rendering Parity

## Problem

The TS journey option sorter and CLI renderer still implement roots followed by
immediate children. Deep descendants are omitted, option DTOs lack `depth` and complete
`lineage`, malformed rootless cycles are not deliberately retained as bounded visible
items, and child output still uses leading-space indentation that can become a Markdown
code block.

The `journeys` command is already routed to TS on the migration branch, so this is an
observable parity defect rather than dormant future scope.

## Expected Behavior

Given the same journey rows as the `v0.31.9` Python oracle, TypeScript returns every
journey exactly once in deterministic depth-first order, including arbitrary-depth
descendants, unknown-parent roots, and bounded malformed cyclic metadata. Every option
includes numeric `depth` and complete root-to-item `lineage`.

The CLI renders all depths using column-zero `│` connectors, preserves status/name
ordering and existing stage/description behavior, and never emits hierarchy lines that
begin with four spaces.

## Impact

Today a deep tree can lose grandchildren and deeper nodes when read through the TS
front door even though those journeys remain in the database. Users receive an
incomplete organizational map from a command already considered ported.

## Plan Or Decision

Not planned. Planning should update the pure hierarchy algorithm, DTO types, renderer,
synthetic golden, render golden, real-DB-copy parity probe, and tests for deep trees,
unknown parents, duplicate prevention, and cycles. It must preserve exact journey
scoping and avoid any inherited content semantics.

## Evidence

A read-only probe against the pre-refresh implementation returned only `root` and
`area` for `root → area → business → product`. After refreshing to remote commit
`ea54d4c`, `ts/src/journey/journeyOptions.ts` and
`ts/src/frontDoor/render/journeys.ts` still use roots-then-immediate-children logic and
expose no `depth` or `lineage`.

## Outcome

Captured. No implementation, assignment, routing, or focus changed.
