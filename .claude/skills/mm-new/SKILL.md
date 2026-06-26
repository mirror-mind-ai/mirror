---
name: "mm:new"
description: Starts a new conversation and ends the current one
user-invocable: true
---

# New

When receiving `/mm:new`, run:

```bash
uv run python -m memory conversation-logger switch
uv run python -m memory mirror deactivate
```

Tell the user the result:
- If it created a new conversation: "New conversation started. The previous one was ended."
- If no session was active: "No active session found."
