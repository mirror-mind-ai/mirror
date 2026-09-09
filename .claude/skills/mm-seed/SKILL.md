---
name: "mm:seed"
description: Seeds identity YAML files into the memory database
user-invocable: true
---

# Seed

Loads identity YAML files (`self`, `ego`, `user`, `organization`, personas, journeys) into the memory database.

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts seed --env production
```

Use after changing user-home identity YAML files to synchronize the database.
