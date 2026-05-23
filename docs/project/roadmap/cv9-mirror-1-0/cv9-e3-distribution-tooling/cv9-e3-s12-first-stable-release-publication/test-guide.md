[< CV9.E3.S12](index.md)

# Test Guide — First Stable Release Publication

This story publishes the first formal release on the stable-channel model. Verification covers version consistency, release-note readability, CI, tag/stable promotion, and production self-update.

---

## Local Automated Checks

Run from the dev clone:

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py tests/unit/memory/cli/test_welcome.py tests/unit/memory/cli/test_build.py tests/unit/memory/extensions/test_migrations.py
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
uv run --extra dev mypy src/memory/cli/runtime.py src/memory/cli/welcome.py
git diff --check
```

Expected: all commands pass.

---

## Version Checks

```bash
rg 'version = "0\.8\.0"' pyproject.toml
uv run python -m memory runtime version --channel main
```

Expected:

```text
Version: 0.8.0
Update channel: main
```

Search for stale current-version claims:

```bash
rg "Current version:\s*0\.7\.0|Version:\s*0\.7\.0|current version.*0\.7\.0" README.md REFERENCE.md docs src tests || true
```

Expected: no active current-version claims. Historical mentions are allowed when clearly historical.

---

## Release Note Checks

```bash
test -f docs/releases/v0.8.0.md
rg "^# v0\.8\.0 — Stable Self-Update Foundation" docs/releases/v0.8.0.md
rg "^digest: >" docs/releases/v0.8.0.md
rg "^## Highlights|^## Where We Started|^## What Changed|^## Conscious Exclusions|^## What We Learned|^## Next Horizon" docs/releases/v0.8.0.md
uv run python -m memory runtime release-notes latest
uv run python -m memory runtime release-notes v0.8.0
```

Expected: runtime release notes render `v0.8.0`, digest, and highlights.

---

## CI Check

After pushing the release commit to `main`:

```bash
gh run list --limit 1 --json databaseId,status,conclusion,headSha
gh run watch <run-id> --exit-status
```

Expected: CI green before tagging or promoting stable.

---

## Tag Check

After CI green:

```bash
git tag --list v0.8.0
git rev-parse v0.8.0
git push origin v0.8.0
```

Expected: tag exists locally and remotely on the release commit.

---

## Stable Promotion Check

Promote without force:

```bash
git fetch origin main stable --tags
git push origin v0.8.0:stable
```

Expected: push succeeds as a fast-forward. If rejected, stop and inspect.

Verify remote stable:

```bash
git ls-remote --heads origin stable
git ls-remote --tags origin v0.8.0
```

Expected: `stable` and `v0.8.0` point to the same commit.

---

## Production Self-Update Smoke

Run from `~/mirror`:

```bash
uv run python -m memory runtime version
uv run python -m memory runtime update --check
uv run python -m memory runtime update
uv run python -m memory runtime status
uv run python -m memory runtime version
uv run python -m memory runtime release-notes latest
uv run python -m memory welcome
```

Expected:

- Before update: channel is `stable` and update is available.
- During update: backup path is printed and fast-forward is used.
- After update: status is ready.
- Version is `0.8.0`.
- Release notes latest renders `v0.8.0`.
- Welcome shows `Version 0.8.0 · channel stable`.

---

## Completion Evidence

Record in `docs/process/worklog.md`:

- release commit;
- tag;
- stable promotion result;
- production backup path;
- production status/version/release-notes/welcome validation.
