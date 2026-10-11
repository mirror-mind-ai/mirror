---
name: "mm-recall"
description: Loads messages from a previous conversation into context
user-invocable: true
---

# Recall

When receiving `/mm-recall <conversation_id> [--limit N]`: answered by the TS core (CV22.DS7.US1).

```bash
mirror recall <conversation_id> [--limit N]
```

The conversation ID can be a prefix (first 8 characters).
Use `/mm-conversations` first to find available IDs.
Present the output to the user.
