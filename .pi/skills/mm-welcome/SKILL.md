---
name: "mm-welcome"
description: Renders the state-aware welcome card on demand
user-invocable: true
---

# Welcome

When receiving `/mm-welcome`, run:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts welcome
```

Show the user the output verbatim. The welcome is a short, state-aware
greeting composed from the database: header, active journey, recent insight
or conversation, and a closing invitation. Useful when `quietStartup: true`
hides the boot welcome, when the user wants a fresh snapshot mid-session,
or when a new runtime starts and the welcome was missed.

If the command prints nothing, tell the user: "Nothing to surface right now."
Otherwise, do not add commentary — the welcome speaks for itself.

See `docs/product/specs/welcome/index.md` for the composition rules.
