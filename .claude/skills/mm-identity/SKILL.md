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
mirror identity list [--layer LAYER] [--mirror-home PATH]
```

**Examples:**
- `mirror identity list` — all entries
- `mirror identity list --layer ego` — only ego layer

Layers: `self`, `ego`, `user`, `organization`, `persona`, `journey`, `journey_path`

---

### get

Print the full content of one identity entry.

```bash
mirror identity get <layer> <key> [--mirror-home PATH]
```

**Examples:**
- `mirror identity get ego behavior`
- `mirror identity get self soul`
- `mirror identity get persona engineer`

---

### set

Update identity content directly in the database.

```bash
mirror identity set <layer> <key> --content "..." [--mirror-home PATH]
```

If `--content` is omitted, content is read from stdin.

A new `journey` or `persona` key must be kebab-case: lowercase letters, digits,
and single hyphens, up to 80 characters, such as `product-launch`. Agents put
these keys into commands, so `set` and `edit` refuse any other new key and name
one that would work. A key created before this rule keeps working.

**Examples:**
- `mirror identity set ego behavior --content "Be direct."`
- `cat new-soul.md | mirror identity set self soul`

---

### edit

Open the current content in `$EDITOR`, edit it, and save back to the database on close.

```bash
mirror identity edit <layer> <key> [--mirror-home PATH]
```

**Examples:**
- `mirror identity edit ego behavior`
- `mirror identity edit self soul`
- `mirror identity edit persona engineer`

If no changes are detected, nothing is written. If the file is left empty, the edit is aborted.

---

## When receiving `/mm:identity [subcommand] [args]`

Run the corresponding command above and present the output to the user.
