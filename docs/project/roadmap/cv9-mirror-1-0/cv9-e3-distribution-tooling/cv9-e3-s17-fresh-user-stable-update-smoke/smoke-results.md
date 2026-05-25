[< CV9.E3.S17](index.md)

# Smoke Results — Fresh User Stable Update Smoke

**Date:** 2026-05-23  
**Result:** Passed after v0.9.0 stable promotion
**Smoke root:** `/tmp/mirror-stable-smoke2.MSjTO6`  
**Temporary clone:** `/tmp/mirror-stable-smoke2.MSjTO6/mirror-clone`  
**Temporary Mirror home:** `/tmp/mirror-stable-smoke2.MSjTO6/mirror-home`

## Summary

The isolated stable update path works for the currently published stable release state: a fresh clone at `v0.8.0` on the `stable` channel reports `up_to_date`, dry-run is ready, `runtime update` succeeds as a no-op, post-update status is ready, and `runtime release-notes latest` renders `v0.8.0 — Stable Self-Update Foundation`.

The full intended hop from `v0.8.0` to `v0.9.0` could not be exercised because `v0.9.0` has not been prepared, tagged, or promoted to `stable` yet. This is a release-state blocker, not an updater failure.

## Important Isolation Finding

The first smoke attempt used `MEMORY_DIR`, but `v0.8.0` still resolved the production Mirror home because the repository `.env` provided `MIRROR_USER=alisson-vale`. That attempt reached the production database path.

Correct isolation for historical stable smoke requires overriding both variables on every command:

```bash
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory ...
```

This prevents `.env` from repopulating the production user home and keeps the database under the temporary Mirror home.

## Setup Used For Valid Smoke

```bash
SMOKE_ROOT=/tmp/mirror-stable-smoke2.MSjTO6
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

Initial state:

```text
START_COMMIT=4bdff1b
ORIGIN_STABLE=4bdff1b
Version=0.8.0
```

## Bootstrap Result

```bash
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory seed
```

Result:

```text
Mirror home: /tmp/mirror-stable-smoke2.MSjTO6/mirror-home
Result: 19 created, 0 updated, 0 skipped
Errors: 1
  - ego/constraints: empty content
```

The seed command returned non-zero because one template file had empty content, but it created the database and enough identity rows for runtime status and update smoke. This should be considered a follow-up onboarding/template quality issue, not an updater failure.

Database created:

```text
/tmp/mirror-stable-smoke2.MSjTO6/mirror-home/memory.db
/tmp/mirror-stable-smoke2.MSjTO6/mirror-home/memory.db-shm
/tmp/mirror-stable-smoke2.MSjTO6/mirror-home/memory.db-wal
```

## Runtime Version

```bash
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory runtime version
```

Output summary:

```text
Version: 0.8.0
Git commit: 4bdff1b
Clone role: production
Update channel: stable
```

## Update Check

```bash
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory runtime update --check
```

Output summary:

```text
Current: 4bdff1b
Upstream: origin/stable @ 4bdff1b
Availability: up_to_date
Next: no update needed
```

Exit code: `0`.

## Dry Run

```bash
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory runtime update --dry-run
```

Output summary:

```text
Current status: ready
Git relation: ahead 0, behind 0
Update plan: already up to date
Dry-run result: ready
```

Exit code: `0`.

## Update Execution

```bash
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory runtime update
```

Output summary:

```text
[✓] status gate
[✓] fetch: origin stable
[✓] plan: already up to date
Update result: success
```

Exit code: `0`.

## Post-Update Status

```bash
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory runtime status
```

Output summary:

```text
Version: 0.8.0
Mirror home: /tmp/mirror-stable-smoke2.MSjTO6/mirror-home
Database exists: yes
Core migrations: current (10/10)
Clone role: production
Update channel: stable
Status: ready
```

Exit code: `0`.

## Release Notes

```bash
MIRROR_USER= MIRROR_HOME="$SMOKE_HOME" uv run python -m memory runtime release-notes latest
```

Output summary:

```text
Release: v0.8.0 — Stable Self-Update Foundation
```

Exit code: `0`.

## Post-Promotion Smoke

After `v0.9.0` was promoted to `stable`, a new temporary clone validated the full update hop.

Smoke root:

```text
/tmp/mirror-stable-smoke3.5j6weE
```

Starting state:

```text
START=4bdff1b
ORIGIN_STABLE=fac6da3
Version before: 0.8.0
```

Update check:

```text
Current: 4bdff1b
Upstream: origin/stable @ fac6da3
Availability: update_available
```

Dry-run:

```text
Current status: ready
Git relation: ahead 0, behind 8
Update plan: pull 8 remote commit(s)
Dry-run result: ready
```

Update execution:

```text
[✓] status gate
[✓] fetch: origin stable
[✓] plan: pull 8 remote commit(s)
[✓] backup: /tmp/mirror-stable-smoke3.5j6weE/mirror-home/backups/memory_20260523_145719.zip
[✓] verify backup
[✓] fast-forward: 4bdff1b -> fac6da3
[✓] migrations
[✓] post-update status
Update result: success
```

Post-update version:

```text
Version: 0.9.0
Git commit: fac6da3
Update channel: stable
```

Post-update status:

```text
Mirror home: /tmp/mirror-stable-smoke3.5j6weE/mirror-home
Database exists: yes
Core migrations: current (10/10)
Clone role: production
Update channel: stable
Status: ready
```

Release notes:

```text
Release: v0.9.0 — Self-Update Done
```

## Conclusion

The fresh-user stable update smoke passed. A temporary clone moved from `v0.8.0` to `v0.9.0` through `runtime update` without manual git intervention, using an isolated Mirror home and the stable channel.

Completed movement:

```text
🟩[S17] Fresh User Stable Update Smoke  ──validates──>  v0.9.0 Self-Update Done
```
