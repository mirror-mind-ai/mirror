[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S16 — Stable Promotion Execution Path

**Epic:** CV9.E3 Distribution & Tooling  
**Status:** ✅ Done  
**User-visible outcome:** A maintainer can promote a validated release to the stable channel through a controlled command path instead of performing ad hoc git tag and branch operations.

---

## Why

S15 made release promotion readiness visible through a read-only doctor. The next missing piece is a controlled execution path that performs the promotion steps only after the doctor says the release is coherent enough to proceed.

Stable promotion should remain conservative: no implicit release creation, no version guessing, no dirty tree, no force push. The command should make each mutation visible and stop at the first unsafe condition.

## Scope

In scope:

- Add a runtime release promotion command.
- Reuse the release doctor as a preflight gate.
- Create the target tag only when missing and all failure checks are clear.
- Refuse to move an existing mismatched tag.
- Fast-forward the local stable branch to `HEAD`.
- Push the tag and stable branch only when explicitly requested or confirmed by a flag.
- Print a stage checklist and recovery hints.
- Keep all mutation conservative and git-native.

Out of scope:

- Writing release notes.
- Bumping version.
- Querying or waiting for GitHub Actions.
- Updating production clones.
- Running full CI automatically.
- Force pushing, rebasing, or rewriting tags.

## Proposed Command Shape

Preview:

```bash
uv run python -m memory runtime release-promote --target v0.9.0 --dry-run
```

Local promotion:

```bash
uv run python -m memory runtime release-promote --target v0.9.0
```

Remote publication:

```bash
uv run python -m memory runtime release-promote --target v0.9.0 --push
```

## Acceptance Criteria

- `--dry-run` prints the planned promotion stages and does not mutate tags or branches.
- Promotion refuses to run when the release doctor has failures.
- Missing tag is created at `HEAD` only after the doctor passes with warnings only.
- Existing tag at `HEAD` is reused; existing tag elsewhere blocks promotion.
- Stable moves by fast-forward only.
- Push requires explicit `--push`; default local promotion does not push.
- Output clearly shows every stage and whether it passed, skipped, warned, or failed.
- Docs state that release notes and version bumps must already exist before promotion.

## Result

`python -m memory runtime release-promote --target vX.Y.Z` now promotes a release through a controlled runtime path.

What changed:

- added a release promotion result model and renderer;
- added `runtime release-promote --target vX.Y.Z [--dry-run] [--push]`;
- promotion runs `release-doctor` first and blocks on failures;
- missing tags are created at `HEAD` only after the doctor passes;
- existing tags at `HEAD` are reused and existing tags elsewhere block;
- local `stable` is created or fast-forwarded only when safe;
- remote publication requires explicit `--push`;
- dry-run does not mutate tags, branches, refs, or files.

Validation:

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py -q
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
uv run --extra dev mypy src/memory/cli/runtime.py
git diff --check
uv run python -m memory runtime release-promote --target v0.9.0 --dry-run
```

Result: 98 targeted runtime tests passed; ruff, format, story-scoped mypy, and whitespace checks passed. Manual dry-run in the dev clone failed safely because `v0.9.0` is not prepared and the working tree is dirty; no tags or branches were created.

## See also

- [CV9.E3.S15 Release Promotion Checklist / Doctor](../cv9-e3-s15-release-promotion-doctor/index.md)
- [Versioning](../../../../../process/versioning.md)
- [Release Notes](../../../../../process/release-notes.md)
