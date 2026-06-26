---
name: "mm:week"
description: Plans the week by ingesting free-text tasks/appointments or showing the weekly view
user-invocable: true
---

# Week

When receiving `/mm:week`, run according to the arguments.

## No Argument: Weekly View

```bash
uv run python -m memory week view
```

Shows current-week tasks and appointments grouped by day.

**Display rules:**
- Past appointments (`scheduled_at` < now) do not appear
- Tasks with past `due_date` and status != done appear as overdue
- Items with `scheduled_at` show the exact time
- Items with only `time_hint` show the hint
- Journey appears beside the item when present

## With Text: Ingest Weekly Plan

```bash
uv run python -m memory week plan "TEXTO LIVRE"
```

The script extracts items through the LLM and returns JSON with proposed items plus similarity warnings.

**Required flow:**
1. Run the script with the user's text.
2. Present extracted items in readable form.
3. Show similarity warnings if any.
4. Ask for confirmation before creating items.
5. After confirmation, run: `uv run python -m memory week save`

Never save automatically without user confirmation.

## Argument Interpretation

If `$ARGUMENTS` is empty or `view`, show the week.
If `$ARGUMENTS` contains descriptive text, ingest it as a plan.
