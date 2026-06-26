---
name: "mm:tasks"
description: Lists and manages journey tasks
user-invocable: true
---

# Tasks

When receiving `/mm:tasks`, run:

```bash
uv run python -m memory tasks [SUBCOMMAND] [ARGS]
```

## Subcommands

- **No argument or `list`**: list open tasks grouped by journey
- `--journey SLUG`: filter by journey
- `--status STATUS`: filter by status (`todo`, `doing`, `done`, `blocked`)
- `--all`: include completed tasks
- `add "TITLE" --journey SLUG [--due YYYY-MM-DD] [--stage STAGE]`: create a task
- `done TASK_ID`: mark task as completed
- `doing TASK_ID`: mark task as in progress
- `block TASK_ID`: mark task as blocked
- `import [SLUG]`: import pending tasks from journey paths
- `sync [SLUG]`: sync tasks from external reference files
- `sync-config SLUG /path/to/file`: configure a journey reference file for sync
- `delete TASK_ID`: remove a task

## Argument Interpretation

If `$ARGUMENTS` contains a journey slug, use it as `--journey`.
If it contains "all", use `--all`.
If it is a sentence like "I need to do X by Friday", create a task with `add`.

Present the result in a readable form.
