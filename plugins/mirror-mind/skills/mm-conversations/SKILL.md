---
name: "mm:conversations"
description: Lists recent conversations from the memory database
user-invocable: true
---

# Conversations

When receiving `/mm:conversations`, run:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts conversations [--limit N] [--journey ID] [--persona ID]
```

If `$ARGUMENTS` contains a filter such as a journey slug, use it as `--journey`.

Present the result to the user. Mention that `/mm:recall <id>` loads a conversation.
