[< Roadmap](../index.md)

# CV9 — Mirror Mind 1.0: Refactoring, Stabilization, and Release Preparation

**Status:** 🟢 In Progress
**Goal:** Prepare Mirror Mind for public release by hardening architectural boundaries, increasing test coverage, improving onboarding, and polishing documentation.

---

## What This Is

Mirror Mind has grown through eight Capability Values, expanding from a Claude-only spike to a portable, multi-runtime memory framework with deep intelligence layers (search, extraction, consolidation, shadow). 

CV9 marks the transition from "internal research project" to "stable tool." The focus shifts from adding new features to making the existing ones rock-solid, well-documented, and easy to adopt. 

The major themes are:
1. **Architectural Purity** — Completing the storage refactor so the system is easy to maintain and test.
2. **Operational Robustness** — Hardening the runtimes and handling failure modes gracefully.
3. **Developer/User Experience** — Polishing onboarding, documentation, distribution, and the development/release process.

---

## Epics

| Code | Epic | User-visible outcome | Status |
|------|------|----------------------|--------|
| CV9.E1 | Boundary Hardening | A clean, layered architecture with no direct SQL in CLI and clear transaction boundaries | 🟡 Planned |
| [CV9.E2](cv9-e2-stabilization/index.md) | Stabilization & Robustness | Improved error handling and feature-flag safety across all runtimes | 🟡 Planned |
| [CV9.E3](cv9-e3-distribution-tooling/index.md) | Distribution & Tooling | A simple, robust way to install and update Mirror Mind | ✅ Done — Self-Update Done track complete |
| [CV9.E4](cv9-e4-documentation-polish/index.md) | Documentation & Polish | Comprehensive, accurate, and helpful documentation for the public | ✅ Done |
| [CV9.E5](cv9-e5-process-versioning-alignment/index.md) | Process & Versioning Alignment | An explicit development lifecycle and prospective versioning model for future work | ✅ Done |
| [CV9.E6](cv9-e6-web-visibility/index.md) | Web Visibility | A local read-only web surface reveals Mirror data through Identity and Workspace perspectives | ✅ Done |

---

## Done Condition

CV9 is done:
- `RuntimeSessionService` no longer owns raw transaction SQL; transaction boundaries are architecturally sound.
- All direct `store.conn` calls are removed from the `src/memory/cli` package.
- All runtimes (Pi, Gemini CLI, Codex, Claude Code) handle missing environment variables or API failures gracefully.
- External extensions have consistent first-class skill discovery across supported runtimes, including the shared Gemini CLI/Codex `.agents/skills/` surface.
- A robust installation script or `uv`-based distribution path exists.
- Documentation (README, Getting Started, REFERENCE) is audited and confirmed accurate for 1.0 release.
- A local read-only web visibility surface lets users inspect core Mirror data through Identity and Workspace perspectives without reading the database or using CLI commands.
- Process and versioning rules are explicit, prospective from CV9.E5 onward, and reflected in the development guide.
- CI remains green with high coverage.

---

## Sequencing

```text
E1 Boundary Hardening
  └── E2 Stabilization
        └── E3 Distribution
              ├── E4 Documentation & Polish
              ├── E5 Process & Versioning Alignment
              └── E6 Web Visibility
```

---

## See also

- [Briefing](../../briefing.md)
- [Decisions](../../decisions.md)
- [CV8 Runtime Expansion](../cv8-runtime-expansion/index.md)
