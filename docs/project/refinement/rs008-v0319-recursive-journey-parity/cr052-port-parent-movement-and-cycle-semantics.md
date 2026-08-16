[< RS008](index.md) · [Canonical status](../index.md#change-requests)

# CR052 — Port Parent Movement And Cycle Semantics

## Problem

The current TS parent validator preserves the superseded two-level invariant: a parent
may not itself have a parent, and a journey with children may not gain a parent. The
released `v0.31.9` contract instead permits arbitrary depth and moving complete
subtrees, while rejecting self-parenting, unknown parents, indirect cycles, and attempts
to extend a malformed cyclic ancestry.

The TS write surface also needs explicit evidence that a move changes only
organizational position and preserves identity, `project_path`, descendants, and
filesystem content.

## Expected Behavior

TypeScript accepts any valid parent depth and allows a node that already has children
to move beneath another journey. Before mutation it walks the full proposed ancestry,
rejecting direct and indirect cycles and refusing ancestry that already loops. Unknown
parents and self-parenting remain rejected.

A successful move changes only the effective parent relation. Journey ID, identity row,
`project_path`, child relations, documents, records, and filesystem content remain
unchanged. No status or content inheritance is introduced.

## Impact

Without this parity, the TS engine rejects valid trees created by the released product
or may write parent metadata without enforcing the released cycle boundary. Either
outcome prevents safe command-authority transfer.

## Plan Or Decision

Not planned. Planning should cover the pure validator, all TS parent write routes,
metadata/column authority selected by CR050, state-diff parity on database copies, and
regression tests for arbitrary depth, subtree moves, indirect cycles, malformed cycles,
and stable identity/path behavior. Filesystem movement and automatic reparenting remain
out of scope.

## Evidence

`ts/src/journey/validateParentJourney.ts` explicitly documents and enforces
single-level nesting. `v0.31.9` replaced those Python checks with complete ancestry
walking.

## Outcome

Focused for inspection. Canonical status remains `captured`; no plan, assignment,
implementation, schema change, commit, or push is authorized by opening the CR.
