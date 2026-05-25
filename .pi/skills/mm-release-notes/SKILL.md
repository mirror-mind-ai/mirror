---
name: "mm-release-notes"
description: Shows Mirror Mind release notes for the latest, a specific version, or all pending versions
user-invocable: true
---

# Release Notes

Use when the user asks any natural-language variant of:

- "What's new in the latest Mirror Mind release?"
- "What's new in Mirror Mind v0.8.0?"
- "Show me the latest release notes."
- "What’s new in this update?"
- "What's new in this update?"
- "What changed in the new Mirror version?"
- "What changed in v0.10.9?"
- "Show pending release notes."
- "O que mudou na versão mais recente do Mirror Mind?"
- "Quero ler o release note da versão mais recente."
- "O que mudou na nova versão?"

## Command

For the latest release note:

```bash
uv run python -m memory runtime release-notes latest
```

For a specific version:

```bash
uv run python -m memory runtime release-notes vX.Y.Z
```

For an update prompt or any question about what changed in the newly available
version, prefer cumulative pending notes:

```bash
uv run python -m memory runtime release-notes pending
```

If the user names the currently available version from the welcome card, still
prefer `pending` unless they explicitly ask for only that single version. The
pending view is the final-user update explanation because it includes every
release between the installed version and the current stable release.

Show the output verbatim. Do not summarize unless the user explicitly asks for a shorter explanation.
