---
name: "mm-backup"
description: Backs up the production memory database
user-invocable: true
---

# Backup

When receiving `/mm-backup`: answered by the TS core (CV22.DS7.TS1).

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts backup
```

Tell the user: "Memory database backed up." and show the `Backup created:`
line. `MIRROR_TS_BACKUP=0` sends the command back to Python with no code change.
