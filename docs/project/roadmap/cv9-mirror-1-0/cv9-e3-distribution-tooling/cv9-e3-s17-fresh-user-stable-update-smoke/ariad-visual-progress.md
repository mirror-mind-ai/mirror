[< CV9.E3.S17](index.md)

# Ariad Visual Progress Experiment

## Visual Grammar

Taxonomy cards:

- `🟪[CV9]` for Capability Value cards
- `🟦[E3]` for Epic cards
- `🟩[S17]` for Story cards

Ariad checkpoint states:

- `✓` done
- `◉` current
- `○` pending
- `✕` blocked

## Transition View

```text
Completed
🟩[S16] Stable Promotion Execution Path
Status: Done
Commit: 83ac9c8

Integrated into
🟦[E3] Distribution & Tooling

Unlocked
- Stable can now be promoted through a controlled command path.
- The remaining proof is whether a fresh user-shaped clone can receive stable without manual git intervention.

Moving next
🟩[S16] Stable Promotion Path  ──unlocks──>  🟩[S17] Fresh User Stable Update Smoke
```

## Bird's-Eye Map

```text
🟪[CV9]  Mirror Mind 1.0
  🟦[E3]   Distribution & Tooling  Stories: 17/17  ████████ 100%
    🟩[S17]  Fresh User Stable Update Smoke
```

## Release Intent

```text
Release Intent
[known] v0.9.0 — Self-Update Done
Scope: 🟩[S13] + 🟩[S14] + 🟩[S15] + 🟩[S16] + 🟩[S17]
State: published to stable
```

## Ariad Stage Ribbon

```text
Ariad: ✓ Plan | ✓ Implement | ✓ Validate | ✓ Review | ✓ Coherence | ◉ Commit
Flow:   Backlog | Ready | Doing | Validate | ◉ Done
Progress: ███████░ 88%
```

## Horizontal Flow Board

```text
+---------+--------------------------------+-------+----------+--------------------------------+
| Backlog | Ready                          | Doing | Validate | Done                           |
+---------+--------------------------------+-------+----------+--------------------------------+
|         | 🟩[S17] Fresh User Smoke       |       |          | 🟩[S16] Stable Promotion Path  |
|         |                                |       |          | 🟩[S15] Release Doctor         |
+---------+--------------------------------+-------+----------+--------------------------------+
```

## Visualization Notes

- Epic progress in Bird's-Eye Map immediately shows that S17 is the final story in the current E3 self-update track.
- Release Intent makes clear that S17 is not random validation; it is evidence for the `v0.9.0 — Self-Update Done` release arc.
- This checkpoint exposes a distinction Maestro should model: a story can be ready, while the release needed for its full acceptance is not yet published.
- Smoke finding: historical stable smoke must override both `MIRROR_USER=` and `MIRROR_HOME="$SMOKE_HOME"`. `MEMORY_DIR` alone is insufficient because older stable code can load `MIRROR_USER` from `.env` and resolve the production Mirror home.
- Smoke finding: S17 is validated as a no-op stable update at `v0.8.0`, but the full `v0.8.0 -> v0.9.0` hop is blocked until `v0.9.0` is published.

## Validation Snapshot

```text
Current stable: v0.8.0 @ 4bdff1b
Smoke clone:    /tmp/mirror-stable-smoke2.MSjTO6/mirror-clone
Smoke home:     /tmp/mirror-stable-smoke2.MSjTO6/mirror-home
Result:         passed after v0.9.0 stable promotion

✓ start: v0.8.0 @ 4bdff1b
✓ origin/stable: v0.9.0 @ fac6da3
✓ update --check: update_available
✓ update --dry-run: ready, pull 8 commits
✓ update: success, fast-forward 4bdff1b -> fac6da3
✓ backup and verification passed
✓ runtime status: ready against smoke home
✓ release notes: v0.9.0 rendered
```

## Release Candidate Snapshot

```text
v0.9.0 — Self-Update Done
✓ pyproject version bumped to 0.9.0
✓ release note created
✓ release index updated
✓ release notes latest renders v0.9.0
✓ targeted runtime validation passed
✓ release candidate committed: fac6da3
✓ release doctor passed with expected warnings
✓ release-promote local and push succeeded
✓ fresh-user v0.8.0 -> v0.9.0 smoke passed
```
