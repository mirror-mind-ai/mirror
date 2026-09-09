---
name: "mm:mute"
description: Toggles conversation logging
user-invocable: true
---

# Mute

When receiving `/mm:mute`, run:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts conversation-logger status
```

- If status is **ACTIVE**, run `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts conversation-logger mute` and say: "Conversation logging muted. Use `/mm:mute` again to reactivate it."
- If status is **MUTED**, run `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts conversation-logger unmute` and say: "Conversation logging reactivated."

This is a simple toggle. It needs no arguments.
