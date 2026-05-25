[< CV9.E6 Web Visibility](../index.md)

# CV9.E6.S5 — Workspace Dashboard Slice

**Status:** ✅ Done
**User-visible outcome:** Workspace shows a first useful read-only journey workspace over available Mirror data.

## Scope

Implement the first Workspace read model after the Atlas surface pattern exists:

- active journeys section;
- recent conversations section;
- available tasks or operational context when service support is clean;
- relevant memories if they can be surfaced without ad hoc query logic;
- clear partial/empty states.

## Acceptance Criteria

- Workspace feels analytical and state-oriented, not like the Atlas psyche map.
- The dashboard uses the same shell, object model, detail grammar, and design
  tokens as Atlas.
- Workspace does not become a generic project-management clone.
- All sections are backed by surface DTOs.
- Unsupported areas are shown as honest empty or partial states.

## Plan and Validation

- [Plan](plan.md)
- [Test Guide](test-guide.md)

## Implementation Summary

S5 pivoted Workspace from a generic section dashboard into a journey-centric
workspace. The left side is now a scrollable journey menu ordered by most recent
activity. The selected journey opens in the central area with a profile-style
header, selected-journey metrics, and tabs for Briefing, Conversations, Tasks,
Memories, and Decisions.

The selected journey defaults to the most recently worked active journey based
on recent conversations, memories, and tasks, and can be changed through the
sidebar via `GET /api/surface/workspace?journey=<id>`. The Briefing tab renders
the real journey identity content as formatted Markdown-like text. Decisions are
shown as journey-filtered decision memories when available, otherwise as an
honest empty state.

Validation passed with focused surface/web/public API tests, Ruff checks, JS
syntax check, and manual browser review.

## Notes

Decisions remain derived from decision memories in 1.0 unless a stronger
decision model is introduced later.
