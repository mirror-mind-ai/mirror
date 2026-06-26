---
name: "mm:recall"
description: Loads messages from a previous conversation into the current context
user-invocable: true
---

# Recall

When receiving `/mm:recall <id>`, run:

```bash
uv run python -m memory recall CONV_ID [--limit N]
```

`CONV_ID` can be the full ID or only its prefix, such as `a3b2c1d4`.

The script prints conversation header and messages. Use it as context to continue the topic or answer questions about what was discussed.
