[< Story](index.md)

# Test Guide — CV19.DS1 Closing Rite

## Automated Tests

Run:

```bash
uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/surfaces/test_soul.py -q
```

Expected:

- Closing Rite surface renders with provided sections.
- Empty sections are omitted.
- At least one section is required.
- Existing Soul Mode voice, fruit, and harvest tests still pass.

## CLI Smoke

Run:

```bash
uv run python -m memory soul close \
  --harvested "A clear fruit." \
  --echoes "A line still echoes." \
  --open "A question remains." \
  --integration "This may later belong to Self."
```

Expected output includes:

```text
☾  CLOSING RITE
what was harvested
what still echoes
what remains open
what may want integration
```

Expected absence:

- no journal save;
- no identity mutation;
- no project mutation.

## Pi Manual Validation

In a Soul Mode conversation, ask naturally:

```text
vamos fechar o rito
```

Expected:

- Mirror renders the Closing Rite surface.
- The card gathers the material already present in the conversation.
- If the fruit matured across turns, the harvested fruit preserves the lineage of previous fruits rather than only the last-turn insight.
- Mirror asks exactly: `There is living material that may want to remain as part of your Mirror identity. Do you want to integrate it now?`
- Mirror does not apply integration.
- Mirror can say that integration review is the next step/story if the user asks what should remain.

After saving a harvested fruit to journal, expected:

- Mirror does not stop at `saved to journal`.
- Mirror immediately renders Closing Rite.
- Mirror asks whether the user wants to review what may want to remain.

If the user says they are done, expected:

- Mirror exits Soul Mode through `memory mode deactivate`.
- Mirror leaves a short farewell in normal Mirror voice.
