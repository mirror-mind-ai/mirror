# Test Guide — CV9.DS7.US4 Contextual Conversation Metadata Maintenance

## Automated

```bash
uv run pytest tests/unit/memory/services/test_conversation.py tests/unit/memory/cli/test_conversations.py tests/unit/memory/web/test_server.py -q
```

## Navigator Validation

### Web route

1. Open a conversation detail page in the web console.
2. Click `Run metadata update`.
3. Confirm the preview report shows title/summary/tags decisions and does not mutate metadata.
4. Edit the title field if needed.
5. Click `Apply metadata update`.
6. Confirm the report shows `changed` and `skipped` fields.
7. Confirm manual-lock/refine-candidate decisions are not silently overwritten.

### CLI/debug route

```bash
uv run python -m memory.cli.conversations \
  --metadata-lifecycle-preview-at-message <message-id>
```

Expected observation:

- report mode is `debug_preview_at_message`;
- `mutated` remains false;
- report identifies the conversation and boundary message;
- decisions are based on messages up to that boundary.
