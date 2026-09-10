---
name: "mm-journal"
description: Records a personal journal entry in the memory database
user-invocable: true
---

# Journal

When receiving `/mm-journal "entry text" [--journey SLUG]`:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts journal "entry text" [--journey SLUG]
```

The script records the entry, classifies it into a memory layer, and prints the result.
Present the output to the user without modification.
