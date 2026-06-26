[< Story](index.md)

# Test Guide — CV18.DS2 Beauty Voice

## Automated Tests

Run the focused Soul Mode suite:

```bash
uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/surfaces/test_soul.py tests/unit/memory/services/test_soul_prompt.py -q
```

Expected:

- Beauty Voice can be rendered through the Soul Mode voice surface.
- Beauty Voice appears in Possible Listenings when living matter is sufficient.
- CLI routing supports the Beauty Voice rite.
- Prompt composition for Beauty Voice is available if implemented through the prompt service.
- Existing Self, Shadow, and Wisdom behavior still passes.

## CLI Smoke

Run:

```bash
uv run python -m memory soul rite beauty --says "The aliveness is in the care you still have for the shape of the day."
```

Expected output includes:

```text
✺  BEAUTY VOICE LISTENING
the voice says
```

Expected absence:

- no journal save;
- no identity mutation;
- no Builder/project boundary crossing.

## Pi Manual Validation

In Pi:

```text
enter Soul Mode for soul-mode
```

Then answer with enough living material to cross the Possible Listenings threshold. Ask:

```text
I want to hear Beauty Voice.
```

Expected:

- Mirror stays in Soul Mode.
- Beauty Voice is treated as a listening lens, not a separate character.
- The response appears inside the ritual card under `the voice says`.
- The card omits the `listening for` section.
- Mirror may bridge outside the card after the voice speaks.
- The content reveals form, aliveness, delicacy, texture, image, rhythm, literature/poetry when fitting, or care without forced optimism.
