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
# longer than a line: write it to a file, read as bytes, untouched by the shell
mirror journey update <slug> --file <path>
# a one-liner through stdin (not on Windows PowerShell 5.1, whose pipe is ASCII):
echo "<content>" | mirror journey update <slug> -
```

Present the output to the user.
