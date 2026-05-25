[< CV9.E3.S16](index.md)

# Plan — CV9.E3.S16 Stable Promotion Execution Path

## Current State

`runtime release-doctor --target vX.Y.Z` can inspect promotion readiness. It is intentionally read-only. A maintainer still needs to create a tag, advance stable, and optionally push using manual git commands.

S16 turns that final mutation path into a controlled runtime command while preserving conservative release boundaries.

## Design

Add:

```bash
uv run python -m memory runtime release-promote --target vX.Y.Z [--dry-run] [--push] [--stable stable]
```

Default behavior is local-only mutation:

- run release doctor;
- block on doctor failures;
- create missing tag at `HEAD`;
- reuse existing tag if already at `HEAD`;
- create or fast-forward local stable branch to `HEAD`;
- do not push unless `--push` is passed.

`--dry-run` should run the doctor and print the planned mutation stages without creating tags, moving branches, or pushing.

`--push` should push the target tag and stable branch to `origin` after local promotion succeeds.

## Stage Model

Use the existing `RuntimeUpdateStage` shape or a new release-promotion stage if clearer. Proposed stages:

1. `release doctor`
2. `tag`
3. `stable branch`
4. `push tag` (only with `--push`)
5. `push stable` (only with `--push`)

Stage states: `pass`, `warn`, `fail`, `skip`.

## Git Commands

Read-only planning:

```bash
git rev-parse HEAD
git rev-parse vX.Y.Z
git merge-base --is-ancestor stable HEAD
```

Mutation:

```bash
git tag vX.Y.Z HEAD
git branch --force stable HEAD   # only when fast-forward from existing stable or when stable missing
git push origin vX.Y.Z
git push origin stable
```

Important boundary: `git branch --force stable HEAD` is acceptable only after proving that the existing local stable branch is an ancestor of `HEAD`, or when the branch does not exist. It must not rewrite divergent stable history.

## Safety Rules

- Doctor failures block promotion.
- Dirty tree blocks via doctor.
- Version and release-note mismatch block via doctor.
- Existing target tag away from `HEAD` blocks via doctor.
- Existing local stable branch not ancestor of `HEAD` blocks promotion.
- Missing local stable branch can be created at `HEAD`.
- Push is opt-in.
- No fetch in this story.
- No force push.

## Test Approach

Use monkeypatched git calls and temporary files for unit tests:

- dry-run does not call mutating helpers;
- doctor failures block promotion;
- missing tag creates tag;
- tag at `HEAD` skips tag creation;
- local stable missing creates stable branch;
- local stable behind fast-forwards by branch update;
- divergent local stable blocks;
- `--push` calls push helpers only after local success;
- CLI dispatch returns non-zero on failure.

## Documentation Updates

Update:

- `REFERENCE.md` with `runtime release-promote`;
- S16 result after validation;
- CV9.E3 index;
- worklog.

## Open Question

Should the command require an extra confirmation flag for mutation, such as `--yes`, even when not pushing? Current proposal: no. The command name `release-promote` is explicit, `--dry-run` exists, the doctor gate blocks incoherence, and local-only mutation is recoverable before push. Push remains explicit through `--push`.
