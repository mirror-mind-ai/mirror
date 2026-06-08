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
uv run python -m memory soul rite wisdom --says "This already knows the difference between urgency and truth." --listening-for "the lesson already present"
```

Expected output includes:

```text
♢  WISDOM VOICE LISTENING
the voice says
listening for
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
- The content cites a relevant thinker, text, tradition, proverb, or teaching when reliable.
- If the exact book/passage is uncertain, the response does not fabricate bibliographic precision.
- The content deepens the user's material over several compact paragraphs rather than returning a one-line aphorism.
- The content reveals discernment, pattern, lesson, or simple truth without prescribing next steps.
