---
name: "mm-memories"
description: Lists memories with filters by type, layer, and journey
user-invocable: true
---

# Memories

When receiving `/mm-memories [--type TYPE] [--layer LAYER] [--journey SLUG] [--search "text"] [--limit N]`:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts memories [args]
```

The TS front door routes non-search memory listing to the TS core. If `--search` is present, it falls back to the Python engine because fresh semantic embedding/search remains out of scope until CV22.DS5.

Present the output to the user without modification.
