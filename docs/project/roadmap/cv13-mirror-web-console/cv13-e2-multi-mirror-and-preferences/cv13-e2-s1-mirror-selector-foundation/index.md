[< CV13.E2](../index.md)

# CV13.E2.S1 — Mirror selector foundation

**Status:** ✅ Done
**Epic:** CV13.E2 — Multi-Mirror and Preferences
**Release target:** v0.12.0

---

## User-visible outcome

The web shell makes the active Mirror explicit and shows a read-only list of local Mirrors discovered near the current Mirror home. The list is informational only; switching arrives in the next story.

---

## Scope

- Add a read-only local Mirror discovery model for the web surface.
- Include current Mirror name/path and discovered Mirrors in `/api/shell`.
- Add a dedicated `/api/mirrors` endpoint for the same read-only discovery list.
- Show a compact Mirror selector foundation in the header.
- Indicate which Mirror is current and whether each discovered Mirror has `memory.db`.
- Keep the UI honest that switching is not available yet.

---

## Non-goals

- No database switching.
- No arbitrary path input.
- No writes to preferences or identity.
- No profile page.
- No avatar/theme preference.
- No migration, creation, deletion, or repair of Mirror homes.

---

## Validation

See [test guide](test-guide.md).
