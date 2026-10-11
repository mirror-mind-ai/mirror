[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR083 — Path-normalization assumptions in the ported tree are untested, and one shipped wrong for two plateaus

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

Python normalizes a caller-supplied project path at the boundary, with
`expanduser().resolve()`. The TypeScript port does it inconsistently, and nothing
tests the difference, because every fixture and every real caller happens to pass
an already-absolute, already-expanded path: the front door reads `project_path`
from the journey row, and `journey set-path` is given an absolute path in practice.

Two instances are known, one of them shipped.

**1. `resolveStoryDirectory` returned a relative path where Python resolves.**
Python's `resolve_story_directory` and `_parent_directory` both compute
`(project_path / "docs" / "project" / "roadmap").resolve()`. The port carried the
project root through unresolved, so with a relative project path Python printed
absolute package paths and TypeScript printed relative ones in the same surface.

It shipped in CV22.DS7.US8 plateau 1, survived plateau 2 and a 145-row roadmap
corpus, and was found at plateau 3 only by accident — the lifecycle replay had to
run under a repo-relative project root for an unrelated reason (`plan_checkpoint`
prints unrelativized paths, CR082), and the divergence surfaced immediately. Fixed
in `ts/src/builder/storyPaths.ts` at plateau 3 commit 3a.

The consequence was not only cosmetic. `create_story_directory`'s confinement
guard is `target.is_relative_to(roadmap_root)` — the check that stops a `../` in a
candidate-table code cell from writing outside `docs/project/roadmap/` (D-012). A
guard that compares a possibly-relative candidate against a resolved root is
weaker than the one being ported, and it is the last line before a filesystem
write.

**2. `expanduser` is missing throughout the ported builder tree.** Python calls it
in seven places — `artifact_surfaces._display_path`, `home_surface` (twice),
`lifecycle._context_summary`, `pull_candidates` (twice), `roadmap_position` — and
the TypeScript tree contains no tilde handling at all. A journey whose
`project_path` is stored as `~/dev/project` therefore diverges: Python expands it
and reads the real tree, TypeScript treats `~` as a literal directory name, finds
nothing, and reports every terrain file missing, every roadmap empty, and every
artifact path unrelativized.

This is not hypothetical about the stored value: nothing normalizes on write, so
the row holds whatever was passed to `journey set-path`.

## Expected Behavior

One boundary normalization, applied by every ported module that accepts a project
or home path, matching Python's `expanduser().resolve()` — and a test per
path-consuming leaf that passes a RELATIVE and a `~`-prefixed path, since those are
the two shapes the current fixtures never produce.

Stated as the class rather than the two instances: **a ported module must not
assume a path has already been normalized, because Python does not assume it.**

## Impact

Low in production today and awkward to reason about, which is exactly why it is
worth a record rather than a memory. Real installs store absolute paths, so
neither instance is currently reachable through the front door. What makes it more
than trivia:

- the first instance sat undetected across two plateaus and a committed golden
  corpus, so the existing evidence shape does not catch this class at all;
- it touches a confinement guard, where "weaker than Python" is the wrong
  direction;
- the `~` instance would present as "Builder sees an empty roadmap", which reads
  like data loss to a Navigator and would be debugged as one.

## Plan Or Decision

Not planned. Three decisions belong to whoever takes it:

1. **Audit scope.** The builder tree is the known offender, but `backup`,
   `explorer`, `soul`, and `descriptor` also accept paths, and the same
   Python/TypeScript asymmetry may exist there. Auditing the builder tree alone is
   cheap and incomplete; auditing every ported family is the honest scope.
2. **Normalize at the boundary, or at the source.** A shared
   `normalizeProjectPath` helper fixes every consumer. Normalizing in
   `journey set-path` would make the whole class unreachable, but it changes what
   the row contains and is therefore a product decision, not a port fix.
3. **How to grade `expanduser` hermetically.** Testing tilde expansion means
   controlling `HOME`, which is precisely the hazard CR065 tracks — a generator
   that resolves the developer's real home has already leaked one golden into
   version control. The fixture design is part of the work, not an afterthought.

## Evidence

- `ts/src/builder/storyPaths.ts` — the plateau-3 fix and its comment naming why the
  defect was invisible.
- Commit `314758ef` — plateau 3 commit 3a, where the first instance was found and
  fixed; its handoff section records the accident that surfaced it.
- `src/memory/builder/` — the seven `expanduser()` call sites, against a TypeScript
  builder tree with no tilde handling.
- CR082 — the reason the replay ran under a relative root in the first place, which
  is the only reason instance 1 was caught.

## Outcome

_Pending._

## Provenance

Found on 2026-09-13 while porting Scope C of CV22.DS7.US8, and captured at the
Navigator's request in preference to fixing instance 2 inline: grading tilde
expansion needs an oracle case and a `HOME`-controlled fixture, and writing
ungraded behavior would break the rule this story is built on — the corpus is
generated from Python before the port exists.
