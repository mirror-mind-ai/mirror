[< Story](index.md)

# Test Guide — CV18.DS3 Refinements Pre-Release

## Automated Regression

Run the focused suite after every refinement:

```bash
uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/services/test_soul.py tests/unit/memory/services/test_soul_prompt.py tests/unit/memory/surfaces/test_soul.py -q
uv run ruff check src tests
uv run ruff format --check src tests
```

Expected:

- Self, Shadow, Wisdom, and Beauty voice behavior remains stable.
- Possible Listenings remains compact and readable.
- Harvest and journal behavior remains confirmation-only.

## Manual Pi Validation

Use natural language rather than CLI syntax:

```text
enter Soul Mode for soul-mode
```

Then provide real or realistic living matter. Validate:

- Possible Listenings presents the available voices without feeling like a mechanical menu.
- Wisdom Voice can be selected naturally.
- Beauty Voice can be selected naturally.
- Mirror remains the conversational partner; voices remain lenses.
- Voice text appears inside the ritual card.
- Mirror bridge text appears outside the card.
- No operational/code/doc mutation is performed in Soul Mode.

## Release Readiness Questions

Before DS4, answer:

- Does Wisdom Voice avoid generic advice?
- Does Beauty Voice avoid shallow positivity?
- Is the voice-selection path understandable without commands?
- Are any discovered issues small enough to fix now, or should they become later roadmap items?
