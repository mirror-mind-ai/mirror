---
name: "mm-journeys"
description: Lists existing journeys with status and current stage
user-invocable: true
---

# Journeys

When receiving `/mm-journeys`:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts journeys
```

The script prints a compact hierarchical list of all journeys, including parent/child indentation when configured. Present the output without modification so the hierarchy remains intact.
