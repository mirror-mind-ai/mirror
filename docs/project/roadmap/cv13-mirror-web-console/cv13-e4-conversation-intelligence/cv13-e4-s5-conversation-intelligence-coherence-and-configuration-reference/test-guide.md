[< Story](index.md)

# Test Guide — CV13.E4.S5 Conversation intelligence coherence and configuration reference

## Automated checks

```bash
uv run pytest tests/unit/memory/web/test_configuration.py tests/unit/memory/web/test_server.py tests/unit/memory/surfaces/test_workspace.py
uv run ruff check src/memory/web src/memory/surfaces tests/unit/memory/web/test_configuration.py tests/unit/memory/web/test_server.py tests/unit/memory/surfaces/test_workspace.py
uv run ruff format --check src/memory/web src/memory/surfaces tests/unit/memory/web/test_configuration.py tests/unit/memory/web/test_server.py tests/unit/memory/surfaces/test_workspace.py
node --check src/memory/web/static/app.js
git diff --check
```

## Manual browser validation

1. Open Configuration.
2. Confirm each surfaced configuration item shows a Reference action, and Transcripts is not shown as a surfaced directory.
3. Click references for Mirror home, OPENROUTER_API_KEY, Memory extraction model, and LLM audit logging.
4. Confirm each opens the Configuration Reference documentation at the relevant section.
5. Confirm the reference explains what the setting is, what uses it, how to modify it, whether it is active in code, and effects.
6. Confirm no raw config editor appears.
7. Recheck Conversation Intelligence S1-S4 smoke path: card opens transcript, title can be edited manually, suggestion is explicit and preview-only.
