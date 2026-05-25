[< CV13.E1](../index.md)

# CV13.E1.S1 — Workspace-first shell cleanup

**Status:** ✅ Done
**User-visible outcome:** The web app opens in Workspace by default, places Workspace before Identity, removes the redundant perspective badge, and keeps journey visualization free of task noise.

---

## Scope

- Make Workspace the default view when no stored preference exists.
- Keep persisted preferences working for users who explicitly chose Identity.
- Put Workspace before Identity in the main navigation.
- Remove the top-right perspective badge from the shell.
- Remove tasks from Workspace metrics and tabs.
- Adjust Workspace copy so it no longer promises daily tasks.
- Preserve the read-only surface architecture: web renders surfaces, surfaces compose DTOs, services own retrieval.

---

## Non-goals

- No profile/preferences page.
- No memory page.
- No search results page.
- No conversation transcript page.
- No retitle operation.
- No journey configuration.
- No web operations runner.

---

## Acceptance Criteria

- Opening the web app without `web/preferences.json` loads Workspace, not Identity.
- The top navigation order is Workspace, Identity, Docs.
- The header does not show the redundant `Perspective · ...` badge.
- Workspace tabs no longer include Tasks.
- Workspace metrics no longer include Open tasks.
- Existing saved `atlas` preference still opens Identity.
- Focused web/surface tests pass.

---

## See also

- [Plan](plan.md)
- [Test Guide](test-guide.md)
