[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR134 — `release-notes pending` reads the cwd's git repository, so it answers for whatever project the person is in

## Problem

`mirror runtime release-notes pending` lists the releases newer than the installed
version. The `mm-release-notes` skill uses it to answer "what's new in this update?",
which is the question the welcome card suggests when a new version is available.

The route builds it with `start: cwd` (`ts/src/frontDoor/runtimeRoute.ts`).
`buildPendingReleaseNotes` (`ts/src/runtime/releaseNotes.ts`) takes the git repository
that holds the cwd, runs `git fetch origin stable` in it, and reads
`origin/stable:docs/releases`. The branch beside it in the same route reads `latest` from
the running tree, "never from the cwd, which for a skill is the user's project". US3
plateau 1 (`422145c2`) moved that branch off the cwd and left `pending` on it.

So the answer depends on where the person happens to be, on every install kind:

- **Outside any git repository**, it says `Pending releases: none`, even when the channel
  holds a newer version.
- **Inside a Mirror Mind clone**, it reads that clone's `origin/stable`, which is right
  only by coincidence.
- **Inside any other git project**, it fetches `origin stable` from that project's remote,
  under the 120 s network timeout, and presents that project's `docs/releases` as
  Mirror's pending releases.

A package has no checkout at all, so there is no right answer for it today. The registry
knows which version the channel holds (`readDistTags` in
`ts/src/runtime/strategies/package.ts`, which `update --check` uses). The notes for that
version ship inside its tarball, though, not in the registry's metadata.

## Expected Behavior

- `pending` never reads the cwd's repository and never fetches into it.
- A clone reads the channel ref of its own checkout, the running tree, whatever the cwd.
- A package answers from a source it can reach without a checkout. This CR needs a
  decision on which: the channel's tarball from the registry, the published `stable`
  branch, or the pending version numbers without their notes.
- When no source answers, it says the check could not run, never `none`.
- Tests pin it from a cwd outside any repository and from a cwd in an unrelated
  repository that has its own `origin/stable` and `docs/releases`. Neither changes the
  answer.

## Impact

Medium: the update question gets a wrong answer in nearly every real session. A runtime
session runs in the person's project, not in a Mirror Mind clone. A package, the default
install since US3, has no checkout at all. The usual wrong answer is `none`. The rare one
is another project's notes presented as Mirror's. Each call also fetches from that
project's remote. The update itself is unaffected, and nothing is at risk.

## Plan Or Decision

Captured, unassigned, after the `v0.33.0` update of a Homebrew install (2026-10-14), beside
[CR133](cr133-release-notes-reads-the-git-repository-above-the-package.md). Current Focus
unchanged. The package source needs a decision before there is a plan.

## Evidence

All on the Homebrew package `mirror-mind@0.33.0`, where `v0.33.0` is newer than `0.32.1`:

```text
$ cd /tmp
$ mirror runtime release-notes pending --from 0.32.1 --no-fetch
Mirror runtime release notes

Current version: v0.32.1
Source: origin/stable
Pending releases: none

$ cd <a Mirror Mind clone>
$ mirror runtime release-notes pending --from 0.32.1 --no-fetch
Mirror runtime release notes

Current version: v0.32.1
Source: origin/stable
Pending releases: 1
```

A scratch git project whose `origin` has a `stable` branch holding
`docs/releases/v9.9.9.md`:

```text
$ cd <the scratch project>
$ mirror runtime release-notes pending
Mirror runtime release notes

Current version: v0.33.0
Source: origin/stable
Pending releases: 1

## v9.9.9 — Not Mirror
Highlights:
- A release of some other project.
```

A clone shows the same split. With a scratch `MIRROR_HOME`, the clone's own front door
(`node bin/mirror.js runtime release-notes pending --from 0.32.1 --no-fetch`) says `none`
from `/tmp` and `1` from the clone.

## Outcome

Pending.
