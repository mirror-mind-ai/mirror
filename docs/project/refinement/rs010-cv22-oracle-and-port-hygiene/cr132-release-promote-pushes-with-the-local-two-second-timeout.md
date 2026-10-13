[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR132 — `release:promote` pushes with the two-second local git timeout, and stops half-promoted

## Problem

`npm run release:promote -- --target vX.Y.Z --push` pushes the tag and then `stable`
through `runGit(["push", remote, ref], repository)` (`ts/scripts/releasePromote.ts`).
`runGit` defaults to `GIT_LOCAL_TIMEOUT_MS`, which is 2 seconds (`ts/src/runtime/git.ts`).
A push over SSH to GitHub takes longer than that, so the push is killed: `spawnSync git
ETIMEDOUT`.

By then the tag exists and `stable` has moved, both locally. The promotion reports
`failed` with the tag and the branch unpublished, and its recovery list is empty.

`git.ts` already defines `GIT_NETWORK_TIMEOUT_MS` (120 s). Its comment cites the v0.30.1
release incident, a short timeout on a network operation, and `releaseNotes.ts` passes it
to its `fetch`. The two pushes do not.

## Expected Behavior

- The push steps run with `GIT_NETWORK_TIMEOUT_MS`, like every other network git call.
- A push that fails after the local steps succeeded prints the recovery: the two
  commands that finish the promotion (`git push origin vX.Y.Z`, `git push origin
  stable`), and that the tag and branch already exist locally, so they are not re-created.
- A test pins the timeout the push steps pass.

## Impact

Medium for the release route: a maintainer can meet a failed promotion on any push slower
than two seconds. No history is at risk, because the tag and the branch stay local until
pushed and are not moved by a re-run.

## Plan Or Decision

Captured, unassigned, at the `v0.33.0` release (2026-10-13). Current Focus unchanged.
Likely a one-argument change per push, plus the recovery lines and the test.

## Evidence

```text
$ npm run release:promote -- --target v0.33.0 --push
[✓] release doctor: 2 warning(s)
[✓] publish dry run: packed
[✓] tag: created v0.33.0 at HEAD
[✓] stable branch: fast-forwarded stable to HEAD
[✗] push tag: spawnSync git ETIMEDOUT
Release promotion result: failed
```

Finished by hand with the script's own commands: `git push origin v0.33.0` (new tag) and
`git push origin stable` (`c94a3f79..5d6fb590`). The same SSH remote took `git push origin
main` without trouble minutes earlier.

## Outcome

Pending.
