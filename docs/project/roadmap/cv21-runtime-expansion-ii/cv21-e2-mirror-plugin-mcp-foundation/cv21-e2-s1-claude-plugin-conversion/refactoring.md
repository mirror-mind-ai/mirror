[< Story](index.md)

# Refactoring — CV21.E2.S1 Claude plugin conversion

Deferred cleanup surfaced during the review ritual. None block S1; each has a
revisit trigger.

## Deferred

- **`read_version` duplication.** `memory.plugins.claude.read_version` reparses
  the `pyproject.toml` `version =` line, duplicating the private
  `_version_from_pyproject` in `memory.cli.runtime`. Kept separate to avoid a
  cross-layer dependency (`plugins` → `cli`) and because the two have different
  resolution semantics (build-tool reads the repo pyproject deterministically;
  runtime walks parents with an installed-metadata fallback).
  *Revisit when* a third call site appears or a shared `memory` version util is
  introduced — extract one helper then.

- **Plugin skill invocation token.** The plugin bundles skills byte-faithfully
  with `mm-`-prefixed Windows-safe directory names. Skill bodies preserve
  `/mm:*` self-references and frontmatter preserves `name: "mm:*"`. How Claude
  namespaces plugin skills in live discovery remains a manual validation point.
  *Revisit when* live skill discovery shows the effective token. Any rename is a
  deliberate, drift-guarded regeneration, not a hand edit.

## Standalone hygiene

- Standalone `.claude/skills/` now uses Windows-safe `mm-*` directories with
  uppercase `SKILL.md` files while preserving Claude `mm:*` command names in
  frontmatter.
- `.claude/skills/mm-help` references a `mm:save` command with no skill dir.
