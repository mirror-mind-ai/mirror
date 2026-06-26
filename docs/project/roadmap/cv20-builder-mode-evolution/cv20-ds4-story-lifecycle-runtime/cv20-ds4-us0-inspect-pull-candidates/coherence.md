[< Story](index.md)

# Coherence — CV20.DS4.US0 Inspect Pull Candidates

## Process

The story adapted after validation feedback. The first implementation exposed pull candidates, but the Navigator expected Ariad's roadmap snapshot grammar. `CV20.DS4.TS1 — Surface Routing Definitions` was inserted so Ariad method data declares that `show_roadmap` emits both `roadmap_snapshot` and `pull_candidates`.

## Project

DS4 now has a proper pre-Pull inspection step. The Navigator can inspect roadmap state and candidates before choosing an active item.

## Product

The behavior matches the User Story boundary. Asking to see the roadmap renders a read-only Ariad Roadmap Snapshot followed by Pull Candidates. No item is pulled and no lifecycle work is executed.

## Validation Alignment

Automated validation passed. Pi/Mirror validation passed with `sandbox-pet-store`, showing CV roadmap state, candidate delivery stories, recommended pull, and the no-lifecycle boundary.

## Result

Coherent. The story can be marked Done.
