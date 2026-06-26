[< Story](index.md)

# Test Guide — CV21.E2.S1 Claude plugin conversion

## Automated validation

Run the project verification suite plus the new plugin structure tests:

```bash
uv sync --extra dev
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
```

Expected result: all commands pass, including the generator tests asserting the
plugin manifest is valid (no `$schema`, version equals `pyproject.toml`), the
Claude skills are materialized as `SKILL.md`, the drift guard is green
(committed == generated from `.claude/skills/`), no generated skill directory uses
Windows-illegal `:` characters, and the four plugin-relative hooks exist.

The drift guard also runs as part of CI (it is a pure-Python test), so a future
edit to a `.claude/skills/` body that is not regenerated into the plugin fails
the suite. Regenerate with:

```bash
uv run python scripts/build_claude_plugin.py
```

## Plugin manifest validation

Validate the canonical plugin with the Claude CLI:

```bash
claude plugin validate <plugin-root>
```

Expected result: validation passes with no errors. (E1 finding: the `$schema`
key must be absent — `claude` 2.1.114 rejects unknown manifest keys.)

Confirm the plugin skill set matches the Claude-tuned source:

```bash
diff \
  <(ls .claude/skills | sed 's/^mm-//' | sort) \
  <(ls plugins/mirror-mind/skills | sed 's/^mm-//' | sort)
```

Expected result: no differences — the plugin carries all 25 Claude skills with
Windows-safe filesystem names.

## Isolated smoke test

The smoke test must not touch the production database. It follows the standard
isolation pattern (temporary `DB_PATH`, production checksum recorded before and
after) from the runtime interface contract and `scripts/smoke_codex.sh`.

```bash
bash scripts/smoke_claude_plugin.sh
```

Note: the plugin hooks assume `python -m memory` resolves in the environment
(D5). In the dev repo `memory` is not pip-installed, so the smoke harness makes
it importable (`PYTHONPATH=src`) to stand in for the installed-package condition.

The script:

1. Fully sandboxes the runtime (`DB_PATH`, `MEMORY_DIR`, `DB_BACKUP_PATH` under a
   temp dir) and puts the project venv interpreter first on PATH so the plugin's
   bare `python3 -m memory` resolves (installed-package stand-in).
2. Runs `claude plugin validate` when `claude` is present.
3. Fires the three lifecycle hooks (`session-start`, `log-user-prompt`,
   `log-session-end`) with a UNIQUE per-run payload.
4. Asserts the user message was logged to the isolated DB with
   `interface='claude_code'`.
5. Asserts that unique test data never appears in any production DB.

The isolation guard checks for the absence of the run's unique session id and
message in production rather than a whole-file checksum, so it stays correct even
when a live Mirror session is writing to its own production DB concurrently.

Expected result: the script exits `0` and prints `✅ Smoke test PASSED`, reporting
no smoke data leaked into production.

Scope note: the automated smoke proves manifest validity, hook firing, and DB
isolation — the deterministic, CI-appropriate guarantees. **Live skill discovery
inside a running Claude session needs an authenticated session and is the manual
route below**, not part of the automated script.

## Backward-compatibility check

Confirm the standalone `.claude/` integration is untouched and still works:

```bash
git status --short .claude/
```

Expected result: no modifications to `.claude/` introduced by this story.

## Manual validation route (Navigator)

In a throwaway project directory (not the Mirror repo), with the plugin
installed into an isolated Claude config:

- start a Claude session and confirm the Mirror status/skills are available;
- invoke a Mirror skill (e.g. `mm-help`) and confirm it runs;
- confirm a new conversation is logged into the **isolated** database, not the
  production Mirror database.

Known limitation / conscious exclusion: this story proves plugin load, skill
discovery, and hook firing only. The MCP server (S2) and `statusLine` (S3) are
validated in their own stories.
