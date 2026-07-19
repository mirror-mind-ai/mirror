[< CV9.E5 Process & Versioning Alignment](../index.md)

# CV9.E5.S2 — Documentation Information Architecture

**Epic:** CV9.E5 Process & Versioning Alignment  
**Status:** ✅ Done
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

## Scope

This story designs and applies a documentation information architecture suitable
for the 1.0 public surface. It should clarify what each top-level section is for,
make operational references discoverable, and avoid large moves unless they
improve navigation without breaking known links.

Candidate work:

- Redesign `docs/index.md` as a real documentation home.
- Add or refine folder cover pages for Process, Project, Product, and major subareas.
- Move release notes under the Project dimension, or explicitly decide to keep
  them as a top-level reference area.
- Decide where Architecture and Python API should live.
- Reclassify Troubleshooting and runtime repair docs if Process is not the right
  long-term home.
- Design a scalable worklog structure.
- Separate Envisioning landing-page content from historical synthesis content.

---

## Result

This story applies a conservative documentation information architecture based on
Ariad's pattern:

- `docs/index.md` now opens with a short narrative and explicit Start Here paths
  for new users, operators, contributors, and developers.
- The Product / Project / Process triad remains the organizing spine.
- A practical Reference layer names commands, runtime operations, architecture,
  API, releases, and runtime self-update lookup surfaces.
- No files were moved for symmetry before 1.0. Stable links remain preferred
  until there is enough navigation pressure to justify a dedicated reference or
  operations subtree.
- The worklog gained a prospective scaling rule: keep it single-file through 1.0
  and archive by release or year afterward if it becomes hard to scan.

## See also

- [S1 Review Notes](../cv9-e5-s1-adopt-development-process/review-notes.md)
- [Development Guide](../../../../../process/development-guide.md)
- [Docs index](../../../../../index.md)
