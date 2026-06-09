[< Story](index.md)

# Plan — CV19.DS3 Psyche Enrichment Proposal

## Boundary

Proposal is not mutation. This story renders a possible identity enrichment, but does not apply it.

## Design

Command:

```bash
uv run python -m memory soul propose self \
  --origin "Soul Mode harvest ..." \
  --current "current identity excerpt or none" \
  --proposed "proposed identity content" \
  --why "why this may belong"
```

Targets:

- `self` → default key `soul`
- `shadow` → default key `profile`
- `ego` → default key `behavior`
- `persona` → requires `--key`

Surface footer:

```text
proposal only — no identity changed
```

## Validation

```bash
uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/surfaces/test_soul.py -q
```
