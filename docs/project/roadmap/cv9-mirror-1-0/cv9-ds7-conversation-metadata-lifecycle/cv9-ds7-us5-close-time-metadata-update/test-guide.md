# Test Guide — CV9.DS7.US5 Close-time Metadata Update

## Automated

```bash
uv run pytest tests/unit/memory/services/test_conversation.py -q
uv run pytest tests -q
```

## Expected Behavior

- Closing a substantive conversation finalizes title, summary, and tags.
- Existing generated/provisional/unlocked metadata may be regenerated.
- Manual metadata is preserved.
- Metadata records close-time finalization provenance.

## Navigator Validation

Manual validation can use a controlled conversation fixture or a short real
conversation:

1. Start or identify a conversation with non-manual metadata.
2. Close the conversation through the normal runtime path.
3. Open the web conversation detail.
4. Confirm title, summary, and tags are present and useful.
5. Confirm manually edited fields are not overwritten in a manual-lock fixture.
