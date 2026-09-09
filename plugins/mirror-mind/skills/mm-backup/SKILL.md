---
name: "mm:backup"
description: Backs up the production memory database
user-invocable: true
---

# Memory Database Backup

Runs a backup of the configured production database.

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts backup
```

This command:
- Zips the database including WAL/SHM sidecars for consistency
- Removes backups older than 30 days
- Also runs automatically at session end through the `SessionEnd` hook
