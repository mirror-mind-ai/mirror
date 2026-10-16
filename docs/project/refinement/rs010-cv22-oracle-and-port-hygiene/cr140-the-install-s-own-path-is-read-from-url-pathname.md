[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR140 — The install's own path is read from `URL.pathname`, so a Mirror under a path with a space or an accent is `unknown`, and the updater refuses it

## Problem

Every route that asks "how is THIS Mirror installed" hands `detectInstallKind` the
front door's own path, and two of them computed it as
`new URL("…/cli.ts", import.meta.url).pathname` — `frontDoorSelfPath()` in
`ts/src/frontDoor/runtimeRoute.ts` and `buildRuntimeStatus` in `ts/src/runtime/status.ts`.
`URL.pathname` is not a filesystem path. It percent-encodes every character a URL
reserves or that is not ASCII, and on Windows it spells `C:\…` as `/C:/…`:

```text
/tmp/space only/…/cli.ts      ->  /tmp/space%20only/…/cli.ts
/Users/x/Código/…/cli.ts      ->  /Users/x/C%C3%B3digo/…/cli.ts
C:\VSCode\mirror\…\cli.ts     ->  /C:/VSCode/mirror/…/cli.ts   (resolve -> C:\C:\VSCode\…)
```

None of those paths exist, so `cloneRootFor` finds no `.git` above the front door and
`packageByLayout` no manifest, and the install reads as `unknown` with a reason that is
false: `not a git checkout, and not laid out as a global npm install`, for a checkout
whose branch the same command names a few lines down.

Three surfaces then fail together, for anyone whose home or project directory has a
space or a non-ASCII character — `My Projects`, `Código`, `Área de Trabalho`,
`C:\Users\John Doe` are ordinary names:

- `runtime status` prints `Install: unknown (…)`, and since CR138 the repository rows go
  blank with it.
- The welcome card skips the remote update check for an `unknown` install
  (`updateAwareness`, `ts/src/welcome/card.ts`), so the person is never told an update
  exists.
- `runtime update` refuses at the status gate: `install kind unknown: not a git
  checkout, and not under the global npm root`. The updater cannot ship its own fix
  to the people it affects.

Reported twice, independently: by @rodrigoimmaginario on Windows 11 (PR #42, where it
first looked Windows-specific), and by @lgarciasbr on macOS at 0.32.1 and 0.33.2 under
`~/Documents/Código/mirror`. Reproduced here on `main` with the checkout under
`/tmp/mirror main Código` and under `/tmp/space only`.

PR #42 fixes the path through one `thisFrontDoorPath()` using `fileURLToPath`, and
adds two Windows-only changes beside it: npm's Windows global layout
(`<prefix>\node_modules\<name>` plus a `<prefix>\<bin>.cmd` shim) in the layout detector,
and npm spawned as `node.exe …\npm-cli.js` with no shell. Its review found what the fix
still leaves open; that is this CR's scope.

## Expected Behavior

- An install is recognized under any path the filesystem accepts. The front door's own
  path never passes through URL form: `import.meta.dirname` is already the idiom in
  `ts/src/runtime/treeRoot.ts`, and it removes the class rather than converting out of
  it.
- A test pins the fix in CI: one that fails on `main` and passes with the fix, under a
  CI checkout whose own path is plain ASCII. PR #42's real-checkout test passes with or
  without the fix on CI's path, and its non-ASCII test calls `fileURLToPath` itself,
  never the production helper. Either the helper takes its module directory as a
  parameter and is fed one with a space, or a tracked-files guard (the shape of
  `ts/src/guards/retiredSurfaces.ts`) forbids `.pathname` as a filesystem path in
  `ts/src`.
- The `unknown` reason names the path it probed. `no .git above
  /Users/x/C%C3%B3digo/…` would have carried its own diagnosis in the first report;
  `not a git checkout` sent two contributors debugging on two platforms.
- The release that carries the fix tells affected people the manual route, since the
  product's own update route is the broken surface: `git pull --ff-only` in the
  checkout, or `npm install -g mirror-mind@latest` for a package under such a prefix.
- The Windows-only changes are either executed on Windows in CI — the smallest honest
  step is a `windows-latest` job running `ts/test/runtime/installKind.test.ts` and
  `ts/test/runtime/packageStrategy.test.ts`, the two files they touch — or recorded as
  accepted unverified, in the release note and here. REFERENCE.md says no Windows
  product is promised while nobody asks; PR #42 is someone asking, and the answer is a
  Navigator decision, not a merge side effect.

## Impact

Medium, and silent. Every surface involved degrades to a false-but-plausible answer
rather than an error, and the in-product update channel is off for exactly the people
who need the fix. The population is anyone with a space or accent anywhere above their
checkout or global npm prefix, which on Windows is most home directories and on macOS
and Linux is common in Portuguese- and Spanish-speaking homes. Two independent reports
arrived within a day of each other.

## Plan Or Decision

Captured, unassigned, 2026-10-16, from the review of PR #42
(`rodrigoimmaginario:windows/install-kind`, 2 commits, +256/−30, CI green on
`ubuntu-latest` and `macos-latest`). The PR carries the path fix and the two Windows
changes; the review's findings above are what remains after it merges, unless they are
taken into the PR itself.

Assigned by the Navigator the same day: Driver `@rodrigoimmaginario`, Delivery
[PR #42](https://github.com/mirror-mind-ai/mirror/pull/42), status `in_progress`. The
review posted on the PR (changes requested) asks for the CI pin and the space in the
fixture before merge, and for the Windows lane as a `windows-latest` job over the two
touched test files — the Navigator's answer to the lane question in Expected Behavior.
The probed path in the `unknown` reason and the release-note recovery route stay with
the project, not the PR. Current Focus unchanged (RS001).

**Landed on `main`, 2026-10-16:** the `unknown` reason ends with `; looked up from
<front door path>`, the path as the detector saw it, so a wrong spelling is wrong in
the report (`ts/src/runtime/installKind.ts`, pinned in `installKind.test.ts`;
REFERENCE.md's `runtime status` entry names the shape). The render is `Install:
unknown (<reason>; looked up from <path>)`; the reason nests no parentheses.

### Release note draft

For `docs/releases/<version>.md` of the release that carries PR #42; written here so
the release does not have to rediscover it. The Upgrading section is the part that
matters: the people this release is for cannot take it the usual way.

> **Mirror recognizes its own install under any path** (CR140, PR #42 by
> @rodrigoimmaginario, with the macOS reproduction by @lgarciasbr). The front door's
> own path was read from `URL.pathname`, which spells a space as `%20`, `Código` as
> `C%C3%B3digo`, and `C:\` as `/C:/`. Under such a path, a checkout or a package read as
> `Install: unknown`, the welcome card showed no update, and `runtime update` refused
> at its status gate with a reason that was not true. The path is now a filesystem
> path, and an `unknown` install names the path it looked up from.
>
> **Windows:** npm's Windows global layout is recognized, and npm runs with no shell,
> as `node.exe` running `npm-cli.js`. Both are verified by their author on Windows 11
> and executed on Windows in CI for the two test files they touch. There is still no
> Windows product; REFERENCE.md's line stands.
>
> ## Upgrading
>
> If your Mirror lives under a path with a space or a non-ASCII character, the version
> you have cannot update itself: `runtime update` refuses it. Once, by hand:
>
> ```bash
> # a clone: in the checkout
> git pull --ff-only
> # a package
> npm install -g mirror-mind@latest
> ```
>
> From then on `mirror runtime update` works as documented. Everyone else updates as
> usual. There is no database migration.

If the Windows CI job does not land with the PR, the Windows paragraph reads
"verified by their author on Windows 11; not CI-verified; not supported" instead.

Reviewed through four lenses on 2026-10-16 — engineer, quality assurance, DevOps
engineer, security engineer. Security raised no objection: the shell-less npm spawn
narrows the boundary CVE-2024-27980 is about, and a wrong `package` verdict on Windows
buys nothing beyond the `npm install -g` the person already ran. Two DevOps notes
beside the scope above: on Windows the PR runs the npm bundled beside `node.exe` while
`npm.cmd` prefers a user-upgraded one under `<prefix>\node_modules\npm`, acceptable if
stated; and when `npm-cli.js` is not beside the running node the failure is a
`Cannot find module` stack rather than "npm unavailable" — an existence check with a
named failure keeps the status line honest.

## Evidence

```text
$ node -e 'const {pathToFileURL}=require("url"); for (const p of ["/Users/x/My Projects/cli.ts","/Users/x/Código/cli.ts"]) console.log(pathToFileURL(p).pathname)'
/Users/x/My%20Projects/cli.ts
/Users/x/C%C3%B3digo/cli.ts

$ cd /tmp && MIRROR_HOME="$(mktemp -d)" node "/tmp/mirror main Código/bin/mirror.js" runtime status | grep ^Install
Install: unknown (not a git checkout, and not laid out as a global npm install)

$ cd /tmp && MIRROR_HOME="$(mktemp -d)" node "/tmp/mirror pr42 Código/bin/mirror.js" runtime status | grep ^Install
Install: clone (/private/tmp/mirror pr42 Código)

$ node --test ts/test/runtime/installKind.test.ts        # main, checkout under /tmp/mirror main Código
✖ the real front door in this checkout detects as a clone

$ mirror runtime update                                   # @lgarciasbr, macOS, 0.33.2, under ~/Documents/Código/mirror
[✗] status gate: install kind unknown: not a git checkout, and not under the global npm root
```

- `ts/src/frontDoor/runtimeRoute.ts` — `frontDoorSelfPath()` on `main`; `ts/src/runtime/status.ts` — the second copy.
- `ts/src/welcome/card.ts` — `updateAwareness` returns the cache and no check when `install.kind === "unknown"`.
- `ts/src/runtime/treeRoot.ts` — `import.meta.dirname`, the idiom that never enters URL form.
- CR083 — the same class one level up: path assumptions in the ported tree that no fixture exercises, because every fixture's path is plain ASCII and absolute.
- PR #42, its two commits `79b0dd36` and `88402ee4`, and @lgarciasbr's report on it.

## Outcome

**Validated 2026-10-16.** PR #42 merged to `main` as `5e08734b` with its six commits,
after a second round that took every review item:

- `thisFrontDoorPath()` joins from `import.meta.dirname`; no URL is formed. The guard
  row `url-pathname-as-path` in `ts/src/guards/retiredSurfaces.ts` sweeps `ts/src/` and
  `ts/scripts/` for the code shapes, and widening to `ts/scripts/` caught a second
  instance in `checkSkillCommandParity.ts`. Verified: with `.pathname` put back locally,
  the guard's live-tree test fails.
- The fixture is `mirror Código ação-`, a space and accents; the fragile `unknown`
  assertion is gone.
- `npmInvocation` answers a named absence when `npm-cli.js` is not beside the running
  node, reported as npm unavailable; its comment states the accepted difference from
  `npm.cmd`.
- `windows-install-kind` on `windows-latest` runs `installKind.test.ts` and
  `packageStrategy.test.ts`: green in 25s, with no Windows product promise attached.
- On `main`, the `unknown` reason names the probed path (`734d654e`).

Verified on a local merge under `/tmp/mirror merged Código`: 75 tests across the
touched suites, `runtime status` reads `Install: clone (…)`, typecheck and lint clean.

**Done** when [v0.33.3](../../../releases/v0.33.3.md) ships; its Upgrading section
carries the manual route drafted in Plan Or Decision. Carried forward from the review, not in
scope here: the `frame-installer` row's `absentSuffixes` (`.cmd`, `.ps1`) will meet the
installer series and is to be raised there; the guard's `identifier.pathname` pattern
would flag a legitimate `request.pathname` if `ts/src` grows HTTP routing, and the
row's `exemptions` field is for that day.
