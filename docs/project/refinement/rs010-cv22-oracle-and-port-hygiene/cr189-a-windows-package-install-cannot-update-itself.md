[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR189 — A Windows package install cannot update itself: the apply runs npm inside the directory npm must rename

## Problem

On Windows, a global npm install of `mirror-mind` could never update itself.
`mirror runtime update` failed at apply on every run, as reported on PR #46:

```text
[✓] plan: 0.33.4 -> 0.35.0
[✓] backup / verify backup
[✗] apply: npm error code EBUSY
    EBUSY: resource busy or locked, rename 'C:\…\node_modules\mirror-mind' -> 'C:\…\node_modules\.mirror-mind-4thljbuv'
Update result: failed
```

It failed safely: the backup was taken and verified, the recovery line was right, and
the installed version kept working. But the product's own update route never moved a
Windows package install forward.

npm renames the installed package's directory aside (`.mirror-mind-xxxx`) before it
lays down the new version, and Windows holds a process's current directory against
rename. The apply ran `npm install -g` with the install's root as its cwd: the package
directory itself, because CR135 sends every npm call there so that a project's `.npmrc`
cannot answer it. The author isolated the cause on Windows, with the same temp prefix,
0.33.4 to 0.35.0:

- npm with its cwd inside the package, and no Mirror process running: `EBUSY`;
- npm with its cwd outside the package, while a Mirror process held the package open
  (`mirror mcp` alive): the install succeeded.

The cwd, not open files. It was found by PR #45's installer contract test
(`installer/tests/contract.ps1 -ThenUpdateToLatest`) against a Windows per-user install.

## Expected Behavior

- A package's apply runs `npm install -g` from outside the directory it replaces, so
  npm's rename succeeds on Windows. Nothing changes on macOS or Linux.
- CR135 holds: no npm call runs in the person's project. The apply's directory stays in
  the install's own tree, and the dist-tags read stays in the install's root.
- A test pins the apply's directory, and the updater smoke checks it in sequence.
- The reference and the code comments say where each npm call runs.
- The release that carries the fix tells Windows package users the manual step: the
  updater they have fails at apply, so it cannot bring them the fix.

## Impact

Every Windows package install, every time: the in-product update route never succeeded
there. Safe, because nothing was lost and the old version kept working. There
is no Windows product (REFERENCE.md), but PR #45's per-user installer is the route that
puts package installs on Windows machines, and its contract test is what found this.

## Plan Or Decision

Captured 2026-10-30 from PR #46 (`rodrigoimmaginario:windows/update-apply-cwd`, opened
2026-10-19), which already carried the fix: `applyCwd(root)` in
`ts/src/runtime/strategies/package.ts` returns the parent of `node_modules`, and the
package strategy's apply runs `installGlobal` there. Assigned by the Navigator at
capture: Driver `@rodrigoimmaginario`, Delivery
[PR #46](https://github.com/mirror-mind-ai/mirror/pull/46). Current Focus unchanged
(RS010).

Reviewed through four lenses on 2026-10-30: engineer, quality assurance, DevOps
engineer, security engineer.

- **Engineer.** One function and one call site. Three comments in `package.ts`, and
  REFERENCE.md, still said every npm call runs in the install's root (taken, below).
  Left optional on the PR: `applyCwd` counts two levels up, which is the parent of
  `node_modules` only for an unscoped name (`mirror-mind` is unscoped), and the 4-of-4
  evidence is repeated in three places.
- **Quality assurance.** No automated check here reproduces the `EBUSY` path. The
  `windows-install-kind` job runs the unit pin on Windows but cannot observe npm's
  rename. The journey-level proof is the author's run and PR #45's contract test, which
  is not merged. Accepted as a known risk. The smoke pairs its npm shim's two logs line
  by line, which holds while the shim writes one line to each per call.
- **DevOps engineer.** In global mode npm takes its destination from `prefix`,
  `PREFIX`, or node's own location, never from the cwd, so a POSIX install lands where
  it did. A Windows install on 0.38.1 or older fails at apply with its own updater: the
  fix cannot deliver itself, and the release note carries the manual step.
- **Security engineer.** CR135 holds by construction. npm 11.20's `@npmcli/config`
  skips the project config in global mode (`(global mode enabled, ignored)`), so no
  directory's `.npmrc` answers `install -g`. `npm view` does read one, and it stays in
  the install's root. `applyCwd` derives from the detected install root, not from
  input. No findings.

The documentation drift went onto the PR branch as one maintainer commit, `ef7c5d6f`:
REFERENCE.md's `runtime update` section, the comments on `NpmCall`,
`PackageInstall.root`, and `packTarball`, and one each in
`ts/src/frontDoor/runtimeRoute.ts`, the smoke's npm shim, and the CR135 test.

### Release note draft

Written before v0.39.0 shipped the fix without a word about it (see Outcome): for a
dated addition to that release's note, or for the next release's. The Upgrading section
is the part that matters: the people this fix is for cannot take it the usual way.

> **A Windows package install can update itself** (CR189, PR #46 by
> @rodrigoimmaginario). npm renames the installed package's directory aside before it
> lays down the new version, and Windows refuses to rename a directory a process is
> running in. `runtime update` ran npm inside that directory, so on Windows its apply
> failed with `EBUSY` every time. It now runs npm from the parent of `node_modules`,
> still the install's own tree. Nothing changes on macOS or Linux. Verified by its
> author on Windows; there is still no Windows product.
>
> ## Upgrading
>
> On Windows, the version you have cannot install this one: its `runtime update` fails
> at apply. Once, by hand, from any directory other than the package's own:
>
> ```bash
> npm install -g mirror-mind@latest
> ```
>
> From then on `mirror runtime update` works. Everyone else updates as usual.

## Evidence

The review's runs, on a merge of the PR with `main` at `6ab5540b`, plus the doc commit:

```text
npm test                               3623 pass, 0 fail, 3 skipped
MEMORY_ENV=test npm test               3623 pass, 0 fail, 3 skipped
npm run typecheck                      clean
npm run lint                           1 warning, already on main (testTempHomes.test.ts)
checkRetiredSurfaces / checkPackContents / checkDocLinks / checkSkillCommandParity: clean
buildClaudePlugin.ts --check           in sync
bash scripts/smoke_runtime_update.sh   passed: 104   failed: 0
  ✓ every npm call ran in the install's own tree (15 calls)
  ✓ the apply ran from the parent of node_modules
```

With only the apply line reverted to `install.root`, the two tests that pin it fail, and
nothing else in `packageStrategy.test.ts` and `update.test.ts` does:

```text
✖ apply runs npm from the parent of node_modules, never inside the package it replaces
✖ a package update runs npm in the install's own tree, never the cwd (CR135); the apply from the parent of node_modules
```

- `@npmcli/config/lib/index.js`, `loadProjectConfig`, npm 11.20: in global mode the
  project config's source is `(global mode enabled, ignored)` and no project file is
  read.
- CI on the PR head `ef7c5d6f`: Tests (`ts` on ubuntu and macOS, `windows-install-kind`,
  `smoke`) and Docs (`link-check`) green. On `main` after the merge, `e2525228`: Tests
  and Docs green.
- Touched: `ts/src/runtime/strategies/package.ts`, `ts/test/runtime/packageStrategy.test.ts`,
  `ts/test/runtime/update.test.ts`, `scripts/smoke_runtime_update.sh`, and with
  `ef7c5d6f` `REFERENCE.md` and `ts/src/frontDoor/runtimeRoute.ts`.

## Outcome

**Merged 2026-10-30.** PR #46 merged to `main` as `e2525228` with its four commits,
the author's three and `ef7c5d6f`, after review and approval.

**Validated 2026-10-31.** The validation route is the author's run on Windows: a packed
`0.34.99` of the branch installed into a temp prefix, then `runtime update` printed
`[✓] apply: mirror-mind@0.35.0`, `Update result: success`, and
`Install: package (mirror-mind@0.35.0) | Status: ready`. The Navigator accepted that run
as the validation. No CI job here reproduces npm's rename on Windows; that stays a known
risk until the Windows installer's contract test runs somewhere repeatable.

**Shipped in v0.39.0** (2026-10-31, tag on `ca7295a4`), cut from `main` the day after the
merge. Its release note does not mention the fix, and its What Changed says "Existing
code changed only where the entry needed it." So the Windows manual step from the draft
above is not yet anywhere a person would read it.

**Done 2026-10-31.** The step is published as a dated addition to v0.39.0's note
([v0.39.0](../../../releases/v0.39.0.md): a highlight, a paragraph under What Changed, and an
Upgrading section) and to its GitHub Release. The note inside the published 0.39.0 tarball
cannot change, so `mirror runtime release-notes` from a package install shows the original.

Review: no debt action. Two notes stay with the author on PR #46, both optional: `applyCwd`
under a scoped name, and one place for the 4-of-4 evidence. The Windows CI gap stays the known
risk named above.
