[< CV9.E3.S18](index.md)

# Plan — CV9.E3.S18 Welcome and Status Bar Release Awareness

## Current State

- `runtime update --check` can query the remote stable ref with `git ls-remote`.
- `runtime update --dry-run` and welcome are local-ref based.
- The welcome shows version and channel but does not announce a newly published release when local refs are stale.
- Pi currently has a status bar signal similar to `Conversation logging ACTIVE · ext 1`.
- Users can ask for release notes and updates, but opening the Mirror does not yet suggest that path.

## Product Direction

The desired opening experience:

```text
◇ Mirror · alisson-vale
Version 0.8.0 · channel stable

Update available: v0.9.0 — Self-Update Done
Ask: “what changed?” or “update my Mirror”
```

The desired status bar experience:

```text
◇ alisson-vale · ✓
◇ alisson-vale · ⬆ v0.9.0
◇ alisson-vale · ⚠ attention
```

## Design

### Release awareness cache

Create a small JSON cache under the active Mirror home:

```text
<mirror-home>/runtime/update-check.json
```

Suggested fields:

```json
{
  "checked_at": "2026-05-23T15:00:00Z",
  "channel": "stable",
  "current_commit": "4bdff1b",
  "remote_commit": "fac6da3",
  "availability": "update_available",
  "version": "v0.9.0",
  "title": "Self-Update Done",
  "source": "remote"
}
```

The cache should be best-effort. If it is missing, corrupt, or stale, Mirror should continue opening normally.

### Lightweight remote check

Welcome/status awareness may run a lightweight remote check when:

- update channel is `stable`;
- cache is missing or older than a TTL;
- repository and remote are available.

Constraints:

- use `git ls-remote`, not fetch;
- short timeout;
- no ref mutation;
- no database mutation;
- fail softly.

### Release metadata

When remote commit differs, the system can only infer release title if the release note is local or cache already has it. To show `v0.9.0 — Self-Update Done` after a release announcement, we need one of:

- local release note already present, available after refs are fetched or code updated;
- remote release metadata fetched from a non-git API, out of scope for now;
- cache populated by a previous explicit check or release-aware command.

For S18, use the best locally available title. If title is unavailable, show:

```text
Update available on stable.
```

If version can be inferred from tag pointing to the same remote commit through `git ls-remote --tags`, show the version.

### Status bar

Treat the status bar as a compact signal, not a report.

Priority order:

1. action required (`✕`)
2. attention (`⚠`)
3. update available (`⬆ vX.Y.Z`)
4. healthy (`✓`)
5. unknown (`?`)

Compact shape:

```text
◇ <user> · <indicator>
```

Welcome carries the explanation and next prompts.

## Implementation Slices

### S18A — Core release-awareness cache and welcome notice

- Add cache read/write helpers.
- Add lightweight check helper with timeout.
- Update welcome rendering to include update notice.
- Tests for cache, stale/missing cache, remote update, and fail-soft behavior.

### S18B — Pi status bar health indicator

- Inspect Pi extension status bar implementation.
- Replace or enrich current `Conversation logging ACTIVE · ext 1` with compact Mirror health.
- Show active user and single indicator.
- Keep detailed explanation in welcome.

### S18C — Prompt affordance and docs

- Update help/reference/welcome spec.
- Ensure natural prompts map to existing release notes and update commands.

## Risks

- Network latency during welcome. Mitigation: short timeout and fail-soft behavior.
- Stale cache causing stale signal. Mitigation: TTL and update cache after successful update.
- Status bar overcrowding. Mitigation: one indicator only.
- Version title inference may be incomplete if release notes are not local. Mitigation: degrade to “update available on stable.”

## Decisions

- Automatic remote check TTL: 6 hours.
- Users should be able to disable remote welcome checks.
- Status bar should read cache only. Welcome may refresh the cache. Rationale: the status bar is a compact signal and should not become the component that performs network work.
- Release version inference should query remote tags with `git ls-remote --tags` and match tags that point to the same commit as the remote stable ref. Release title should use local release notes when available; otherwise degrade to version-only wording such as `Update available: v0.9.0` or commit-level wording when no matching tag is known.
