---
name: "mm:journal"
description: Records a personal journal entry in the memory database
user-invocable: true
---

# Journal

When receiving `/mm:journal`, run:

```bash
uv run python -m memory journal [--journey SLUG] "ENTRY_TEXT"
```

The entry text comes from `$ARGUMENTS`. If the user did not provide text, ask what they want to record.

The `--journey` parameter is optional. If the user explicitly mentions a journey or the context clearly belongs to one, pass the slug. Otherwise omit it; the journal entry remains free-form.

The script automatically classifies title, layer, and tags through the LLM and saves the entry.

After running it, show the classification result and confirm that it was saved.
