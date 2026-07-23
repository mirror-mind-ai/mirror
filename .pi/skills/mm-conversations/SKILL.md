---
name: "mm-conversations"
description: Lists recent conversations from the memory database
user-invocable: true
---

# Conversations

When receiving `/mm-conversations [--limit N] [--journey SLUG] [--persona NAME]`: the plain
listing is answered by the TS core (CV22.DS7.US1).

```bash
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts conversations [args]
```

Present the output to the user without modification.
