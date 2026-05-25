[< CV9.E3.S17](index.md)

# Plan — CV9.E3.S17 Fresh User Stable Update Smoke

## Current State

The active release intent is `v0.9.0 — Self-Update Done`, covering S13–S17. S16 added the controlled local/remote stable promotion command, but `v0.9.0` has not yet been prepared or published. Therefore the smoke has two possible paths:

1. if a newer stable release exists, execute the full fresh-user update smoke;
2. if no newer stable release exists, create and validate a reproducible smoke procedure, then pause before actual release publication.

## Release Context

```text
Release Intent
[known] v0.9.0 — Self-Update Done
Scope: 🟩[S13] + 🟩[S14] + 🟩[S15] + 🟩[S16] + 🟩[S17]
State: building
```

S17 is the release evidence story. It should not silently publish `v0.9.0`; release publication remains an explicit Navigator decision.

## Smoke Design

Use a temporary directory outside production:

```bash
SMOKE_ROOT=$(mktemp -d /tmp/mirror-stable-smoke.XXXXXX)
SMOKE_HOME="$SMOKE_ROOT/mirror-home"
SMOKE_CLONE="$SMOKE_ROOT/mirror-clone"
```

Clone and pin older stable:

```bash
git clone /Users/alissonvale/Code/mirror-dev "$SMOKE_CLONE"
cd "$SMOKE_CLONE"
git checkout v0.8.0
printf 'production\n' > .mirror-clone-role
printf 'stable\n' > .mirror-update-channel
```

Prepare isolated runtime state:

```bash
mkdir -p "$SMOKE_HOME"
MEMORY_DIR="$SMOKE_HOME" uv run python -m memory init smoke-user
MEMORY_DIR="$SMOKE_HOME" uv run python -m memory seed
```

Run stable update path:

```bash
MEMORY_DIR="$SMOKE_HOME" uv run python -m memory runtime version
MEMORY_DIR="$SMOKE_HOME" uv run python -m memory runtime update --check
MEMORY_DIR="$SMOKE_HOME" uv run python -m memory runtime update --dry-run
MEMORY_DIR="$SMOKE_HOME" uv run python -m memory runtime update
MEMORY_DIR="$SMOKE_HOME" uv run python -m memory runtime status
MEMORY_DIR="$SMOKE_HOME" uv run python -m memory runtime release-notes latest
```

## Expected Current Limitation

Until `v0.9.0` is actually released and `stable` is promoted beyond `v0.8.0`, a clone pinned to `v0.8.0` on the stable channel should report up to date. That is not a failure of the updater; it means the full S17 acceptance condition depends on release publication.

If this happens, S17 should produce a validated smoke checklist/script and record that the actual update hop is blocked until release promotion.

## Implementation Shape

Prefer documentation plus a script-like test guide first. Add code only if validation reveals a runtime bug or if a small helper command is clearly needed.

Possible artifact:

```text
docs/project/roadmap/.../fresh-user-stable-update-smoke.md
```

or use `test-guide.md` as the executable checklist.

## Validation

- Structural docs review.
- Run the isolated smoke until the point allowed by current release state.
- Confirm no production database path is touched.
- Confirm temporary clone status and outputs are recorded.

## Decision Point

Before executing mutating release publication for `v0.9.0`, stop and ask the Navigator. Publication would involve version bump, release note, release doctor, release promote, push, and possibly CI/GitHub Actions checks. That is larger than smoke unless explicitly chosen.
