[< CV9.E3.S13](index.md)

# Test Guide — CV9.E3.S13 Release-Aware Update Notices

## Automated Validation

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py tests/unit/memory/cli/test_welcome.py
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
uv run --extra dev mypy src/memory/cli/runtime.py src/memory/cli/welcome.py
git diff --check
```

Expected result: all commands pass, except any explicitly recorded pre-existing project-wide typing debt outside the story scope.

## Manual Smoke

Use the dev clone only:

```bash
cd ~/Code/mirror-dev
uv run python -m memory runtime update --dry-run --channel stable
uv run python -m memory runtime update --check --channel stable
```

Expected result:

- commands do not mutate files except any intentional local git fetch performed outside `--check` or `--dry-run`;
- stable-channel notices mention release details only when they are available from local refs;
- when release details are unavailable, the output says so honestly and still gives the preview/update route.

## Production Boundary

Do not run mutating `runtime update` in `~/mirror` as part of this story. Production validation belongs to the future fresh-user or production smoke story.
