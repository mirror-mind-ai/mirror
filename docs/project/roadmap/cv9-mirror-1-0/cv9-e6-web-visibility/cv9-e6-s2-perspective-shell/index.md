[< CV9.E6 Web Visibility](../index.md)

# CV9.E6.S2 — Perspective Shell and Preference

**Status:** ✅ Done
**User-visible outcome:** The local web app lets the user choose Atlas or Workspace, remembers the default, and keeps a stable shell across perspectives.

## Scope

Add the shared web shell for Mirror visibility:

- first-run perspective choice when no default exists;
- perspective switcher;
- stable header with Mirror identity and global search affordance;
- user-home default perspective preference;
- honest fallback when the preference cannot be read or written.

## Acceptance Criteria

- A new local web session asks for a perspective when no default exists.
- The default perspective is stored in the user home, not only in browser-local
  state.
- The active perspective remains visible and switchable.
- Atlas and Workspace share the same shell.
- The docs browser remains accessible or intentionally repositioned.

## Plan and Validation

- [Plan](plan.md)
- [Test Guide](test-guide.md)

## Implementation Summary

S2 added the shared web shell for Atlas, Workspace, and Docs; introduced a
user-home preference file at `web/preferences.json`; exposed shell and surface
API routes; and rendered initial Atlas/Workspace content from `mem.surfaces`.
The perspective switcher is intentionally discreet: Atlas is shown when no
preference exists, and selecting Atlas or Workspace from the shell persists the
new default in the Mirror home. Docs remains available as its own mode with the
documentation sidebar.

Deeper Atlas home design belongs to S3, and the Workspace dashboard design
belongs to S5.

## Notes

This story did not implement the full Atlas or Workspace content. It created
the frame they will inhabit.
