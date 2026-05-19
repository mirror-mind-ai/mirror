[< CV9 Mirror Mind 1.0](../index.md)

# CV9.E5 — Process & Versioning Alignment

**Epic:** Adopt an explicit development and versioning model for Mirror Mind 1.0 and future work  
**Status:** 🟢 In Progress  
**Decision:** Versioning is prospective from the adoption point. Historical versions through `v0.7.0` remain historical and are not semantically reinterpreted.

---

## What This Is

Mirror Mind already has a working development guide, a CV → Epic → Story roadmap, Git tags, release-like worklog entries, and a strong documentation culture. But two parts are still implicit:

1. **Versioning.** The repository has versions and tags, but no written rule for when MAJOR, MINOR, or PATCH changes.
2. **Development model.** The repository has good conventions, but the full operating method, including process/project/product coherence, expand/collapse rhythm, checkpoints, release notes, and maintenance work, is not explicit.

CV9.E5 imports and adapts the development process developed in the Lucas Vidal mirror demo, without copying it blindly. Mirror Mind is a framework with its own history, English documentation convention, existing CV terminology, multiple runtimes, a Python package version, and public release preparation constraints. The process must fit this repository, not overwrite it.

---

## Scope

This epic creates the process foundation needed before Mirror Mind 1.0:

- A revised `docs/process/development-guide.md` that includes the full story lifecycle, mandatory checkpoints, and coherence check.
- New process docs for:
  - `docs/process/triad.md`
  - `docs/process/expand-collapse.md`
  - `docs/process/versioning.md`
  - `docs/process/release-notes.md`
- A `docs/releases/` directory for narrative release notes from this point forward.
- A decision record documenting prospective versioning and the adapted development model.
- Roadmap and docs index updates so the new process is discoverable.

---

## Stories

| Code | Story | Status |
|------|-------|--------|
| [CV9.E5.S1](cv9-e5-s1-adopt-development-process/index.md) | Adopt development process and prospective versioning | ✅ Done |
| [CV9.E5.S2](cv9-e5-s2-documentation-information-architecture/index.md) | Documentation Information Architecture | 🟡 Planned |

---

## Done Condition

CV9.E5 is done when:

- The process docs describe how Mirror Mind work flows across process, project, and product.
- Versioning rules are explicit, prospective, and compatible with existing tags through `v0.7.0`.
- Release notes have a documented format and a canonical location.
- The story lifecycle includes explicit checkpoints and a coherence check.
- The roadmap, docs index, and decisions log point to the new process docs.
- The verification guide checks internal links, stale versioning claims, and consistency between roadmap and process docs.

---

## See also

- [CV9 Mirror Mind 1.0](../index.md)
- [Development Guide](../../../../process/development-guide.md)
- [Engineering Principles](../../../../process/engineering-principles.md)
- [Worklog](../../../../process/worklog.md)
