[< Story](index.md)

# Plan — CV18.DS2 Beauty Voice

## Boundary

This story makes Beauty Voice hearable in Soul Mode. Internal pieces such as prompt text, renderer support, command routing, and Possible Listenings copy are included only insofar as they produce that user-visible behavior.

## Design

Add Beauty Voice to the existing Soul Mode voice grammar:

```text
Soul Mode
╭────────────────────────────────────────╮
│   ✺  BEAUTY VOICE LISTENING            │
│                                        │
│   the voice says                       │
│                                        │
│   [Beauty Voice response]              │
│                                        │
╰────────────────────────────────────────╯
```

Possible Listenings should present Beauty Voice as a situated option, not as a generic menu item. Its description should point to where life still has form, where care is visible, or where the soul recognizes texture and delicacy.

The voice prompt should forbid shallow positivity. Beauty may reveal aliveness or form; it should not minimize pain, bypass conflict, or decorate the material.

## Implementation Notes

Likely touch points:

- `src/memory/surfaces/soul.py`
- `src/memory/cli/soul.py`
- `src/memory/prompts/`
- `src/memory/services/soul_prompt.py`
- `.pi/skills/mm-soul/SKILL.md`
- focused Soul Mode tests

The exact shape should follow the existing Self/Shadow implementation and the Wisdom Voice additions.

## Risks

### Beauty becomes positivity

The prompt and tests should reject reassurance that makes the user's tension smaller than it is.

### Beauty becomes decorative

The response should point to form and aliveness in the user's material, not add poetic ornament from outside.

### Ritual grammar fragments

Beauty Voice should use the same card grammar as the other voices so the constellation feels coherent.

## Validation Route

Automated:

```bash
uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/surfaces/test_soul.py tests/unit/memory/services/test_soul_prompt.py -q
uv run ruff check src tests
```

Manual CLI smoke:

```bash
uv run python -m memory soul rite beauty --says "There is still care in the way this hurts."
```

Pi validation:

```text
enter Soul Mode for soul-mode
[answer with living matter]
I want to hear Beauty Voice
```

Expected:

- Possible Listenings includes Beauty Voice.
- Beauty Voice renders with a ritual card.
- The voice reveals aliveness without bypassing difficulty.
- No journal or identity mutation occurs.
