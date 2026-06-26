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
╰────────────────────────────────────────╯
```

Possible Listenings should present Wisdom Voice as a situated option, not as a generic menu item. Its description should point to what the experience already knows or what discernment is trying to emerge.

The voice prompt should forbid solutionism while recovering the original Wisdom Voice concept: the user's material should be crossed by a situated source of wisdom. Wisdom may use a thinker, philosopher, sacred text, ancient tradition, proverb, contemplative teaching, or other relevant text. It should cite author/tradition/work when reliable, avoid fabricated precision, and deepen the source's symbolism beyond a one-line aphorism. The card should contain the voice of the source; Mirror's bridge to the user's situation belongs outside the card.

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

### Wisdom becomes abstract or source-less

The response should stay grounded in the user's current material and not drift into source-less aphorisms. When a source is used, it must be cited honestly; when the exact citation is uncertain, the voice should name the reliable source level rather than inventing book, chapter, verse, page, or exact wording.

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
uv run python -m memory soul rite wisdom --says "[sample Wisdom response]"
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
- The voice cites a relevant source when reliable, speaks in that source's solemn symbolic register, and leaves Mirror's practical bridge outside the card.
- No journal or identity mutation occurs.
