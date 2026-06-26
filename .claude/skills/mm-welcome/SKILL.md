---
name: "mm:welcome"
description: Renders the state-aware welcome card on demand
user-invocable: true
---

# Welcome

When receiving `/mm:welcome`, run:

```bash
uv run python -m memory welcome
```

Show the user the output verbatim. The welcome is a short, state-aware
greeting composed from the database: header, active journey, recent insight
or conversation, and a closing invitation.

If the command prints nothing, tell the user: "Nothing to surface right now."
Otherwise, do not add commentary — the welcome speaks for itself.

See `docs/product/specs/welcome/index.md` for the composition rules.
