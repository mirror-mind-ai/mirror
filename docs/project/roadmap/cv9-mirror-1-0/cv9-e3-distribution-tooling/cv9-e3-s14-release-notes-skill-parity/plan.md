[< CV9.E3.S14](index.md)

# Plan — CV9.E3.S14 Release Notes Skill Parity

## Current State

The core runtime command exists:

```bash
uv run python -m memory runtime release-notes [latest|vX.Y.Z]
```

Pi has `.pi/skills/mm-release-notes/SKILL.md`. Gemini and Codex rely on `.agents/skills/`, which currently symlinks many Pi skills but does not include `mm-release-notes`. Claude Code has project-local `.claude/skills/mm:*` skills, but no `mm:release-notes` skill. The help skills also omit release notes.

## Design

Make release-note access a portable skill surface with no new core behavior:

- create `.agents/skills/mm-release-notes` as a symlink to `../../.pi/skills/mm-release-notes`, matching the existing shared-skill pattern;
- add `.claude/skills/mm:release-notes/SKILL.md` with Claude command syntax and the same verbal contract as Pi;
- update `.pi/skills/mm-help/SKILL.md` and `.claude/skills/mm:help/SKILL.md` so users can discover release notes;
- update `AGENTS.md` available skills so Codex/agent context advertises the command;
- update `REFERENCE.md` command table if necessary to include the runtime-specific wrappers.

## Scope Boundary

Do not change `src/memory/cli/runtime.py` unless validation reveals an actual bug. This story is about runtime affordance parity, not release-note rendering.

## Validation Approach

Automated or structural validation:

```bash
test -L .agents/skills/mm-release-notes
test -f .claude/skills/mm:release-notes/SKILL.md
rg "release-notes" .pi/skills/mm-help/SKILL.md .claude/skills/mm:help/SKILL.md AGENTS.md REFERENCE.md
uv run python -m memory runtime release-notes latest
uv run python -m memory runtime release-notes v0.8.0
```

Targeted checks:

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py -q
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
git diff --check
```

Full test suite is not expected to be necessary unless code changes.

## Risks

- Symlink portability: existing `.agents/skills` already uses symlinks, so following that pattern is lower risk than copying files.
- Help drift: multiple runtime help files can diverge. Keep the change small and command-specific.
- Claude command naming: use `/mm:release-notes` to match existing Claude namespace conventions.
