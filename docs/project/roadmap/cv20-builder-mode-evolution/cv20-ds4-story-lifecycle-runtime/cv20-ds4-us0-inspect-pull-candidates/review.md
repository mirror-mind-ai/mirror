[< Story](index.md)

# Review — CV20.DS4.US0 Inspect Pull Candidates

## Changed Surface

- Added `/Users/alissonvale/Code/mirror-dev/src/memory/builder/pull_candidates.py` for roadmap snapshot and pull candidate inspection.
- Extended `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py` with `memory build pull-candidates --method ariad`.
- Updated `/Users/alissonvale/Code/mirror-dev/.pi/skills/mm-build/SKILL.md` so roadmap inspection requests route to the contained command.
- Added `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/builder/test_pull_candidates.py` and CLI coverage.
- After validation feedback, added DSL surface routing through `CV20.DS4.TS1` so roadmap inspection emits both `roadmap_snapshot` and `pull_candidates`.

## Refactoring Done

- Moved roadmap inspection behavior behind a contained Builder command instead of relying on the skill to summarize docs manually.
- Made surface emission configurable through Ariad method data.
- Kept roadmap inspection read-only.

## Debt Carried Forward

- Candidate extraction supports the current sandbox compact roadmap format and formal story `index.md` files. A richer taxonomy-aware roadmap parser may still be needed later in DS4.

## Review Decision

No debt action required before closure.
