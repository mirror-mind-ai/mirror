[< Story](index.md)

# Plan — CV21.E2.S1 Claude plugin conversion

## Design

This story repackages the existing standalone Claude integration as a canonical
Claude **plugin**. It changes packaging and path resolution only — no `memory`
core behavior, no skill content, no hook logic beyond making paths
plugin-relative.

### Target plugin layout

A self-contained plugin directory, distributable as a unit (later imported by
`agy`/`grok` and snapshotted by Codex):

```text
<plugin-root>/
  .claude-plugin/
    plugin.json          # manifest (no $schema; version synced to pyproject)
  skills/
    mm-mirror/SKILL.md
    mm-build/SKILL.md
    ...                  # full canonical mm-* set
  hooks/
    hooks.json           # hook events → ${CLAUDE_PLUGIN_ROOT}/hooks/*.sh
    session-start.sh
    log-user-prompt.sh
    mirror-inject.sh
    log-session-end.sh
```

### Manifest (`plugin.json`)

Claude-format manifest, validated against `claude` 2.1.114. E1 found the
validator rejects unknown keys, so the manifest stays minimal:

```json
{
  "name": "mirror-mind",
  "version": "0.29.0",
  "description": "Mirror Mind — local-first memory and identity for agentic runtimes.",
  "author": { "name": "Mirror Mind" }
}
```

Version must match `pyproject.toml`. How the sync is enforced (manual now,
generated later) is a decision below.

### Hooks

The four standalone hooks move into the plugin and become plugin-relative.
Today they `cd "$CLAUDE_PROJECT_DIR"` and call `python3 -m memory`, which assumes
the agent's cwd is the Mirror repo. As a plugin, the hook scripts live under
`${CLAUDE_PLUGIN_ROOT}` while the user's project is elsewhere, so:

- `hooks/hooks.json` references `${CLAUDE_PLUGIN_ROOT}/hooks/<name>.sh`;
- the scripts keep their current semantics (SessionStart logging, UserPromptSubmit
  inject + log, Stop end+backup, async where used);
- **path resolution to the `memory` package** must not depend on the user's cwd
  (see Risks — this is the load-bearing portability question).

### Skill bundling and the single-source-of-truth question

Three skill surfaces exist: `.pi/skills/mm-*` (Pi-tuned, 25), `.claude/skills/mm-*`
(Claude-tuned, 25), and the shared `.agents/skills/` symlink surface. A diff proved `.pi` and `.claude` skill bodies
are **independently runtime-tuned, not token-variants** — the Claude bodies
reference `mirror-inject.sh`, the Claude `session_id`/transcript model, and `mm:`
tokens; the Pi bodies reference the Pi extension model. Generating the *Claude*
plugin from `.pi/skills/` would inject Pi-runtime instructions into a Claude
runtime, which is wrong.

Decision: the canonical source for the *Claude plugin* skills is
**`.claude/skills/`** (the Claude-tuned content). A plugin must ship **real
files** (symlinks do not survive `import`/`install`), so the plugin gets its own
materialized `skills/`, **generated from `.claude/skills/`** with a drift-guard
test. The generator normalizes the markdown filename to `SKILL.md` and preserves
Windows-safe `mm-*` directory names while skill frontmatter keeps the Claude
`mm:*` command surface. Skill *content* is copied byte-faithfully — no token
rewriting in S1.

The former Pi-only skills (`discard`, `explore`, `soul`, `update`) now have
Claude-tuned forms, so the plugin ships the full 25-skill surface.

## Implementation steps

1. Add tests first (TDD): a generator/structure test asserting the plugin has a
   valid `.claude-plugin/plugin.json` (no `$schema`, version == `pyproject.toml`),
   the 25 Claude skills each materialized as `SKILL.md`, the drift guard
   (committed == generated from `.claude/skills/`), and the four plugin-relative
   hooks.
2. Implement the generator in `src/memory/plugins/claude.py` (importable, typed),
   reusing `_version_from_pyproject`; expose a thin `scripts/build_claude_plugin.py`
   entry. Source = `.claude/skills/`; normalize markdown filename to `SKILL.md`.
3. Generate the plugin tree: `.claude-plugin/plugin.json` + `skills/`.
4. Hand-author the four plugin hooks + `hooks/hooks.json` (plugin-relative,
   `memory`-installed assumption, stdout clean).
5. Run `claude plugin validate plugins/mirror-mind`; fix the manifest until it
   passes.
6. Write and run the isolated smoke test (see test-guide); confirm skill
   discovery + a hook firing against a temp DB, production DB checksum unchanged.

## Design decisions (confirmed)

1. **Plugin location:** dedicated directory `plugins/mirror-mind/`, self-contained
   and distinct from the standalone `.claude/` integration.
2. **Skill source:** generate the plugin `skills/` from **`.claude/skills/`**
   (Claude-tuned), committed as a build artifact, guarded by a drift test.
   (Corrected from an earlier wrong premise that `.pi/skills/` was the source —
   the bodies are runtime-tuned, not token-variants.)
3. **Parity scope:** ship the full 25 Claude skills, including `discard`,
   `explore`, `soul`, and `update`.
4. **Standalone `.claude/` retention:** both standalone and plugin paths coexist,
   using Windows-safe skill directory names.
5. **Hook resolution:** plugin hooks assume `python -m memory` resolves in the
   environment (Mirror installed as a package) and use `${CLAUDE_PLUGIN_ROOT}`
   relative paths — no repo-cwd assumption. Documented as a plugin prerequisite.

## Risks

- **Hook path portability (load-bearing).** The current standalone hooks assume
  the Mirror repo is the cwd and find `memory` via `$CLAUDE_PROJECT_DIR/src`.
  Installed as a plugin over an arbitrary project, that breaks. The plugin hooks
  resolve `memory` via an installed `python -m memory` (D5). If `memory` is not
  importable in the environment, the plugin validates but does nothing at
  runtime — hence the documented prerequisite and the smoke test that exercises a
  hook firing.
- **Plugin skill namespacing (open, resolved by smoke test).** Whether Claude
  loads plugin skill directories named `mm-<name>` (Windows-safe) and how it namespaces
  the invocation token (`/mm:mirror` vs `/mirror-mind:...`) is not validated by
  `claude plugin validate` (manifest-only). The smoke test loads the plugin in an
  isolated Claude session to confirm discovery; any token/naming normalization is
  a deliberate follow-up, not silent rewriting in S1. Directory names are already
  Windows-safe; command tokens remain `mm:*` in skill frontmatter and body copy.
- **Validator strictness.** E1 already hit the `$schema` rejection on 2.1.114.
  Keep the manifest minimal and validate empirically, not from docs.
- **Drift reintroduction.** A committed copy can drift from `.claude/skills/`.
  The generator + drift-guard test is the structural defense.
- **Scope creep into S1b/S2/S3.** No new skill authoring, no MCP, no statusLine
  here. Hold the boundary.

## Verification

Automated and isolated-smoke verification is specified in
[test-guide.md](test-guide.md). At minimum:

```bash
uv run pytest tests/unit/  # plugin manifest/structure tests
claude plugin validate <plugin-root>
bash scripts/smoke_claude_plugin.sh   # isolated; production DB checksum unchanged
```
