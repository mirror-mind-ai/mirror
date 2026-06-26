[< Story](index.md)

# Test Guide — CV19.DS4 Confirmation And Safe Identity Mutation

## CLI Smoke

Without confirmation:

```bash
uv run python -m memory soul apply self --proposed "I care for bonds without turning immediate availability into moral proof of love."
```

Expected: error, no mutation.

With confirmation:

```bash
uv run python -m memory soul apply self \
  --proposed "I care for bonds without turning immediate availability into moral proof of love." \
  --origin "Soul Mode harvest" \
  --confirm APPLY
```

Expected: identity update surface renders, an `identity_integrations` record is created, and `self/soul` preserves prior content while appending the exact content under `## New Incorporated Principles`.

## Pi Validation

After a proposal, ask to apply it. Expected:

- Mirror asks for explicit confirmation before applying.
- Only after confirmation does it call `soul apply ... --confirm APPLY`.
- Existing identity content remains present after apply.
- The confirmed text appears under the correct layer section.
