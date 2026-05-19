[< Process](../index.md)

# Release Notes

A release note is not a changelog. It is the narrative record of a closed arc of work, anchored in a version number.

The version says which level of work collapsed into a release. The release note says what actually happened, why it mattered, and what remains consciously outside the release. See [Versioning](versioning.md) for the number rule.

---

## Location

Future release notes live in:

```text
docs/releases/vMAJOR.MINOR.PATCH.md
```

Release notes begin prospectively from the adoption of CV9.E5. Historical releases through `v0.7.0` remain documented by Git tags and the [Worklog](worklog.md). Retroactive release notes may be added later, but they are not required.

---

## What a Release Note Does

A good release note makes four things clear:

- where the work started,
- what changed,
- what decisions shaped the release,
- what the release means now.

It should be specific enough to reconstruct the arc without reading every commit, but narrative enough that it does not become a mechanical inventory.

---

## Canonical Structure

Use this structure unless the release has a strong reason to differ.

```markdown
---
digest: >
  Four to six sentences summarizing the release, the unit of work closed,
  the central decision, and the state the project reaches afterward.
---

# vX.Y.Z — Release Title

**Date:** YYYY-MM-DD

## Highlights

- Concrete fact.
- Concrete fact.
- Concrete decision.
- Concrete exclusion or limitation, when important.

## Where We Started

The tension, context, or problem that made this release necessary.

## What Changed

The narrative arc of the work. Decisions, turns, implementation shape, and
observable outcomes.

## Conscious Exclusions

What did not enter this release, and why.

## What We Learned

Sensemaking from the cycle. Optional for small patches, recommended for major
or minor releases.

## Next Horizon

What is visible from here. Horizon, not promise.
```

---

## Writing Principles

### Tension before resolution

Start from what was at stake. Without tension, the release note becomes a list of changes.

### Specific over generic

Name concrete changes: commands, files, runtimes, schema tables, docs, behaviors, and decisions.

### Decisions, not only results

If a path was chosen over another, name the choice and the reason. Decisions are part of the release.

### Honest exclusions

A release note should say what was left out intentionally. This prevents the next cycle from inheriting false assumptions.

### Horizon, not promise

The next section should show what is visible, not commit to dates or scope beyond what has been decided.

---

## Voice

Mirror Mind release notes may use a project voice. They do not need to be impersonal, but they should remain clear and useful to future contributors.

Internal release notes can use first person when sensemaking benefits from it. Public release notes should prefer the project as the actor unless a personal origin or decision is materially relevant.

---

## Linking Versions

After CV9.E5, every future version mentioned in docs should link to its release note once that note exists.

Before a version is released, references should point to the roadmap item that is expected to produce the release. When the release note is created, update those links during the coherence check.

Historical versions through `v0.7.0` may remain linked to tags, worklog entries, or plain text unless and until retroactive release notes are created.

---

## Anti-Patterns

- Changelog disguised as prose.
- Passive voice everywhere.
- Promising future scope as if it were already decided.
- Omitting conscious exclusions.
- Publishing a version number with no narrative anchor.
