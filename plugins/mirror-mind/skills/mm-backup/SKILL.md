---
name: "mm:backup"
description: Backs up the production memory database
user-invocable: true
---

# Memory Database Backup

Runs a backup of the configured production database.

```bash
mirror backup
```

This command:
- Archives a consistent snapshot of the database, one `memory.db` in WAL mode,
  readable only by its owner
- Removes backups older than 30 days
- Also runs automatically at session end through the `SessionEnd` hook

The backup succeeded only when the command exits 0 and prints a
`Backup created:` line. Then tell the user: "Memory database backed up." and show
that line.

If the command exits non-zero, or prints a line starting with
`backup: no archive was written:`, the backup failed. Tell the user so, quote
that line, and never say the database was backed up.
