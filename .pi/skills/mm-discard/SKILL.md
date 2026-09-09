---
name: "mm-discard"
description: Discards the current runtime conversation from the Mirror database before quitting
user-invocable: true
---

# Discard Current Conversation

Use when the user wants to quit a test session without keeping the current
conversation in the Mirror database.

Natural language examples:

```text
sair descartando esta conversa
fechar sem salvar esta conversa
quit and discard this conversation
```

## 1. Discard Current Conversation

Run:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts conversation-logger discard-current --interface pi
```

The command deletes the current conversation and marks the runtime session so the
assistant confirmation is not logged as a new conversation.

## 2. Tell the User to Quit

After the command succeeds, answer briefly:

```text
Conversa atual descartada do banco. Pode sair com /quit.
```

Do not call `mirror log` for this skill.
