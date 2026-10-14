[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR138 — `runtime status` and `runtime version` read a clone's repository and channel from the cwd, so a healthy clone is `attention needed` outside its checkout

## Problem

For a clone install, `runtime status` and `runtime version` inspect the repository that
holds the cwd, not the install. Both name the install correctly on their first line,
`Install: clone (<checkout>)`, from where the front door lives. Then they report the
repository, the git state, and the update channel of whatever directory the command was
run in (`buildRuntimeStatus({ start: cwd })` and `channelForStatus` in
`ts/src/runtime/status.ts`; `inspectGitFor` and `inspectUpdateChannel(start)` in the
`version` route of `ts/src/frontDoor/runtimeRoute.ts`).

So, from a directory outside any repository:

- `runtime status` reports `Repository: unknown` with a `Git status note: fatal: not a
  git repository`, and its verdict is `attention needed`, exit 1, because
  `statusVerdict` reads that git error. The same install is `ready` from its checkout.
- Both commands report `Update channel: stable` with `Update channel note: no
  repository`, while `runtime channel` reports the install's own `main` from its marker.

From another repository, they report that repository's branch, commit, dirt, and channel
marker as the install's.

`runtime update` does not have the problem. It inspects `install.repository` for a
clone, and `runtime channel` reads the install's marker. A package does not have it
either: it reports `Repository: none (package install)` and its channel file.

Found while planning [CR135](cr135-the-welcome-card-s-update-check-asks-the-cwd-s-repository.md),
its decision 4, which left these two commands out of that CR's scope.

## Expected Behavior

- For a clone, `runtime status` and `runtime version` report the install's own
  repository, git state, and channel, whatever the cwd. Their verdict from any
  directory is the verdict from the checkout.
- The channel row reads what `runtime channel` reports.
- Planning decides what `runtime version --start PATH` keeps. REFERENCE.md documents it
  as inspecting "a repository from a chosen path instead of the current working
  directory"; the install line already ignores it.

## Impact

Low to medium. REFERENCE.md's recommended update flow starts with `runtime status`, and
a clone user who runs it from a project is told `attention needed` about a healthy
install. The channel row contradicts `runtime channel` and the welcome card, which reads
the install since CR135. No skill runs either command directly, and `runtime update`
gates on the install's own status, so no update is refused or allowed wrongly. Nothing
is at risk.

## Plan Or Decision

Captured, unassigned, 2026-10-14, at CR135's implementation, as CR135's decision 4
asked. Current Focus unchanged.

## Evidence

This checkout's `mirror`, a clone install whose marker says `main`, on 2026-10-14:

```text
$ cd /tmp && mirror runtime status        # exit 1
Install: clone (/Users/vinicius/dev/workspace/mirror-dev)
Repository: unknown
Git branch: unknown
Git commit: unknown
Git dirty: unknown
Git status note: fatal: not a git repository (or any of the parent directories): .git
Update channel: stable
Update channel note: no repository
Status: attention needed

$ cd ~/dev/workspace/mirror-dev && mirror runtime status
Install: clone (/Users/vinicius/dev/workspace/mirror-dev)
Repository: /Users/vinicius/dev/workspace/mirror-dev
Update channel: main
Status: ready

$ cd /tmp && mirror runtime channel
Update channel: main
Source: /Users/vinicius/dev/workspace/mirror-dev/.mirror-update-channel
```

`runtime version` from `/tmp` prints the same `Repository: unknown`, `Update channel:
stable`, and `Update channel note: no repository` rows.

## Outcome

Pending.
