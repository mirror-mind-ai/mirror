---
name: "mm:update"
description: Updates the local Mirror Mind runtime through the safe runtime updater
user-invocable: true
---

# Update Mirror

Use when the user asks any natural-language variant of:

- "Update my Mirror."
- "Update Mirror."
- "Install the new Mirror version."
- "Apply the Mirror update."

## Command

Run the safe updater:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts runtime update
```

Show the output verbatim. Do not replace this with `git pull`, `git fetch`, or
manual migration commands. The runtime updater owns the status gate, the
verified backup, the fast-forward, the migration, and the post-update check.

If the updater reports a recovery route, show it exactly as printed: it names
the commit to return to. If it succeeds, mention the installed version if the
output includes it.
