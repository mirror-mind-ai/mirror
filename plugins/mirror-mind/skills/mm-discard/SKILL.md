---
name: "mm:discard"
description: Discards the current runtime conversation from the Mirror database before quitting
user-invocable: true
---

# Discard Current Conversation

Use when the user wants to quit a test session without keeping the current
conversation in the Mirror database.

Natural language examples:

```text
quit and discard this conversation
close without saving this conversation
exit and drop this conversation
```

## 1. Discard Current Conversation

Run:

```bash
uv run python -m memory conversation-logger discard-current --interface claude_code
```

The command deletes the current conversation and marks the runtime session so the
assistant confirmation is not logged and transcript backfill skips it at session
end.

## 2. Tell the User to Quit

After the command succeeds, answer briefly:

```text
Current conversation discarded from the database. You can safely exit the session now.
```

Do not call `mirror log` for this skill.
