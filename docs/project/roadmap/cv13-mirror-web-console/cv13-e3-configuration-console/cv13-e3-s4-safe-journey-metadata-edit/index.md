[< CV13.E3](../index.md)

# CV13.E3.S4 — Safe journey metadata edit

**Status:** ✅ Done
**Epic:** CV13.E3 — Configuration Console
**Release target:** v0.13.0

---

## User-visible outcome

The selected Workspace journey's Settings tab can safely update selected journey metadata: project path, sync file, icon, and color. The edit stays inside service-backed metadata boundaries and avoids raw file/database editing.

---

## Scope

- Add a safe web endpoint for updating selected journey metadata fields.
- Validate editable fields server-side.
- Render a small edit form in Workspace Settings.
- Refresh the selected Workspace journey after save.
- Keep status/content editing out of this story unless a safe service boundary already exists.

---

## Non-goals

- No arbitrary raw JSON editor.
- No journey content/briefing editor.
- No `.env` editing.
- No raw YAML/database mutation from UI code.
- No task/conversation operations.

---

## Validation

See [test guide](test-guide.md).
