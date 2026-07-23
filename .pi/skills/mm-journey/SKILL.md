---
name: "mm-journey"
description: Shows detailed journey status and optionally updates the journey path
user-invocable: true
---

# Journey

When receiving `/mm-journey [slug]`: answered by the TS core (CV22.DS7.US1).

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts journey [slug]
```

When receiving `/mm-journey update <slug> <content>`: answered by the TS core (CV22.DS7.US1).

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts journey update <slug> "<content>"
# or pipe via stdin:
echo "<content>" | NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts journey update <slug> -
```

Present the output to the user.
