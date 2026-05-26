[< CV13](../index.md)

# CV13.E4 — Conversation Intelligence

**Status:** 🟢 In Progress
**Release target:** v0.14.0

---

## User-visible outcome

Stored conversations become readable and navigable in the web app, then gain safe title-improvement operations that only run when explicitly requested.

---

## Stories

| Code | Story | User-visible outcome | Status |
|------|-------|----------------------|--------|
| [CV13.E4.S1](cv13-e4-s1-conversation-detail-page/index.md) | Conversation detail page | A stored conversation can be opened as a read-only transcript page | ✅ Done |
| [CV13.E4.S2](cv13-e4-s2-conversation-card-linking-and-navigation/index.md) | Conversation card linking and navigation | Workspace conversation cards link to their detail pages with clear back navigation | ✅ Done |
| [CV13.E4.S3](cv13-e4-s3-manual-conversation-title-edit/index.md) | Manual conversation title edit | A selected conversation title can be safely edited without LLM calls | ✅ Done |
| [CV13.E4.S4](cv13-e4-s4-single-conversation-retitle/index.md) | Single conversation retitle | A selected conversation can request an LLM title suggestion and save it only after approval | ✅ Done |
| CV13.E4.S5 | Legacy retitle planning / dry-run | Legacy conversation retitle can be previewed safely before any batch execution | 🟢 In Progress |

---

## Guardrails

- No LLM calls on page load.
- No batch mutation in this epic until preview/dry-run boundaries exist.
- No message editing.
- No transcript deletion.
- No raw database editor.
