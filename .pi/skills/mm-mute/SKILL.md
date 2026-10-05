---
name: "mm-mute"
description: Toggles conversation logging on or off
user-invocable: true
---

# Mute

When receiving `/mm-mute`:

1. Check current status:
   ```bash
   mirror conversation-logger status
   ```

2. Toggle:
   - If **ACTIVE**: run `mirror conversation-logger mute` → say "Conversation logging muted."
   - If **MUTED**: run `mirror conversation-logger unmute` → say "Conversation logging reactivated."
