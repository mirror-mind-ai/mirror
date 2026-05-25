---
name: "mm:release-notes"
description: Shows Mirror Mind release notes for the latest or a specific version
user-invocable: true
---

# Release Notes

Use when the user asks any natural-language variant of:

- "What's new in the latest Mirror Mind release?"
- "What's new in Mirror Mind v0.8.0?"
- "Show me the latest release notes."
- "O que mudou na versão mais recente do Mirror Mind?"
- "Quero ler o release note da versão mais recente."

## Command

For the latest release note:

```bash
uv run python -m memory runtime release-notes latest
```

For a specific version:

```bash
uv run python -m memory runtime release-notes vX.Y.Z
```

Show the output verbatim. Do not summarize unless the user explicitly asks for a shorter explanation.
