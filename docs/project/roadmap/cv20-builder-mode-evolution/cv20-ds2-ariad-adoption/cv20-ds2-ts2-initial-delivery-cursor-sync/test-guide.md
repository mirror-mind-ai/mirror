[< Story](index.md)

# Test Guide — CV20.DS2.TS2 Initial Delivery Cursor Sync

## Automated Validation

```bash
uv run pytest tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_method_adoption.py
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

## Validation Evidence

Recorded during implementation:

```text
uv run pytest tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_method_adoption.py
41 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
125 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

## CLI Smoke

```bash
uv run python -m memory build sync-cursor --journey sandbox-pet-store --method ariad
```

Expected output:

```text
■ Builder Delivery Cursor Synced

journey
sandbox-pet-store

method
ariad

active item
none

active checkpoint
none

pending confirmation
none

last delivery event
template_preparation

boundary
No story lifecycle work was executed.
```

CLI smoke passed with `sandbox-pet-store`:

```text
■ Builder Delivery Cursor Synced

journey
sandbox-pet-store

method
ariad

active item
none

active checkpoint
none

pending confirmation
none

last delivery event
template_preparation

boundary
No story lifecycle work was executed.
```

## Pass Condition

- Cursor state persists in SQLite runtime state.
- Cursor can be read back by helper code.
- Sync requires Ariad adoption.
- Sync does not mutate roadmap files.
- Sync does not execute lifecycle work.
