---
name: "mm-seed"
description: Seeds identity YAML files into the memory database
user-invocable: true
---

# Seed

When receiving `/mm-seed`: answered by the TS core (CV22.DS7.US1).

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts seed --env production
```

Use after changing user-home identity YAML files to synchronize the database.
Without `--force`, existing entries are skipped (safe, no overwrite). Only add
`--force` when the user explicitly wants their current YAML files to overwrite
what is in the database.
Tell the user the result.
