[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR135 — The welcome card's update check asks the cwd's repository, not the install, and the status line keeps a stale verdict

## Problem

The welcome card announces a new version ("✨ New Version Available", then "Ask: what's
new in this update?"), and the status line shows `⬆` while the cached verdict says so.
Neither asks about the install that is running.

When its cache is older than six hours, `composeWelcome` refreshes the verdict through
`checkUpdateAvailability(cwd, …)` (`ts/src/welcome/card.ts`, `ts/src/runtime/git.ts`).
That compares the HEAD of the repository holding the cwd with `stable` on that
repository's `origin`, by `git ls-remote`. The installed version is passed in and never
compared, and the registry is never asked. The channel comes from the same place:
`inspectUpdateChannel(cwd, null)` reads a marker in the cwd's repository, not the
package's channel file that `runtime channel` writes. Pi's session start runs all of this
in the person's project, since the extension spawns the front door with its own cwd.

So the verdict is about whatever repository the person is in:

- **Outside any repository, or in one whose `origin` has no `stable`**, the check is
  `unknown`. Nothing is shown and nothing is cached, so a package is never told of a new
  version.
- **In a project whose `origin` has a `stable` branch**, the verdict is about that
  project. A scratch project whose `origin/stable` is one commit ahead, tagged `v9.9.9`,
  made the card announce "New Version Available: v9.9.9" on the newest Mirror.
- **In a Mirror Mind clone**, the verdict is about the clone's HEAD, not the install.

The status line reads the cached verdict with no expiry (`ts/src/welcome/statusLine.ts`).
Only `up_to_date` and `update_available` are ever written, and a successful `runtime
update` does not touch the cache. So a verdict stays until some later check, from some
repository, writes another. On this machine the cache holds a verdict checked from a
clone at the `v0.32.0` tag on 2026-10-11: `update_available`, `v0.32.1`. The status line
still shows `⬆ v0.32.1` with `0.33.0` installed.

A clone install runs the same code, so it has the same problem whenever the session runs
outside the clone.

US2 deferred this explicitly: "Welcome-card update awareness for `package` installs. US3,
with the package." ([US2 plan](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-us2-npm-era-updater-and-release-tooling/plan.md#non-goals),
Non-Goals). US3's record does not mention it.

## Expected Behavior

- The check answers for the running install, never the cwd. A package compares its
  version with its channel's version on the registry, as `runtime update --check` does
  (`readDistTags`). A clone checks its own checkout, whatever the cwd.
- The channel the card shows and checks is the install's, from the source `runtime
  channel` reports.
- A verdict that no longer applies is not shown. An `update_available` for a version not
  newer than the installed one is dropped, and a successful `runtime update` rewrites the
  cache.
- The session start stays bounded, whatever source the check asks.
- Tests pin it from a cwd outside any repository and from an unrelated repository whose
  `origin` has a tagged `stable` branch. Neither changes the verdict.

## Impact

Medium. A package is the default install, and its card never announces a real update.
Instead, the card and the status line can announce one that does not exist, about
another project, and the status line keeps it across sessions and updates. The update
route itself is correct: `runtime update --check` and `runtime update` ask the registry.
Nothing is at risk. With [CR134](cr134-release-notes-pending-reads-the-cwd-s-git-repository.md)
open, the question the card suggests also gets a wrong answer.

## Plan Or Decision

Captured, unassigned, 2026-10-14, beside
[CR133](cr133-release-notes-reads-the-git-repository-above-the-package.md) and
[CR134](cr134-release-notes-pending-reads-the-cwd-s-git-repository.md). Current Focus
unchanged. The package half likely reuses the `update --check` route.

## Evidence

The real home, on the Homebrew package `mirror-mind@0.33.0`:

```text
$ mirror welcome --status-line
◇ <home> · Mirror Mind on ◌ Mirror Mode · ⬆ v0.32.1

$ cat <home>/runtime/update-check.json
{
  "availability": "update_available",
  "channel": "stable",
  "checked_at": "2026-10-11T20:42:04.955000+00:00",
  "current_commit": "78dd5836db36ded207616b8d8bc504ee58e4f530",
  "note": null,
  "remote_commit": "c94a3f794f65f4c0abc20ef46dbeb333a4fcb0cf",
  "title": null,
  "version": "v0.32.1"
}
```

In this repository, `78dd5836` is the `v0.32.0` tag and `c94a3f79` the `v0.32.1` tag.
The file was last written on 2026-10-11, before the update to `0.33.0` on 2026-10-14.

A scratch home, and a scratch project with HEAD at commit A and `origin/stable` at commit
B, tagged `v9.9.9`:

```text
$ cd <the scratch project>
$ mirror welcome --mirror-home <scratch home>
◇ Mirror · home
Version 0.33.0 · channel stable
0 journeys · 0 personas · 0 memories · 0 conversations · since today
✨ New Version Available: v9.9.9
Ask: "what's new in this update?" or "update my Mirror"

→ Where shall we begin?

$ cd /tmp && mirror welcome --status-line --mirror-home <scratch home>
◇ home · ⬆ v9.9.9
```

The cache it wrote held the scratch project's HEAD as `current_commit` and its
`origin/stable` as `remote_commit`.

A scratch home holding a copy of the real cache, from `/tmp`: the card shows no update
line and leaves the cache byte-identical, and the status line still shows `⬆ v0.32.1`.
An empty scratch home, from `/tmp`: no `update-check.json` is written.

With a scratch `XDG_CONFIG_HOME`, `runtime channel main` reports `Update channel: main`
from the package's file, and the card still prints `Version 0.33.0 · channel stable`.

## Outcome

Pending.
