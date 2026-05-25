[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S14 — Release Notes Skill Parity

**Epic:** CV9.E3 Distribution & Tooling  
**Status:** ✅ Done  
**User-visible outcome:** Users can ask for Mirror Mind release notes naturally across supported runtime skill surfaces, not only through the Python runtime command or Pi-only skill.

---

## Why

`python -m memory runtime release-notes` exists and Pi has `/mm-release-notes`, but release-note access is not yet visibly available across every supported runtime surface. For self-update to feel like a product capability, a user should not need to remember the underlying CLI or which runtime currently exposes the wrapper.

## Scope

In scope:

- Add the missing portable skill surfaces for release notes.
- Ensure Pi, Gemini CLI, Codex shared skills, and Claude Code have an appropriate release-notes skill or invocation path.
- Update help surfaces so release notes appear as an available system command.
- Keep every wrapper thin: each runtime should dispatch to `uv run python -m memory runtime release-notes [latest|vX.Y.Z]`.
- Update roadmap and command reference if user-facing command availability changes.

Out of scope:

- Changing the release-note parser or rendering format.
- Creating new release notes.
- Runtime update execution or promotion automation.
- External extension release notes.

## Acceptance Criteria

- Pi keeps `/mm-release-notes` and help lists it.
- Gemini/Codex shared skills expose `mm-release-notes` through `.agents/skills`.
- Claude Code exposes `/mm:release-notes`.
- Claude help lists `/mm:release-notes`.
- The skill instructions preserve the rule: show release-note output verbatim unless the user asks for a summary.
- Validation confirms the runtime command still renders latest and specific release notes.

## Result

Release-note skill parity is complete across the supported runtime skill surfaces.

What changed:

- added `.agents/skills/mm-release-notes` as a shared symlink to the Pi skill;
- added `.claude/skills/mm:release-notes/SKILL.md`;
- updated Pi and Claude help surfaces;
- updated `AGENTS.md` and `REFERENCE.md` so release notes are discoverable;
- preserved the thin-wrapper contract: skills call `uv run python -m memory runtime release-notes [latest|vX.Y.Z]` and show output verbatim unless a summary is requested.

Validation:

```bash
test -L .agents/skills/mm-release-notes
test -f .claude/skills/mm:release-notes/SKILL.md
rg "release-notes" .pi/skills/mm-help/SKILL.md .claude/skills/mm:help/SKILL.md AGENTS.md REFERENCE.md
uv run python -m memory runtime release-notes latest
uv run python -m memory runtime release-notes v0.8.0
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py -q
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
git diff --check
```

Result: structural checks passed; both release-note smoke commands rendered `v0.8.0 — Stable Self-Update Foundation`; 82 targeted runtime tests passed; ruff, format, and whitespace checks passed.

## See also

- [CV9.E3.S10 Stable Release Channel Management](../cv9-e3-s10-stable-release-channel-management/index.md)
- [CV9.E3.S13 Release-Aware Update Notices](../cv9-e3-s13-release-aware-update-notices/index.md)
- [Runtime Self-Update Reference](../../../../../../REFERENCE.md#runtime-self-update)
