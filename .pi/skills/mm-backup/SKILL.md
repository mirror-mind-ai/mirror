---
name: "mm-backup"
description: Backs up the production memory database
user-invocable: true
---

# Backup

When receiving `/mm-backup`: answered by the TS core (CV22.DS7.TS1).

```bash
mirror backup
```

The backup succeeded only when the command exits 0 and prints a
`Backup created:` line. Then tell the user: "Memory database backed up." and show
that line.

If the command exits non-zero, or prints a line starting with
`backup: no archive was written:`, the backup failed. Tell the user so, quote
that line, and never say the database was backed up.
