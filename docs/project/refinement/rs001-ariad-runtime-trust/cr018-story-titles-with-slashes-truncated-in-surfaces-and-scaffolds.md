[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR018 — Story titles containing `/` are truncated to the text after the last slash in surfaces and scaffolds

## Problem

When a pulled item's title contains a `/`, the Ariad surfaces and the Plan
scaffold render only the text after the **last** slash. Two reproductions on
2026-09-07, with a consistent signature:

- `CV8.DS4.TS1` — authored title (tail) and what `PLAN_CHECKPOINT` rendered:

  ```text
  … (ver [CV8.DS5](../cv8-ds5-aposentadoria-da-superficie-web/index.md)): o caminho morto sai sem ressalva
  Plan the smallest coherent, testable slice for index.md)): o caminho morto sai sem ressalva.
  ```

  The last slash is inside the link path.
- `CV8.DS4.TS3` — authored title (fragment) and what `DELIVERY_STORY_IDENTIFIED`
  and `PLAN_CHECKPOINT` rendered:

  ```text
  … itens `pub`/`allow(dead_code)` (Rust), auditoria de chaves i18n …
  `allow(dead_code)` (Rust), auditoria de chaves i18n …
  ```

  The last slash is between two inline-code spans.

Prose with a slash is being split by a rule meant for paths (or for a
`code/title` pair). The same rule reached the Plan scaffold: `plan.md` and
`index.md` were generated with the truncated title in their Objective, Scope
and Acceptance sections, and the runtime's non-goal list named sibling stories
by their truncated titles too.

A second, related symptom lives in Expand: the child-story `index.md`
scaffolds echo the **full** authored title — Markdown links included — five
times each, at the Delivery Story's relative depth, so every link inside the
scaffold is one level short once the file sits in the story's own folder. The
consuming project documented that side as its own finding
(kia-desktop CR193: 17 broken relative links found, the scaffold interpolation
the dominant cause).

## Expected Behavior

A title is prose. It is carried verbatim through surfaces and scaffolds, or
truncated only by the surface's width rule with a visible ellipsis. No
character inside a title is a delimiter.

Scaffolds that interpolate a title into a file at a different depth either
rewrite the relative links for the destination or interpolate a link-free form
of the title; they never emit links that resolve nowhere.

## Impact

The checkpoint the Navigator is asked to approve describes a story by a
fragment of its name, sometimes a meaningless one (`index.md)): o caminho …`).
The generated artifacts carry the same fragment into the project's roadmap,
where the Driver must rewrite them before they can be read — which the
`kia-desktop` Driver did for all three stories of CV8.DS4. Sister of CR004
(scaffold **replacing** authored content); this is about what the scaffold
**contains**.

## Plan Or Decision

Pending. Find the split (a `rsplit("/")` or path-style parse on the item
title, probably where an item code/title pair or a roadmap path is derived),
carry the title as an opaque string, and add a regression fixture with a
title containing a link, an inline-code slash, and a bare slash. Decide
separately how Expand should treat linked titles at depth (rewrite vs strip).

## Evidence

Session of 2026-09-07 on journey `kia-desktop`. The `PLAN_CHECKPOINT` for
`CV8.DS4.TS1` and the `DELIVERY_STORY_IDENTIFIED` / `PLAN_CHECKPOINT` for
`CV8.DS4.TS3` as rendered by the runtime; the generated
`cv8-ds4-ts1-…/plan.md` and `cv8-ds4-ts3-…/plan.md` before the Driver rewrote
them (visible in the kia-desktop history as the scaffold the story commits
replaced). Depth symptom: kia-desktop CR193 and the five `TD-007` / `CR143`
link repairs it records.

## Outcome

Pending.
