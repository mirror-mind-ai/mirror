---
name: "mm:journeys"
description: Lists existing journeys with status and current stage
user-invocable: true
---

# Journeys

When receiving `/mm:journeys`, run:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts journeys
```

The script prints a compact hierarchical journey list, including parent/child indentation when configured. Present the result to the user without modification so the hierarchy remains intact.
