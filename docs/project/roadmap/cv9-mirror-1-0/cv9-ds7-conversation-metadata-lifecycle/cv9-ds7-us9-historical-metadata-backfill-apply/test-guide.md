# Test Guide — CV9.DS7.US9 Historical Metadata Backfill Apply

## Automated

```bash
uv run pytest tests/unit/memory/services/test_conversation.py tests/unit/memory/cli/test_conversations.py -q
```

## Navigator Validation

Use a small limit first. If using production data, run a backup first.

Safe apply:

```bash
uv run python -m memory.cli.conversations \
  --metadata-backfill-apply \
  --metadata-backfill-mode safe \
  --limit 3
```

Force apply:

```bash
uv run python -m memory.cli.conversations \
  --metadata-backfill-apply \
  --metadata-backfill-mode force \
  --limit 3
```

Expected observation:

- report mode is `metadata_backfill_apply`;
- report has `mutated: true` only when at least one conversation changed;
- each result includes conversation id, changed fields, skipped fields, and profile actions;
- manual locks are preserved by default;
- generated tags avoid IDs, hashes, CSS sizes, and generic verbs/adjectives.
