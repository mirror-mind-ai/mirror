[< Story](index.md)

# Test Guide — CV9.E6.S5 Workspace Dashboard Slice

## Automated validation

Run the focused web visibility suite:

```bash
uv run pytest tests/unit/memory/surfaces tests/unit/memory/web tests/unit/memory/test_public_api.py
uv run ruff check src/memory/surfaces src/memory/web tests/unit/memory/surfaces tests/unit/memory/web
uv run ruff format --check src/memory/surfaces src/memory/web tests/unit/memory/surfaces tests/unit/memory/web
node --check src/memory/web/static/app.js
git diff --check
```

Expected coverage:

- Workspace home includes a journey list, selected journey, selected profile,
  and tab sections for overview, conversations, tasks, memories, and decisions.
- The selected journey prefers the most recent conversation journey when
  available.
- Populated journey data produces useful labels, statuses, counts, and metadata.
- Empty data produces honest empty states.
- Web routes still serialize surface DTOs instead of composing Workspace data in
  route handlers.
- Existing Identity and object-detail tests remain green.

## Manual validation

After web module changes, restart the local server:

```bash
~/restart-mirror-web.sh
```

Then open Workspace and verify:

1. Workspace uses the same shell as Identity and Docs.
2. The page feels analytical and operational, not symbolic like Identity.
3. Journeys appear as a scrollable left menu, not large cards.
4. The selected journey opens in the central profile area.
5. The profile header shows the journey name, status, description, and counts.
6. Tabs for Overview, Conversations, Tasks, Memories, and Decisions are visible.
7. Tab content reflects the selected journey.
8. Decisions are either backed by real decision memories or shown as an honest
   placeholder/partial state.
9. Empty sections explain what is missing without looking broken.
10. The page remains read-only.

## Acceptance note

This story is valid when a user can open Workspace and understand the current
operational state of their Mirror without using CLI commands, while still seeing
which areas are partial or not yet first-class.
