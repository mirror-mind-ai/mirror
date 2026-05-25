[< CV9 Mirror Mind 1.0](../index.md)

# CV9.E3 — Distribution & Tooling

**Epic:** Make Mirror Mind simple to install, configure, and grow into  
**Status:** ✅ Done — Self-Update Done track complete

---

## What This Is

CV9.E3 is the distribution and first-run experience epic. The goal is that a
new user can go from zero to a working, personalized mirror in minutes — not
hours — with no manual editing required before the first session.

The scope covers: the install flow, the initial identity bootstrap, the default
template quality, and the mechanisms through which a user's identity deepens
over time.

---

## Stories

| Code | Story | Status |
|------|-------|--------|
| [CV9.E3.S1](cv9-e3-s1-identity-onboarding/index.md) | Zero-Friction Identity Onboarding | ✅ Done |
| [CV9.E3.S2](cv9-e3-s2-runtime-status-health/index.md) | Runtime Status Health Checks | ✅ Done |
| [CV9.E3.S3](cv9-e3-s3-runtime-update-dry-run/index.md) | Runtime Update Dry Run | ✅ Done |
| [CV9.E3.S4](cv9-e3-s4-runtime-backup-recovery/index.md) | Runtime Backup and Recovery Prerequisite | ✅ Done |
| [CV9.E3.S5](cv9-e3-s5-runtime-version-update-availability/index.md) | Runtime Version and Update Availability | ✅ Done |
| [CV9.E3.S6](cv9-e3-s6-clone-role-guard/index.md) | Clone Role Guard | ✅ Done |
| [CV9.E3.S7](cv9-e3-s7-safe-runtime-update-execution/index.md) | Safe Runtime Update Execution | ✅ Done |
| [CV9.E3.S8](cv9-e3-s8-welcome-update-awareness/index.md) | Welcome Update Awareness | ✅ Done |
| [CV9.E3.S9](cv9-e3-s9-updater-self-recovery/index.md) | Updater Self-Recovery | ✅ Done |
| [CV9.E3.S10](cv9-e3-s10-stable-release-channel-management/index.md) | Stable Release Channel Management | ✅ Done |
| [CV9.E3.S11](cv9-e3-s11-release-channel-operations-docs/index.md) | Release Channel Operations Docs | ✅ Done |
| [CV9.E3.S12](cv9-e3-s12-first-stable-release-publication/index.md) | First Stable Release Publication | ✅ Done |
| [CV9.E3.S13](cv9-e3-s13-release-aware-update-notices/index.md) | Release-Aware Update Notices | ✅ Done |
| [CV9.E3.S14](cv9-e3-s14-release-notes-skill-parity/index.md) | Release Notes Skill Parity | ✅ Done |
| [CV9.E3.S15](cv9-e3-s15-release-promotion-doctor/index.md) | Release Promotion Checklist / Doctor | ✅ Done |
| [CV9.E3.S16](cv9-e3-s16-stable-promotion-execution/index.md) | Stable Promotion Execution Path | ✅ Done |
| [CV9.E3.S17](cv9-e3-s17-fresh-user-stable-update-smoke/index.md) | Fresh User Stable Update Smoke | ✅ Done |
| [CV9.E3.S18](cv9-e3-s18-welcome-status-release-awareness/index.md) | Welcome and Status Bar Release Awareness | ✅ Done |

---

## Done Condition

CV9.E3 is done when the Self-Update Done condition is met:

- A new user can run `memory init <name>` followed by `memory seed` and have a
  working, personalized mirror without manual YAML editing before first use.
- Runtime status, diagnosis, backup, version inspection, update discovery,
  update planning, and safe update execution exist as documented CLI surfaces.
- Production and development clones have an explicit local role boundary through
  `.mirror-clone-role`, and Builder Mode refuses production clones by default.
- Runtime update execution is conservative: status-gated, backup-first,
  verification-backed, fast-forward only, and manual-recovery oriented.
- The welcome card shows the installed version and surfaces locally known update
  availability without contacting the network.
- Successful runtime updates summarize installed changes after the fast-forward.
- The updater has a code-only self-repair lane for status-gate crashes, so stale
  updater bugs can be fixed without asking end users to perform manual git
  recovery.
- Update channels distinguish integration (`main`) from user-facing releases
  (`stable`), and release notes are available through runtime surfaces and a
  Mirror skill.
- Channel switching, branch/channel differences, stable bootstrap, and common
  channel troubleshooting are documented.
- A first formal stable release is published with a version bump, narrative
  release note, tag, and stable branch promotion.
- Stable update notices and post-install output speak in release terms, while
  main/dogfooding updates can fall back to commit summaries.
- Release notes are accessible through natural-language runtime surfaces across
  supported runtimes.
- Stable promotion has a repeatable preflight/checklist or doctor.
- A fresh clone can update from an older stable release to a newer stable release
  without manual git intervention.
- `README`, `REFERENCE.md`, process docs, decisions, and roadmap entries reflect
  the onboarding and self-update flow accurately.

---

## See also

- [CV9 Mirror Mind 1.0](../index.md)
- [CV9.E2 Stabilization & Robustness](../cv9-e2-stabilization/index.md)
- [Getting Started](../../../../getting-started.md)
