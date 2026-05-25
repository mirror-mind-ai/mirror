[< CV9.E3.S15](index.md)

# Test Guide — CV9.E3.S15 Release Promotion Checklist / Doctor

## Targeted Automated Validation

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py -q
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
uv run --extra dev mypy src/memory/cli/runtime.py
git diff --check
```

Expected result: all commands pass.

## Manual Smoke

Use the dev clone only:

```bash
cd ~/Code/mirror-dev
uv run python -m memory runtime release-doctor --target v0.9.0
```

Expected result before `v0.9.0` is actually prepared: the command should print a checklist and report failures for missing or incoherent release artifacts, without mutating git refs or files.

For the existing published release:

```bash
uv run python -m memory runtime release-doctor --target v0.8.0
```

Expected result: version mismatch may fail because the working tree is no longer at the release commit, but the release note and release index checks should pass. The command remains read-only.

## Non-Mutation Check

```bash
git status --short
uv run python -m memory runtime release-doctor --target v0.9.0 || true
git status --short
```

Expected result: no new file changes appear because of the doctor command itself.
