---
name: "mm:journey"
description: Shows detailed journey status and updates the journey path
user-invocable: true
---

# Journey

Use `/mm:journey` or `/mm:journey reflexo` to inspect journey status.

## 1. Load Status

```bash
mirror journey [JOURNEY]
```

If `$ARGUMENTS` was passed, use it as the journey name. Otherwise the script loads all journeys.

The script prints identity, journey path, recent memories, and recent conversations for each journey.

## 2. Synthesize

Combine the script output into a clear view of current progress.

## 3. Suggest Updates

If the journey path appears outdated relative to recent conversations and memories, suggest an update. After user confirmation:

```bash
mirror journey update JOURNEY "UPDATED_CONTENT"
```

For anything longer than a line, write it to a file and pass `--file`: Mirror
reads it as bytes, untouched by the shell (on Windows PowerShell 5.1 the pipe
is ASCII by default, and this is the only safe route):

```bash
mirror journey update JOURNEY --file PATH
```

A one-liner can go through stdin:

```bash
echo "CONTENT" | mirror journey update JOURNEY -
```
