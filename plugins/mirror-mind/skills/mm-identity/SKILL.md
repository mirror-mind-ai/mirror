---
name: "mm:identity"
description: Read and update identity directly in the database
user-invocable: true
---

# Identity

After the initial seed, the database is the source of truth for identity.
Use these commands to inspect and edit identity directly — no YAML files needed.

## Usage

```
/mm:identity list [--layer LAYER]
/mm:identity get <layer> <key>
/mm:identity set <layer> <key> --content "..."
/mm:identity edit <layer> <key>
```

---

## Subcommands

### list

List all identity entries currently stored in the database.

```bash
uv run python -m memory identity list [--layer LAYER] [--mirror-home PATH]
```

**Examples:**
- `uv run python -m memory identity list` — all entries
- `uv run python -m memory identity list --layer ego` — only ego layer

Layers: `self`, `ego`, `user`, `organization`, `persona`, `journey`, `journey_path`

---

### get

Print the full content of one identity entry.

```bash
uv run python -m memory identity get <layer> <key> [--mirror-home PATH]
```

**Examples:**
- `uv run python -m memory identity get ego behavior`
- `uv run python -m memory identity get self soul`
- `uv run python -m memory identity get persona engineer`

---

### set

Update identity content directly in the database.

```bash
uv run python -m memory identity set <layer> <key> --content "..." [--mirror-home PATH]
```

If `--content` is omitted, content is read from stdin.

**Examples:**
- `uv run python -m memory identity set ego behavior --content "Be direct."`
- `cat new-soul.md | uv run python -m memory identity set self soul`

---

### edit

Open the current content in `$EDITOR`, edit it, and save back to the database on close.

```bash
uv run python -m memory identity edit <layer> <key> [--mirror-home PATH]
```

**Examples:**
- `uv run python -m memory identity edit ego behavior`
- `uv run python -m memory identity edit self soul`
- `uv run python -m memory identity edit persona engineer`

If no changes are detected, nothing is written. If the file is left empty, the edit is aborted.

---

## When receiving `/mm:identity [subcommand] [args]`

Run the corresponding command above and present the output to the user.
