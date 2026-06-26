[< Story](index.md)

# Test Guide — CV21.E2.S1b Claude skill parity

## Automated validation

```bash
uv run python scripts/build_claude_plugin.py            # regenerate (25 skills)
uv run pytest tests/unit/memory/plugins/ -q
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
git diff --check
```

Expected result: all pass. The plugin tests now assert the plugin skill set
equals the `.claude/skills/` set at 25, and the drift guard is green.

## Skill set parity

```bash
diff \
  <(ls .pi/skills | sed 's/^mm-//' | sort) \
  <(ls plugins/mirror-mind/skills | sed 's/^mm-//' | sort)
```

Expected result: no differences — the plugin now carries all 25 skills, matching
the Pi canonical set name-for-name.

## Manifest validation

```bash
claude plugin validate plugins/mirror-mind
```

Expected result: validation passes.

## Content checks

```bash
# English-only + mm: tokens, no Pi-specific instructions in the new skills
grep -l "interface pi\|--session-id when a Pi\|/mm-" \
  .claude/skills/mm-discard/SKILL.md \
  .claude/skills/mm-explore/SKILL.md \
  .claude/skills/mm-soul/SKILL.md \
  .claude/skills/mm-update/SKILL.md || echo "clean: no Pi-specific leftovers"

grep -h "interface" .claude/skills/mm-discard/SKILL.md   # expect claude_code
```

Expected result: `clean: no Pi-specific leftovers`; `mm:discard` uses
`--interface claude_code`.

## Isolated smoke test

```bash
bash scripts/smoke_claude_plugin.sh
```

Expected result: `✅ Smoke test PASSED`, with no smoke data leaked into
production. (The smoke exercises the lifecycle hooks, which are unchanged by this
story; it re-confirms the regenerated plugin still loads and isolates correctly.
This story also hardened the smoke isolation guard to assert absence of unique
test data in production rather than a whole-file checksum, so it no longer
false-fails when a live Mirror session writes to its own DB concurrently.)

## Manual validation route (Navigator)

In an isolated Claude config (`CLAUDE_CONFIG_DIR=$(mktemp -d)`), with the plugin
loaded:

- confirm `mm:explore`, `mm:soul`, `mm:update`, and `mm:discard` are discoverable;
- optionally invoke `mm:update` (read-only path) and confirm it runs.

Known limitation: deep behavioral validation of Explorer/Soul rituals on Claude
is a broader exercise; this story validates discovery + faithful tuning, not a
full ritual run.
