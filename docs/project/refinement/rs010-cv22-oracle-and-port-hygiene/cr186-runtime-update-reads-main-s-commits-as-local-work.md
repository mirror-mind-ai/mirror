[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR186 — `runtime update` reads a clone's commits from `origin/main` as local work, and tells the person to push or reset

## Problem

A clone follows `origin/<channel>`: `origin/stable`, unless its `.mirror-update-channel`
marker says `main` (`ts/src/runtime/channel.ts`). The plan stage counts
`origin/stable..HEAD` and treats every commit there as the person's own. It refuses with
`plan: local commits present` and the recovery "Local branch is ahead of upstream; push or
reset before updating." (`plan` in `ts/src/runtime/strategies/clone.ts`;
`inspectGitUpdatePlan` in `ts/src/runtime/git.ts` classifies the same way). It never asks
where those commits came from.

Take a clone on `main` that was fast-forwarded to `origin/main` between releases. It is
ahead of `origin/stable` only by commits the remote already has. The refusal calls them
local, "push" means nothing for them, and "reset" names no target. Nothing says the state
ends on its own at the next release, which will contain those commits. Nothing says that
`runtime channel main` would follow the branch the clone is already on.

v0.33.3's release notes led people into this state. The one-time manual update they gave
for a clone under a non-ASCII path was `git pull --ff-only`, which on `main` pulls past
the release.

## Expected Behavior

- The plan stage separates commits that a remote branch already has from commits that are
  on no remote. A clone ahead of its channel only by `origin/main`'s commits is told so,
  with three ways out: wait for the next release, which contains them;
  `runtime channel main`; or a reset to `origin/stable`, given as a command. It is not
  told to push.
- Real local work keeps today's refusal and its push-or-reset advice.
- `runtime update` and `inspectGitUpdatePlan` classify the same way.

## Impact

Low. Nothing is lost: the plan stage refuses before the backup, and the working tree and
database are unchanged. But the person is told they have local work they do not have, and
the advice does not apply. It affects anyone who pulls `main` on a clone that follows
`stable`, which the v0.33.3 notes told people to do.

## Plan Or Decision

Captured, unassigned, 2026-10-29, from Leandro Garcia's report on PR #42, at the
Navigator's direction. The report suggests this distinction and naming
`runtime channel main` as an option. Planning decides whether a clone ahead of `stable`
only by `main`'s commits should be refused at all, or reported as current with a note.

The release-note instruction is corrected separately. The v0.33.3 notes now give
`git fetch origin` and `git merge --ff-only origin/stable`, the same fast-forward the
updater performs (`fetchUpstream` and the apply step in
`ts/src/runtime/strategies/clone.ts`).

## Evidence

- [Leandro's comment on PR #42](https://github.com/mirror-mind-ai/mirror/pull/42#issuecomment-6234421624),
  2026-10-17. Following the v0.33.3 instruction on `main` pulled two commits past the
  release (`1f830f8a`, `625fea87`), and the next `runtime update` refused with `plan: local
  commits present`. He reset to `origin/stable`. Both commits are in v0.34.0 and every
  later release, so the refusal would have ended at the next release.
- Reproduced on 2026-10-29 in this repository's checkout. It was on `main` at
  `origin/main` with no local commits (`## main...origin/main`) and three commits ahead of
  `origin/stable`. `mirror runtime update --channel stable --dry-run --no-fetch` printed
  `[✗] plan: local commits present` and "Local branch is ahead of upstream; push or reset
  before updating.", and exited 1.
- Where the instruction came from: CR140's release-note scope, and the v0.33.3 release
  comment on PR #42.

## Outcome

Pending: captured, not planned.
