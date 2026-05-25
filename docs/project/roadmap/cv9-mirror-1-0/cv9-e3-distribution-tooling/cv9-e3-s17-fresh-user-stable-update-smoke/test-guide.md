[< CV9.E3.S17](index.md)

# Test Guide — CV9.E3.S17 Fresh User Stable Update Smoke

## Safety Boundary

Do not use the production clone or production Mirror home.

The smoke must use:

- a temporary clone;
- a temporary Mirror home;
- explicit `MIRROR_USER=` and `MIRROR_HOME="$SMOKE_HOME"` on every runtime command;
- stable channel marker in the temporary clone.

## Setup

```bash
SMOKE_ROOT=$(mktemp -d /tmp/mirror-stable-smoke.XXXXXX)
SMOKE_HOME="$SMOKE_ROOT/mirror-home"
SMOKE_CLONE="$SMOKE_ROOT/mirror-clone"

git clone https://github.com/mirror-mind-ai/mirror.git "$SMOKE_CLONE"
cd "$SMOKE_CLONE"
git checkout v0.8.0
printf 'production\n' > .mirror-clone-role
printf 'stable\n' > .mirror-update-channel
mkdir -p "$SMOKE_HOME"
cp -R templates/identity "$SMOKE_HOME/identity"
```

## Bootstrap Isolated User State

```bash
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory seed
```

Expected result: a local database is created under `$SMOKE_HOME`, not under the production Mirror home.

Why both variables are explicit: historical stable versions may load `MIRROR_USER` from `.env`. Setting `MIRROR_USER=` prevents `.env` from repopulating the production user while `MIRROR_HOME` points to the isolated smoke home.

## Stable Update Smoke

```bash
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory runtime version
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory runtime update --check
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory runtime update --dry-run
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory runtime update
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory runtime status
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory runtime release-notes latest
```

Expected result when a newer stable release exists: the clone updates from `v0.8.0` to the newer stable release without manual git intervention.

Expected result before `v0.9.0` is published: the clone reports `v0.8.0` as up to date on stable. Record this as a release-state blocker, not as an updater failure.

## Cleanup

```bash
rm -rf "$SMOKE_ROOT"
```

## Validation Evidence To Record

- Smoke root path.
- Starting commit and version.
- Stable channel marker value.
- Update check result.
- Dry-run result.
- Update result.
- Post-update version and status.
- Release notes rendered.
- Whether production home was untouched.
