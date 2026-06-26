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
uv run python -m memory runtime update
```

Show the output verbatim. Do not replace this with `git pull`, `git fetch`, or
manual migration commands. The runtime updater owns status gates, backups,
fast-forwarding, migrations, and post-update validation.

If the updater reports a recovery command, show that recovery command exactly as
printed. If it succeeds, mention the installed version if the output includes it.
