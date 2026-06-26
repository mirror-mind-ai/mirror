[< Story](index.md)

# Plan — CV19.DS1 Closing Rite

## Boundary

This story adds the ritual closing surface, contained renderer/CLI support, and the runtime skill flow around closing the Soul Mode session. It does not classify integration targets, propose identity diffs, write journal entries by itself, or mutate psyche layers.

## Design

Add a textual Soul Mode surface:

```text
Soul Mode
╭────────────────────────────────────────╮
│   ☾  CLOSING RITE                      │
│                                        │
│   what was harvested                   │
│   [...]                                │
│                                        │
│   what still echoes                    │
│   [...]                                │
│                                        │
│   what remains open                    │
│   [...]                                │
│                                        │
│   what may want integration            │
│   [...]                                │
╰────────────────────────────────────────╯
```

The fields should be optional except that at least one piece of closing material is required. Empty sections should not render.

Add CLI support, likely:

```bash
uv run python -m memory soul close \
  --harvested "..." \
  --echoes "..." \
  --open "..." \
  --integration "..."
```

The Pi skill should call this renderer when the user asks to close the Soul Mode session in natural language, and immediately after a confirmed harvest has been saved to the journal.

After rendering the card, Mirror asks:

```text
There is living material that may want to remain as part of your Mirror identity. Do you want to integrate it now?
```

If the user accepts, Mirror proceeds to Integration Review. If the user chooses to end, Mirror deactivates the active mode and returns to Mirror Mode with a short farewell. If the user brings another theme, Mirror stays in Soul Mode and treats it as a new living-field opening.

## Implementation Notes

Likely touch points:

- `src/memory/surfaces/soul.py`
- `src/memory/cli/soul.py`
- `.pi/skills/mm-soul/SKILL.md`
- `tests/unit/memory/surfaces/test_soul.py`
- `tests/unit/memory/cli/test_soul.py`

## Risks

### Closing becomes integration too early

The Closing Rite may mention what wants integration, but it must not classify, propose, or mutate identity. DS2 owns review. DS3 owns proposals. DS4 owns mutation.

### Closing becomes a summary

The surface should feel like a ritual threshold, not a meeting recap. It gathers the living material in compact phrases.

### Fruit maturation becomes a last-turn filter

If a fruit has matured across turns, the harvested fruit should preserve the lineage of the previous fruit while incorporating new living material. It should be one phrase with multiple roots, not a list and not merely the newest insight.

### Empty ritual card

Reject calls with no material so the runtime does not render an empty Closing Rite.

## Validation Route

Automated:

```bash
uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/surfaces/test_soul.py -q
uv run ruff check src tests
uv run ruff format --check src tests
```

Manual CLI smoke:

```bash
uv run python -m memory soul close \
  --harvested "The fruit that appeared." \
  --echoes "A quiet echo." \
  --open "A question remains." \
  --integration "This may belong to Self later."
```

Pi validation:

```text
vamos fechar o Soul Mode
```

Expected:

- Closing Rite renders visibly.
- No journal entry is saved.
- No identity mutation occurs.
- Mirror may explain that integration comes next, but does not apply it.
