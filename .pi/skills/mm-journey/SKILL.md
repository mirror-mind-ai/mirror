---
name: "mm-journey"
description: Shows detailed journey status and optionally updates the journey path
user-invocable: true
---

# Journey

When receiving `/mm-journey [slug]`: answered by the TS core (CV22.DS7.US1).

```bash
mirror journey [slug]
```

When receiving `/mm-journey update <slug> <content>`: answered by the TS core (CV22.DS7.US1).

```bash
mirror journey update <slug> "<content>"
# or pipe via stdin:
echo "<content>" | mirror journey update <slug> -
```

Present the output to the user.
