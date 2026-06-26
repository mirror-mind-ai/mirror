[< Story](index.md)

# Test Guide — CV18.DS1 Wisdom Voice

## Automated Tests

Run the focused Soul Mode suite:

```bash
uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/surfaces/test_soul.py tests/unit/memory/services/test_soul_prompt.py -q
```

Expected:

- Wisdom Voice can be rendered through the Soul Mode voice surface.
- Wisdom Voice appears in Possible Listenings when living matter is sufficient.
- CLI routing supports the Wisdom Voice rite.
- Prompt composition for Wisdom Voice is available if implemented through the prompt service.
- Existing Self and Shadow tests still pass.

## CLI Smoke

Run:

```bash
uv run python -m memory soul rite wisdom --says "This already knows the difference between urgency and truth."
```

Expected output includes:

```text
♢  WISDOM VOICE LISTENING
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
I want to hear Wisdom Voice.
```

Expected:

- Mirror stays in Soul Mode.
- Wisdom Voice is treated as a listening lens, not a separate character.
- The response appears inside the ritual card under `the voice says`.
- Mirror may bridge outside the card after the voice speaks.
- The card cites a relevant thinker, text, tradition, proverb, or teaching when reliable.
- If the exact book/passage is uncertain, the response does not fabricate bibliographic precision.
- The card speaks as the source/text/tradition in a solemn, ancestral register.
- The card unfolds the source's image or symbolism over 5–8 compact paragraphs rather than returning a one-line aphorism.
- The card omits the `listening for` section.
- The practical connection to the user's concrete problem appears outside the card in Mirror's normal tone.
- The content reveals discernment, pattern, lesson, or simple truth without prescribing next steps.
