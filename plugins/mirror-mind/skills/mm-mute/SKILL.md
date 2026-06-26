---
name: "mm:mute"
description: Toggles conversation logging
user-invocable: true
---

# Mute

When receiving `/mm:mute`, run:

```bash
uv run python -m memory conversation-logger status
```

- If status is **ACTIVE**, run `uv run python -m memory conversation-logger mute` and say: "Conversation logging muted. Use `/mm:mute` again to reactivate it."
- If status is **MUTED**, run `uv run python -m memory conversation-logger unmute` and say: "Conversation logging reactivated."

This is a simple toggle. It needs no arguments.
