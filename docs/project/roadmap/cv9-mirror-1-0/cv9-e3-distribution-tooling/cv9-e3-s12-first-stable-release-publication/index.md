[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S12 — First Stable Release Publication

**Epic:** CV9.E3 Distribution & Tooling
**Status:** 🟢 In Progress
**User-visible outcome:** Mirror Mind has its first formal release under the new stable-channel model: a version bump, narrative release note, tag, and promoted `stable` branch.

---

## Why

The self-update mechanism now distinguishes `main` from `stable`, but `stable`
currently points to a validated baseline without a formal prospective release
note. That is enough to bootstrap the channel, but not enough to prove the
release-management loop.

This story turns the mechanism into a release: a named version, a narrative
release note, a tag, and a stable promotion that production can follow.

---

## Scope

- Choose the first prospective release version. Current proposal: `v0.8.0`.
- Bump the package version in `pyproject.toml` from `0.7.0` to `0.8.0`.
- Create `docs/releases/v0.8.0.md` using the release-note template.
- Update `docs/releases/index.md` to list the new release.
- Update any visible version references that should no longer say `0.7.0` as current.
- Run release validation checks.
- Create tag `v0.8.0` at the validated commit.
- Promote `origin/stable` to `v0.8.0` by fast-forward.
- Validate production (`~/mirror`) on update channel `stable`:
  - `runtime version` shows the new version after update;
  - `runtime update --check` is up to date;
  - `runtime release-notes latest` renders `v0.8.0`;
  - `welcome` shows the new version and `channel stable`.

---

## Out of Scope

- Release-aware welcome text that names the version/title before install. That belongs to CV9.E3.S13.
- Full runtime parity for natural-language release-note access. That belongs to CV9.E3.S14.
- Automated release doctor/promote commands. Those belong to CV9.E3.S15–S16.
- Changing the local production git branch name from `main` to `stable`.

---

## Acceptance Criteria

- `pyproject.toml` version is `0.8.0`.
- `docs/releases/v0.8.0.md` exists and has digest, highlights, narrative sections, exclusions, lessons, and next horizon.
- Git tag `v0.8.0` exists on the release commit.
- `origin/stable` points to the tagged release commit.
- Production on channel `stable` can update to the release without manual git intervention.
- `runtime release-notes latest` renders `v0.8.0` after update.
- `runtime status` is ready after update.

---

## See also

- [Versioning](../../../../../process/versioning.md)
- [Release Notes](../../../../../process/release-notes.md)
- [Runtime Self-Update Reference](../../../../../../REFERENCE.md#runtime-self-update)
