[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S17 — Fresh User Stable Update Smoke

**Epic:** CV9.E3 Distribution & Tooling  
**Status:** ✅ Done
**User-visible outcome:** A fresh clone can update from an older stable release to the current stable release without manual git intervention, proving the self-update path works for a new user shape rather than only for the developer's production clone.

---

## Why

S13–S16 made stable updates release-aware, discoverable, preflighted, and promotable. The remaining proof is user-shaped: a fresh clone starting from an older stable release should be able to follow the documented stable self-update path and arrive at the new stable release safely.

This is a smoke story, not a new feature story. Its value is evidence.

## Scope

In scope:

- Define an isolated fresh-user stable update smoke procedure.
- Run it against a temporary clone and temporary Mirror home.
- Verify runtime version, channel, release notes, update check, dry-run, update execution, and post-update status where possible.
- Avoid touching the production clone or production database.
- Record findings, blockers, and exact commands.

Out of scope:

- Publishing a new release unless the Navigator explicitly decides to turn the current arc into a release candidate.
- Mutating the production clone.
- Repairing unrelated packaging or installer issues beyond small blockers required for the smoke.
- Automating a full release pipeline.

## Acceptance Criteria

- A temporary clone can be placed at an older stable release.
- The clone can be configured for the stable update channel.
- The smoke uses an isolated Mirror home and does not touch production data.
- `runtime update --check` sees the newer stable target when one exists.
- `runtime update --dry-run` explains the update path without mutation.
- `runtime update` can move the clone to the current stable release without manual git intervention when a newer stable exists.
- Post-update `runtime version`, `runtime status`, and `runtime release-notes latest` show the expected release state.
- If no newer stable release exists yet, the story records the gap and either pauses for release publication or converts into a reproducible smoke script/checklist.

## Result

Fresh-user stable update smoke passed after `v0.9.0` was promoted to stable.

Evidence:

- temporary clone started at `v0.8.0` commit `4bdff1b`;
- `origin/stable` pointed to `v0.9.0` commit `fac6da3`;
- isolated Mirror home used `MIRROR_USER=` and `MIRROR_HOME=$SMOKE_HOME`;
- `runtime update --check` reported `update_available`;
- `runtime update --dry-run` reported ready with `ahead 0, behind 8`;
- `runtime update` fast-forwarded `4bdff1b -> fac6da3`, created and verified a backup, ran migrations, and passed post-update status;
- post-update `runtime version` reported `0.9.0`;
- post-update `runtime status` was ready against the smoke home;
- `runtime release-notes latest` rendered `v0.9.0 — Self-Update Done`.

The first pre-promotion smoke also revealed the important isolation rule captured in the test guide: historical stable smoke must set both `MIRROR_USER=` and `MIRROR_HOME=$SMOKE_HOME`; `MEMORY_DIR` alone is insufficient when older code loads `MIRROR_USER` from `.env`.

## See also

- [CV9.E3.S16 Stable Promotion Execution Path](../cv9-e3-s16-stable-promotion-execution/index.md)
- [Runtime Self-Update Reference](../../../../../../REFERENCE.md#runtime-self-update)
- [Versioning](../../../../../process/versioning.md)
