---
name: "mm-tasks"
description: Lists and manages journey tasks
user-invocable: true
---

# Tasks

When receiving `/mm-tasks [subcommand] [args]`:

```bash
mirror tasks [subcommand] [args]
```

Subcommands: `list` (default), `add`, `done`, `doing`, `block`, `delete`, `import`, `sync`, `sync-config`

**Examples:**
```bash
mirror tasks --journey mirror
mirror tasks add "Write plan doc" --journey mirror
mirror tasks done <task-id>
```

Present the output to the user without modification.
