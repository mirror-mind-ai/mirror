[< Story](index.md)

# Plan — CV19.DS2 Integration Proposal

## Boundary

This story adds a proposal-only surface. It turns closing material into proposed integration text for origin, Self, Shadow, Ego behavior, persona, and leave-open sections. It must not mutate identity.

## Design

Add a textual Soul Mode surface:

```text
Soul Mode
╭────────────────────────────────────────╮
│   ☾  INTEGRATION PROPOSAL              │
│                                        │
│   origin                               │
│   [...]                                │
│                                        │
│   self                                 │
│   [...]                                │
│                                        │
│   shadow                               │
│   [...]                                │
│                                        │
│   ego behavior                         │
│   [...]                                │
│                                        │
│   persona                              │
│   [...]                                │
│                                        │
│   leave open                           │
│   [...]                                │
│                                        │
│   proposal only — nothing changed      │
╰────────────────────────────────────────╯
```

Add CLI support:

```bash
uv run python -m memory soul review \
  --origin "..." \
  --self "..." \
  --shadow "..." \
  --ego "..." \
  --persona "..." \
  --open "..."
```

Sections are optional, but at least one section is required. Empty sections do not render.

## Post-Closing Invitation

After Closing Rite, Mirror should ask:

```text
There is living material that may want to remain as part of your Mirror identity. Do you want to integrate it now?
```

If the user says yes, Mirror renders Integration Proposal. After rendering, Mirror asks: `Do you want to record it this way in your identity? Or we can adjust anything you want.` If the user declines the post-closing invitation, Mirror may ask whether there is another theme from the day or whether to end.

## Category Rules

- `origin`: where this material came from; context only, not applied to identity.
- `self`: affirmative first-person principle/practice; avoid possibility language as the center of the statement.
- `shadow`: protective part recognized without shame.
- `ego behavior`: operational pattern or repeated reaction.
- `persona`: public role, mask, presentation style, or social identity pattern.
- `leave open`: questions or material not applied to identity.

Journey identity is intentionally excluded.

## Validation Route

Automated:

```bash
uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/surfaces/test_soul.py -q
uv run ruff check src tests
uv run ruff format --check src tests
```

Manual CLI smoke:

```bash
uv run python -m memory soul review \
  --self "A principle that may belong to Self." \
  --shadow "A protection that may belong to Shadow." \
  --open "A question that should remain open."
```

Pi validation:

```text
yes, I want to look at what may remain
```

Expected:

- Integration Proposal renders visibly.
- Empty categories are omitted.
- The card says `proposal only — nothing changed`.
- No identity mutation occurs until the user confirms registration.
