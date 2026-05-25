[< CV13](../index.md)

# CV13.E2 — Multi-Mirror and Preferences

**Status:** 🟢 In Progress
**Release target:** v0.12.0 — Multi-Mirror and Preferences
**User-visible outcome:** The local web app can show which Mirror is active, discover sibling local Mirrors under the local Mirror home boundary, and eventually persist user-facing preferences such as profile/avatar and theme.

---

## Scope

This epic moves CV13 beyond read-only browsing of a single Mirror into local user context. The work must preserve the local-first boundary: Mirror discovery is restricted to local Mirror homes, switching must not accept arbitrary paths, and preferences are stored in the user's Mirror home rather than in the identity graph unless explicitly scoped.

Initial backlog:

- Show the current Mirror more explicitly in the web shell.
- Discover local Mirrors near `~/.mirror-minds` or the current Mirror home.
- Add a safe switch path for another discovered local Mirror.
- Add a profile/preferences page for user-facing web preferences.
- Persist theme preference: light, dark, or system.
- Keep configuration editing, journey metadata editing, and operations out of this epic.

---

## Stories

| Code | Story | User-visible outcome | Status |
|------|-------|----------------------|--------|
| [CV13.E2.S1](cv13-e2-s1-mirror-selector-foundation/index.md) | Mirror selector foundation | The header shows the active Mirror and a read-only list of local Mirrors discovered near the current Mirror home | ✅ Done |
| CV13.E2.S2 | Switch local Mirror | The user can switch to another discovered local Mirror without entering arbitrary paths | 🟢 In Progress |
| CV13.E2.S3 | Profile/preferences page | The user has a dedicated page for profile-like web preferences scoped to the current Mirror | 🟡 Planned |
| CV13.E2.S4 | Theme preference | The user can choose light, dark, or system theme and have it persist locally | 🟡 Planned |
| CV13.E2.S5 | Preference coherence and validation | The multi-Mirror/preference slice is validated across local Mirrors and prepared as v0.12.0 | 🟡 Planned |

---

## Non-goals

- No arbitrary database path entry.
- No remote Mirror access.
- No authentication system.
- No `.env` or runtime configuration editing.
- No journey metadata editing.
- No conversation retitle or operations runner.
- No LLM calls during page load.

---

## Done Condition

CV13.E2 is done when a local user can understand and safely change which local Mirror the web surface is using, manage basic user-facing web preferences, and rely on those preferences across reloads without weakening the local-first privacy boundary.
