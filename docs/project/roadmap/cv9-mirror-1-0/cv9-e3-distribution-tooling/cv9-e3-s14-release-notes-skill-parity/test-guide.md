[< CV9.E3.S14](index.md)

# Test Guide — CV9.E3.S14 Release Notes Skill Parity

## Structural Validation

```bash
test -L .agents/skills/mm-release-notes
test -f .claude/skills/mm:release-notes/SKILL.md
rg "release-notes" .pi/skills/mm-help/SKILL.md .claude/skills/mm:help/SKILL.md AGENTS.md REFERENCE.md
```

Expected result: every command exits zero. The shared `.agents` skill should point to the Pi skill, and both help surfaces should list release notes.

## Runtime Command Smoke

```bash
uv run python -m memory runtime release-notes latest
uv run python -m memory runtime release-notes v0.8.0
```

Expected result: both commands render `v0.8.0 — Stable Self-Update Foundation` from `docs/releases/v0.8.0.md`.

## Targeted Regression Checks

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py -q
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
git diff --check
```

Expected result: all commands pass.

## Manual Runtime Notes

Pi command shape:

```text
/mm-release-notes latest
/mm-release-notes v0.8.0
```

Gemini/Codex shared skill shape:

```text
/mm-release-notes latest
$mm-release-notes latest
```

Claude Code command shape:

```text
/mm:release-notes latest
/mm:release-notes v0.8.0
```

The skill should show the runtime output verbatim unless the user explicitly asks for a shorter explanation.
