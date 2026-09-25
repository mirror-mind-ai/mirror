[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR099 — A `--global` capability binding is not idempotent

**Refinement Story:** RS010 — CV22 Oracle And Port Hygiene
**Status:** captured
**Driver:** —
**Delivery:** —

## Problem

`ext <id> bind <capability> --global` writes a row to `_ext_bindings` with
`INSERT OR IGNORE`, relying on the primary key to make a repeated bind a
no-op. The primary key includes `target_id`, which is NULL for a global
binding, and SQLite does not treat two NULLs as equal in a (non-STRICT,
rowid) primary key. So the `IGNORE` ignores nothing: binding the same
capability globally three times leaves three rows. Persona and journey
bindings carry a real `target_id` and are idempotent as intended.

CV22.DS7.TS4 measured this in both cores, then deferred it in its Debt Review
with the trigger "when DS10 leaves TypeScript as the only writer of
`_ext_bindings`". TS5 did that, and its Debt Review (2026-09-25) found that
the finding had reached neither a CR nor the debt ledger. This CR is its
durable home.

## Expected Behavior

Binding the same capability to the same target twice leaves one row, for
every target kind, `--global` included. The fix changes an on-disk
constraint: either a partial unique index over
`(extension_id, capability_id, target_kind)` where `target_id IS NULL`, or a
sentinel `target_id` for global bindings. Either way it is a schema change
under the sole custodian. It needs a migration, a custody-proof fixture, and
a rule for duplicates already on disk, since collapsing them is a write to
user data.

## Impact

Low. Duplicate rows show in `ext <id> bindings` listings and accumulate
quietly. An unbind removes them all at once, because it matches
`target_id IS ?`. Not verified at capture: whether a global binding is ever
dispatched. `selectExtensionBindings` (`ts/src/extensions/contextRuntime.ts`)
matches persona and journey targets only. If nothing reads global bindings,
that is a larger question than their duplicates, and planning should answer
it first.

## Plan Or Decision

Not planned. Captured without selecting; Current Focus unchanged. Captured by
the Navigator's decision in
[CV22.DS10.TS5's Debt Review](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts5-python-core-deletion/review.md).

## Evidence

- `ts/src/extensions/bindings.ts`: the module header records the measurement,
  and `runBind` uses `INSERT OR IGNORE`.
- `ts/src/db/schema.ts`: the `_ext_bindings` DDL, with `target_id` inside the
  primary key.
- [CV22.DS7.TS4's review](../../roadmap/cv22-typescript-core-port/cv22-ds7-command-burn-down/cv22-ds7-ts4-utility-tail-3-extension-catalog/review.md),
  finding (1), and its revisit trigger.

## Outcome

Open.
