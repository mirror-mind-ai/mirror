[< CV13](../index.md)

# CV13.E1 — Read-only Web Refinement

**Status:** 🟢 In Progress
**Release target:** v1.1 planning label
**User-visible outcome:** The existing local web app becomes calmer, Workspace-first, and more useful for browsing the current Mirror without introducing writes or background operations.

---

## Scope

This epic refines the read-only surface created in CV9.E6. It should improve the information architecture and visual rhythm before CV13 introduces multi-Mirror selection, preferences, configuration, conversation intelligence, or operations.

Initial backlog:

- Workspace opens first and Identity is the second main perspective.
- The main header is redesigned to remove unnecessary badges and diagnostic tone.
- Persona icons use three-letter tokens instead of two-letter tokens.
- Memory and search result pages become reachable read-only surfaces.
- Identity chips can be opened or inspected through links/pages.
- Journey views use totals for conversations, messages, memories, and decisions.
- Journey views remove task-oriented UI until tasks have a stronger product role.
- Conversation cards become more useful in journey context.

---

## Stories

| Code | Story | User-visible outcome | Status |
|------|-------|----------------------|--------|
| [CV13.E1.S1](cv13-e1-s1-workspace-first-shell-cleanup/index.md) | Workspace-first shell cleanup | Workspace opens first, Identity is second, the perspective badge is removed, and journey views stop showing task noise | ✅ Done |

---

## Non-goals

- No writes.
- No profile/preferences page.
- No multi-Mirror database selection.
- No configuration editing.
- No conversation retitle.
- No operation runner or background agent execution.

---

## Done Condition

CV13.E1 is done when the v1.1 read-only web surface feels like a product refinement over CV9.E6: Workspace-first navigation, cleaner shell, task-free journey visualization, better read-only browsing affordances, focused tests, and successful manual browser validation.
