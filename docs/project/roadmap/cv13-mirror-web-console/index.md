[< Roadmap](../index.md)

# CV13 — Mirror Web Console

**Status:** Planned/deferred
**Goal:** Provide a broader local web interface for inspecting and eventually
editing Mirror context: docs, configuration, personas, identity, journeys, and
related runtime state.

---

## What This Is

The Mirror Web Console is a local-first tool for navigating Mirror from outside
the terminal conversation. It should make the system inspectable without
replacing the agentic workflow.

This CV is currently deferred while the 1.0 web work advances inside
[CV9.E6 Web Visibility](../cv9-mirror-1-0/cv9-e6-web-visibility/index.md).
CV9.E6 has already established the read-only shell and Identity perspective on
the release branch, so CV13 should be revisited after CV9.E6 closes and should
avoid duplicating the shipped 1.0 surface.

---

## Epics

| Code | Epic | User-visible outcome | Status |
|------|------|----------------------|--------|
| [CV13.E1](cv13-e1-docs-browser/index.md) | Docs Browser | A local web UI can browse and render Mirror documentation | 🟡 Planned |
| CV13.E2 | Config Inspector | The web UI can inspect Mirror runtime and user-home configuration | ⚪ Future |
| CV13.E3 | Identity Inspector | The web UI can inspect identity layers and personas | ⚪ Future |
| CV13.E4 | Editing Workflow | Safe editing flows exist for selected configuration and identity fields | ⚪ Future |

---

## Done Condition

CV13 is done when Mirror has a local web console that can safely inspect key
Mirror state and support guarded edits where appropriate. The console must remain
local-first and must not expose private identity or memory state beyond the local
machine by default.

---

## See also

- [CV13.E1 Docs Browser](cv13-e1-docs-browser/index.md)
- [Coherence as Product Architecture](../../../product/envisioning/index.md)
