[< Story](index.md)

# Test Guide — CV19.DS4 Confirmation And Safe Identity Mutation

## CLI Smoke

Without confirmation:

```bash
uv run python -m memory soul apply self --proposed "New Self content."
```

Expected: error, no mutation.

With confirmation:

```bash
uv run python -m memory soul apply self \
  --proposed "New Self content." \
  --confirm APPLY
```

Expected: identity update surface renders and `self/soul` contains the exact content.

## Pi Validation

After a proposal, ask to apply it. Expected:

- Mirror asks for explicit confirmation before applying.
- Only after confirmation does it call `soul apply ... --confirm APPLY`.
