---
name: "mm:journey"
description: Shows detailed journey status and updates the journey path
user-invocable: true
---

# Journey

Use `/mm:journey` or `/mm:journey reflexo` to inspect journey status.

## 1. Load Status

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts journey [JOURNEY]
```

If `$ARGUMENTS` was passed, use it as the journey name. Otherwise the script loads all journeys.

The script prints identity, journey path, recent memories, and recent conversations for each journey.

## 2. Synthesize

Combine the script output into a clear view of current progress.

## 3. Suggest Updates

If the journey path appears outdated relative to recent conversations and memories, suggest an update. After user confirmation:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts journey update JOURNEY "UPDATED_CONTENT"
```

For long content, use stdin:

```bash
echo "CONTENT" | NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts journey update JOURNEY -
```
