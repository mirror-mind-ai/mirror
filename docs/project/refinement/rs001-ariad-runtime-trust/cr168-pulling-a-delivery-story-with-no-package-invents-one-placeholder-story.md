[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR168 — Pulling a Delivery Story with no package invents one placeholder story named after it

## Problem

When Pull expands a Delivery Story that has no authored package, `expandDeliveryStory`
(`ts/src/builder/expand.ts`) synthesizes one child, `<DS>.US1`, titled with the
Delivery Story's own title. It writes both packages and recommends the child. The
code calls this the empty-field case, distinct from fabricating a story over authored
content, which it refuses (the CV22.DS7 secondary defect). The result still looks like
work:

- the DS package's Outcome is its title, its Done Condition a generic sentence, and its
  candidate table one row;
- the child's story reads "As a user, I want to <title>, So that I can receive the value
  of this story";
- `DELIVERY_STORY_READY` recommends that child and the `delivery_story` flow, because
  "the Delivery Story appears coherent enough to plan, implement, and validate as one
  Navigator-facing unit". That is a judgment made over a placeholder.

A Driver who does not notice plans the placeholder as the Delivery Story's only story.
One who does must delete it, author the candidate table, and pull again.

## Expected Behavior

Pulling a Delivery Story with no package creates the package with an empty candidate
table and stops with a surface that asks for its candidate stories. No child is
invented, and no flow unit is recommended over nothing. Pulling again after the table
is authored expands as it does today for an authored package.

## Impact

Low. One manual cleanup per package-less Delivery Story, and a recommendation the
Navigator cannot trust there. CV21's index says a Delivery Story without a package
"gets one when it is pulled, and expands into User and Technical Stories", so every
remaining package-less row in a migrated roadmap meets it.

## Plan Or Decision

Captured, unassigned, 2026-10-24, from CV21.DS11's Debt Review, at the Navigator's
direction. RS001: a surface describing more than happened. Not planned. Current Focus
unchanged.

## Evidence

- CV21.DS11's first Pull, 2026-10-24: `DELIVERY_STORY_READY` recommended
  `US1 Contract & Docs Refresh` and the `delivery_story` flow;
  `ARTIFACTS_MATERIALIZED` created the DS package and
  `cv21-ds11-us1-contract-docs-refresh/index.md`. The Driver deleted the untracked US1
  scaffold, authored the candidate table (four stories), and pulled again; Expand then
  created TS1, US2, TS3, and TS4 from the table (commit `58caef44` records it).
- `ts/src/builder/expand.ts`, the `else` branch of `expandDeliveryStory`: "No authored
  package at all: synthesize one child so the Delivery Story has something
  implementable."

## Outcome

Open.
