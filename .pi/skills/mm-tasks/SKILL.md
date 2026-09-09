---
name: "mm-tasks"
description: Lists and manages journey tasks
user-invocable: true
---

# Tasks

When receiving `/mm-tasks [subcommand] [args]`:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts tasks [subcommand] [args]
```

Subcommands: `list` (default), `add`, `done`, `doing`, `block`, `delete`, `import`, `sync`, `sync-config`

**Examples:**
```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts tasks --journey mirror
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts tasks add "Write plan doc" --journey mirror
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts tasks done <task-id>
```

Present the output to the user without modification.
