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

The TS front door routes memory listing **and** fresh semantic search to the TS core (CV22.DS8.US1). With `OPENROUTER_API_KEY` set, `--search` runs a live embedding through TypeScript; without a key it degrades to lexical-only search, printing the same note the Python engine prints. `MIRROR_TS_SEARCH=0` sends the search leaf back to Python.

Present the output to the user without modification.
