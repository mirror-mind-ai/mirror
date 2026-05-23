[< CV9.E3.S12](index.md)

# Plan — First Stable Release Publication

## Intent

Publish the first formal stable release after the adoption of prospective versioning and stable/main update channels. This is the proof that release management, git, release notes, and self-update now agree.

The likely release is `v0.8.0`: it closes a substantial distribution/self-update arc without closing CV9 as a whole. CV9 completion remains the candidate `v1.0.0` boundary.

---

## Release Candidate

Proposed release:

```text
v0.8.0 — Stable Self-Update Foundation
```

Why MINOR:

- The release closes a major epic-level operational slice: runtime health, backup, safe update execution, updater recovery, stable/main channels, welcome version visibility, and release-note access.
- It does not close CV9/Mirror Mind 1.0.
- It is larger than a patch because it changes user-facing operational behavior and the release/update model.

---

## Implementation Steps

### 1. Version bump

Update `pyproject.toml`:

```toml
version = "0.8.0"
```

Search for active current-version claims that need updating:

```bash
rg "0\.7\.0|v0\.7\.0" README.md REFERENCE.md docs src tests
```

Historical mentions should stay historical. Active "current version" references should become `0.8.0` only when they describe the release being published.

### 2. Release note

Create:

```text
docs/releases/v0.8.0.md
```

Use the canonical release-note structure from `docs/process/release-notes.md`.

Required content:

- digest frontmatter;
- title: `# v0.8.0 — Stable Self-Update Foundation`;
- date;
- highlights;
- where we started;
- what changed;
- conscious exclusions;
- what we learned;
- next horizon.

### 3. Release index

Update `docs/releases/index.md` with a release list entry for `v0.8.0`.

### 4. Documentation coherence

Update docs if needed:

- `docs/process/worklog.md`
- roadmap S12 status/result at completion
- `docs/project/decisions.md` only if a new decision is made
- `REFERENCE.md` only if command behavior changes during the release story

### 5. Validation before tag

Run:

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py tests/unit/memory/cli/test_welcome.py tests/unit/memory/cli/test_build.py tests/unit/memory/extensions/test_migrations.py
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
uv run --extra dev mypy src/memory/cli/runtime.py src/memory/cli/welcome.py
git diff --check
uv run python -m memory runtime version --channel main
uv run python -m memory runtime release-notes latest
```

Then commit and push to `main`; wait for GitHub Actions to pass.

### 6. Tag

After CI is green:

```bash
git tag v0.8.0
git push origin v0.8.0
```

### 7. Promote stable

Fast-forward stable to the tagged release:

```bash
git fetch origin main stable --tags
git push origin v0.8.0:stable
```

If this is rejected as non-fast-forward, stop and inspect. Do not force push.

### 8. Production update validation

In `~/mirror`:

```bash
uv run python -m memory runtime update --check
uv run python -m memory runtime update
uv run python -m memory runtime status
uv run python -m memory runtime version
uv run python -m memory runtime release-notes latest
uv run python -m memory welcome
```

Expected:

- update channel remains `stable`;
- update fast-forwards to the `v0.8.0` release commit;
- backup is printed;
- migrations pass or are skipped appropriately;
- status is ready;
- version is `0.8.0`;
- release notes latest renders `v0.8.0`;
- welcome shows `Version 0.8.0 · channel stable`.

---

## Risks

- Some active docs may still say `0.7.0` as current version.
- Release note parser expects the title format `# vX.Y.Z — Title`.
- Stable promotion must be fast-forward only.
- Production currently has local branch `main` with update channel `stable`; this is accepted for S12 and documented.

---

## Completion

When production updates successfully through `stable`, mark S12 done and record the release in the worklog.
