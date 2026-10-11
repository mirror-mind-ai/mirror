---
name: "mm-new"
description: Starts a new conversation and ends the current one
user-invocable: true
---

# New Conversation

When receiving `/mm-new`:

```bash
mirror conversation-logger switch
mirror mirror deactivate
```

Tell the user:
- If a new conversation was created: "New conversation started. The previous one was ended."
- If no session was active: "No active session found."
