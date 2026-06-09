[< Story](index.md)

# Plan — CV19.DS4 Confirmation And Safe Identity Mutation

## Boundary

Only confirmed proposals mutate identity. Confirmation must be explicit and visible.

## Design

Command:

```bash
uv run python -m memory soul apply self \
  --proposed "exact content to write" \
  --confirm APPLY
```

Defaults:

- `self` → `soul`
- `shadow` → `profile`
- `ego` → `behavior`
- `persona` → requires `--key`

The command uses `MemoryClient.set_identity()` and renders an identity-updated surface.

## Validation

- Missing `--confirm APPLY` exits without mutation.
- Confirmed apply writes identity.
- Unsupported/missing keys fail safely.
