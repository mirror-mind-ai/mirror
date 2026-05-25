[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S15 — Release Promotion Checklist / Doctor

**Epic:** CV9.E3 Distribution & Tooling  
**Status:** ✅ Done  
**User-visible outcome:** A maintainer can run a read-only release promotion doctor before advancing `stable`, seeing a clear checklist of what is ready, what is missing, and what must happen before promotion.

---

## Why

Mirror Mind now has stable/main channels, release notes, release-aware update notices, and release-note skill parity. The next risk is operational: promoting `stable` must not depend on memory or improvisation. A release promotion should have a repeatable preflight that checks version, release notes, git state, tag state, branch relationship, and validation evidence before any mutating promotion path exists.

## Scope

In scope:

- Add a read-only runtime release doctor command.
- Check the local repository state needed before stable promotion.
- Verify package version and release-note presence for a target version.
- Verify `docs/releases/index.md` references the target release.
- Inspect whether the release tag exists and where it points.
- Inspect whether `origin/stable` already contains the current commit.
- Print a checklist with pass, warning, and fail states.
- Keep release promotion itself out of scope.

Out of scope:

- Creating tags.
- Pushing or fast-forwarding `stable`.
- Bumping versions or writing release notes.
- Querying GitHub Actions as a hard requirement.
- Updating production clones.

## Proposed Command Shape

```bash
uv run python -m memory runtime release-doctor --target v0.9.0
uv run python -m memory runtime release-doctor --target v0.9.0 --base main --stable stable
```

The command is read-only. It may inspect local and remote-tracking refs, but it must not fetch, tag, merge, push, edit files, or run migrations.

## Acceptance Criteria

- The release doctor exits zero only when required checks pass.
- The output distinguishes `pass`, `warn`, and `fail` checks.
- Missing release note, version mismatch, dirty worktree, missing repository, and missing release index entry are failures.
- Existing tag mismatch is a failure; existing tag at `HEAD` is pass; missing tag is a warning before promotion.
- `origin/stable` already containing `HEAD` is pass; `origin/stable` behind `HEAD` is warning; divergent/ahead states are failures or attention-needed.
- Docs explain that the doctor does not promote anything.

## Result

`python -m memory runtime release-doctor --target vX.Y.Z` now provides a read-only promotion readiness checklist.

What changed:

- added release doctor dataclasses and rendering;
- added checks for repository, clean git state, package version, release-note file, release-note heading, release index, tag state, and stable ref relationship;
- added CLI dispatch under `runtime release-doctor`;
- documented the command in `REFERENCE.md`.

Warnings return exit code `0`; failures return exit code `1`. This preserves the distinction between a normal pre-promotion state, such as a missing tag or stable not yet advanced, and an incoherent release state, such as version mismatch or missing release notes.

Validation:

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py -q
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
uv run --extra dev mypy src/memory/cli/runtime.py
git diff --check
uv run python -m memory runtime release-doctor --target v0.9.0
uv run python -m memory runtime release-doctor --target v0.8.0
```

Result: 90 targeted runtime tests passed; ruff, format, story-scoped mypy, and whitespace checks passed. Manual smoke showed expected read-only failures in the dirty dev clone: `v0.9.0` is not prepared yet, and `v0.8.0` tag points to the historical release commit rather than current `HEAD`.

## See also

- [CV9.E3.S12 First Stable Release Publication](../cv9-e3-s12-first-stable-release-publication/index.md)
- [CV9.E3.S13 Release-Aware Update Notices](../cv9-e3-s13-release-aware-update-notices/index.md)
- [CV9.E3.S14 Release Notes Skill Parity](../cv9-e3-s14-release-notes-skill-parity/index.md)
- [Versioning](../../../../../process/versioning.md)
