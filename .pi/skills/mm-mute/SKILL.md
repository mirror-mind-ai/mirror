---
name: "mm-mute"
description: Toggles conversation logging on or off
user-invocable: true
---

# Mute

When receiving `/mm-mute`:

1. Check current status:
   ```bash
   NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts conversation-logger status
   ```

2. Toggle:
   - If **ACTIVE**: run `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts conversation-logger mute` → say "Conversation logging muted."
   - If **MUTED**: run `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts conversation-logger unmute` → say "Conversation logging reactivated."
