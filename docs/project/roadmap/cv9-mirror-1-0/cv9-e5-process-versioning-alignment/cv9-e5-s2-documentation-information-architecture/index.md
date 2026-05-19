[< CV9.E5 Process & Versioning Alignment](../index.md)

# CV9.E5.S2 — Documentation Information Architecture

**Epic:** CV9.E5 Process & Versioning Alignment  
**Status:** 🟡 Planned  
**User-visible outcome:** The Web Console documentation tree has a clear home, section landing pages, and a structure aligned with process, project, and product.

---

## Problem

Reading the docs through the Mirror Web Console exposed information architecture issues that are not part of the process model itself:

- `docs/index.md` behaves like a map, not a welcoming documentation home.
- Root-level docs such as `architecture.md` and `api.md` may belong in a more explicit developer/reference area.
- Releases appear as a fourth top-level folder beside Process, Project, and Product, weakening the triad.
- Major folders need cover pages that explain what lives inside them.
- `troubleshooting.md` may belong under product/operations rather than process.
- The worklog needs a scaling strategy.
- `docs/product/envisioning/index.md` may be carrying a historical synthesis that should be separated from the section landing page.

---

## Scope Candidate

This story is planned but not designed yet. Candidate work:

- Redesign `docs/index.md` as a real documentation home.
- Add or refine folder cover pages for Process, Project, Product, and major subareas.
- Move release notes under the Project dimension.
- Decide where Architecture and Python API should live.
- Reclassify Troubleshooting.
- Design a scalable worklog structure.
- Separate Envisioning landing-page content from historical synthesis content.

---

## See also

- [S1 Review Notes](../cv9-e5-s1-adopt-development-process/review-notes.md)
- [Development Guide](../../../../process/development-guide.md)
- [Docs index](../../../../index.md)
