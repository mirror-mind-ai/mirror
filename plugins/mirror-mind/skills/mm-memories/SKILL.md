---
name: "mm:memories"
description: Lists memories with filters
user-invocable: true
---

# Memories

When receiving `/mm:memories`, run:

```bash
uv run python -m memory memories [--type TYPE] [--layer LAYER] [--journey ID] [--limit N] [--search QUERY]
```

If `$ARGUMENTS` contains a type, use it as `--type`.
If it contains a search query, use it as `--search`.

Valid types: `decision`, `insight`, `idea`, `journal`, `tension`, `learning`, `pattern`, `commitment`, `reflection`.

Present the result in a readable form.
