[< RS010](index.md)

# CR071 — Collapse the triplicated skill command references

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

Each skill exists three times — `.pi/skills/`, `.claude/skills/`, and
`plugins/mirror-mind/skills/` — with the command invocations written out in
full in each copy. `mm-soul` carries 20 invocations per copy, 60 in total, and
CV22.DS7.US6 had to rewrite all 60 by search-and-replace when `soul` flipped to
the front door.

The copies differ only in the frontmatter `name` (`mm-soul` versus `mm:soul`).
Everything downstream of that is duplicated prose that must move together and
has no mechanism ensuring it does.

## Expected Behavior

A command's invocation form is written once. A flip updates one place, and the
three runtimes cannot drift apart — or, if they must stay separate files, a
check fails when their command bodies diverge.

## Impact

Rising, and this is the argument for acting rather than tolerating it. Every
remaining CV22 flip pays the same tax: DS7.US7 (`explore`), DS7.US8 (the Builder
tree, the largest skill surface in the product), and DS7.TS4. A missed copy does
not fail any test — it silently leaves one runtime calling Python after the flip,
which is the CR059 defect in a different costume: a route that is flipped in the
routing table but not in what actually invokes it.

## Plan Or Decision

Options, in rough order of cost: generate the runtime copies from one source at
build or release time; or keep three files and add a CI check that their command
bodies match modulo the frontmatter.

Not decided here. What is decided is that discovering the divergence by hand
during a flip is not a strategy that survives US8.

## Evidence

CV22.DS7.US6 plateau 7: `uv run python -m memory soul` → front door, 20
invocations replaced in each of three files, verified only by grepping that zero
remained.

## Outcome

_Pending._

## Provenance

Found while flipping `soul` in CV22.DS7.US6 plateau 7 and captured at that
story's Debt Review on 2026-09-08.
