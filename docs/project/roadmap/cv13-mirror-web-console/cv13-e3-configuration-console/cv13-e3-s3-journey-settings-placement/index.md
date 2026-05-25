[< CV13.E3](../index.md)

# CV13.E3.S3 — Journey settings placement

**Status:** ✅ Done
**Epic:** CV13.E3 — Configuration Console
**Release target:** v0.13.0

---

## User-visible outcome

Journey configuration appears where the user already works with journeys: inside the selected Workspace journey, under a read-only Settings tab. The global Configuration page remains focused on Mirror/runtime settings.

---

## Scope

- Remove journey configuration from the global Configuration page.
- Add a Workspace `Settings` tab for the selected journey.
- Show journey id, status, project path, sync file, icon, and color metadata in read-only form.
- Keep editing for S4.

---

## Non-goals

- No editing.
- No duplicate journey list in global Configuration.
- No raw YAML/database mutation.
- No task/conversation operations.

---

## Validation

See [test guide](test-guide.md).
