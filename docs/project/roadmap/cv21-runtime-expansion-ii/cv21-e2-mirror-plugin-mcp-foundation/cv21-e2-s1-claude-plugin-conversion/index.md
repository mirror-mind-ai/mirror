[< CV21.E2](../index.md)

# CV21.E2.S1 — Claude plugin conversion

**Status:** ✅ Done
**Type:** Implementation
**User-visible outcome:** Mirror Mind's standalone `.claude/` integration (skills + lifecycle hooks) is repackaged as a canonical Claude-format plugin that `claude plugin validate` accepts and Claude loads, while the existing standalone `.claude/` path keeps working unchanged.

---

## Scope

- Create the canonical plugin directory with a `.claude-plugin/plugin.json`
  manifest that validates on `claude` 2.1.114 (no unsupported keys such as
  `$schema`).
- Bundle the existing 21 Claude-tuned skills into the plugin's `skills/`,
  generated from `.claude/skills/` (the four Pi-only skills are authored as
  Claude skills in a sibling parity story — Option A).
- Bundle the four lifecycle hooks into the plugin and make their paths
  plugin-relative (`${CLAUDE_PLUGIN_ROOT}`), preserving today's behavior:
  `SessionStart` logging, `UserPromptSubmit` Mirror inject + user-prompt log,
  `Stop` session-end + backup.
- Pass `claude plugin validate <plugin-path>`.
- Prove plugin load + skill discovery + a hook firing with an isolated smoke
  test that mutates no production mirror, repo, or runtime config.

---

## Non-goals

- No MCP server (that is S2).
- No `statusLine` wiring (that is S3).
- No removal of the standalone `.claude/` integration; both coexist this epic.
- No marketplace publishing.
- No change to `memory` core behavior — this story is packaging only.

---

## Acceptance Criteria

- `claude plugin validate plugins/mirror-mind` passes.
- The plugin manifest version matches `pyproject.toml` (no `$schema` key).
- The plugin's `skills/` contains the 21 Claude skills generated from
  `.claude/skills/`, each as `SKILL.md`, with the drift guard green
  (committed == generated).
- The plugin's hooks reproduce the four standalone behaviors, use
  `${CLAUDE_PLUGIN_ROOT}` paths, and assume an installed `python -m memory`.
- An isolated smoke test loads the plugin against a temporary database, observes
  a skill as discoverable and a hook firing, and leaves the production DB
  checksum unchanged.
- The standalone `.claude/` integration still works (untouched).

---

## See also

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Refactoring](refactoring.md)
