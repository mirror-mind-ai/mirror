[< Story](index.md)

# Plan — CV19.DS4 Confirmation And Safe Identity Mutation

## Boundary

Only confirmed proposals mutate identity. Confirmation must be explicit and visible.

## Design

Command:

```bash
uv run python -m memory soul apply self \
  --proposed "exact integration text" \
  --origin "Soul Mode harvest / integration proposal context" \
  --confirm APPLY
```

Defaults:

- `self` → `soul`
- `shadow` → `profile`
- `ego` → `behavior`
- `persona` → requires `--key`

The command creates an `identity_integrations` record, preserves the existing identity document, appends the exact confirmed text under the target layer's integration section, and renders an identity-updated surface.

Layer sections:

- `self` → `## New Incorporated Principles`
- `shadow` → `## New Hidden Needs Recognized`
- `ego` → `## New Operational Patterns Identified`
- `persona` → `## New Participation Patterns Revealed`

The prompt-facing `identity.content` remains a synthesized/current document, while `identity_integrations` preserves each atomic confirmed integration for provenance, future web display, and possible re-synthesis. Do not overwrite a longer identity document with a short fragment by default.

## Validation

- Missing `--confirm APPLY` exits without mutation.
- Confirmed apply creates an individual integration record.
- Confirmed apply preserves previous identity content.
- Confirmed apply appends under the correct layer-specific section.
- Apply uses the exact approved content, not a paraphrase.
- Unsupported/missing keys fail safely.
