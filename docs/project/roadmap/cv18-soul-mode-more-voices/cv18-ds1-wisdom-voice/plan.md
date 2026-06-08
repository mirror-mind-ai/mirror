[< Story](index.md)

# Plan — CV18.DS1 Wisdom Voice

## Boundary

This story makes Wisdom Voice hearable in Soul Mode. Internal pieces such as prompt text, renderer support, command routing, and Possible Listenings copy are included only insofar as they produce that user-visible behavior.

## Design

Add Wisdom Voice to the existing Soul Mode voice grammar:

```text
Soul Mode
╭────────────────────────────────────────╮
│   ♢  WISDOM VOICE LISTENING            │
│                                        │
│   the voice says                       │
│                                        │
│   [Wisdom Voice response]              │
│                                        │
│   listening for                        │
│   [discernment / pattern / lesson]     │
╰────────────────────────────────────────╯
```

Possible Listenings should present Wisdom Voice as a situated option, not as a generic menu item. Its description should point to what the experience already knows or what discernment is trying to emerge.

The voice prompt should forbid solutionism. Wisdom may name a truth, a pattern, a teaching, or a simplification, but it should not tell the user what to do.

## Implementation Notes

Likely touch points:

- `src/memory/surfaces/soul.py`
- `src/memory/cli/soul.py`
- `src/memory/prompts/`
- `src/memory/services/soul_prompt.py`
- `.pi/skills/mm-soul/SKILL.md`
- focused Soul Mode tests

The exact shape should follow the existing Self/Shadow implementation instead of introducing a parallel voice system prematurely.

## Risks

### Wisdom becomes advice

The prompt and tests should keep the voice reflective. It can name what is already known; it should not prescribe action.

### Wisdom becomes abstract

The response should stay grounded in the user's current material and not drift into aphorisms.

### Menu inflation

Possible Listenings should remain compact and situated even with one additional voice.

## Validation Route

Automated:

```bash
uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/surfaces/test_soul.py tests/unit/memory/services/test_soul_prompt.py -q
uv run ruff check src tests
```

Manual CLI smoke:

```bash
uv run python -m memory soul rite wisdom --says "[sample Wisdom response]" --listening-for "the lesson already present"
```

Pi validation:

```text
enter Soul Mode for soul-mode
[answer with living matter]
I want to hear Wisdom Voice
```

Expected:

- Possible Listenings includes Wisdom Voice.
- Wisdom Voice renders with a ritual card.
- The voice names discernment without giving a task list.
- No journal or identity mutation occurs.
