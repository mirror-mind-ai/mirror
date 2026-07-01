# Mirror Mind — Windows Installer (.exe) — Execution & Development Plan

> Native Windows installer that sets up Mirror Mind + Pi on a clean machine:
> silently installs every prerequisite, configures identity, keeps self-updates
> working, and drops a one-click Desktop shortcut.
>
> **Upstream intent:** at the end, open a Pull Request to `mirror-mind-ai/mirror`
> from the author's account (`rodrigoimmaginario`). **Before the PR, the author
> installs the generated `.exe` himself on a real Windows machine and confirms it
> works.** Work runs as autonomously as possible, stopping only for dangerous
> decisions (destructive git ops, force-push, publishing/signing, admin/credential
> network installs, and opening the PR).
>
> This plan was **rebuilt after the working chat history was lost**. It is grounded
> in the two-route comparison in [analysis-two-routes.md](analysis-two-routes.md).

---

## Where we actually are (current state, verified on disk)

- Route chosen: **upstream-native** installer at `C:\VSCode\mirror-windows`
  (branch `feature/windows-installer`), Inno Setup wizard around
  `installer/install.ps1` → `bootstrap.ps1` + `configure.ps1`.
- Most v1.3 hard-won fixes already ported (commit `c8358ff`): Pi package name,
  PS 5.1 native-command safety, `Update-SessionPath`, `--ignore-scripts`, TLS 1.2,
  clone rollback, `health-check.ps1`.
- **Blocker:** the `.exe` fails on each install attempt in **Windows Sandbox**
  because the **winget-absent fallback download** of Git is not resilient (redirect
  URL + single non-retried `Invoke-WebRequest` → "connection closed unexpectedly").
- **Both installers are tested first in the same Windows Sandbox.** v1.3
  (`C:\VSCode\mirro-mind-ai-windows`) **passes** there; the current route
  **fails** there. Same test bed → the difference is **code, not environment**.
  v1.3 downloads Git via a **GitHub-API-resolved** URL (proven green in the
  sandbox); the current route uses a redirect URL.

**Root cause:** the dependency **fallback download layer** is the whole failure,
and the fix is a **known-good technique** (v1.3's API-resolved download), not a
hypothesis. Everything else (wizard, phases, friendly errors, clone/sync, config)
is sound.

---

## Review decisions (implemented on top of Phase A)

Three review findings were implemented after the first Phase A fix:

1. **Latest Mirror + preserved updates (install from `stable`).** Mirror has no
   PyPI/binary release; its unit of distribution is the git repo and its updater
   is `git fetch` + fast-forward on the tracked branch. The default update
   channel is **`stable`** (`origin/stable`). The installer now clones
   `--branch stable --single-branch --depth 1` (a light, install-like footprint
   that still keeps `.git`), so `memory runtime update` fast-forwards in place
   without a reinstall. Reinstalling over an existing clone now fetches and
   **fast-forwards** to the latest stable (previously it only `fetch`ed and left
   the tree stale). Pi stays latest via `npm install -g` + `npm update -g`.
   Fixes the earlier bug where a `main` single-branch clone left the default
   `stable` update channel **blocked** ("update channel stable is not fetched").
2. **Persistent install log for future analysis.** A timestamped detail log is
   kept under `{app}\logs\install-detail-<ts>.log`, opened with an environment
   banner (OS/build, arch, PowerShell, winget/curl availability, chosen download
   order, pre-existing tool versions, install dir, repo/branch, MIRROR_USER).
   Secrets are never logged. Per-phase transcripts live beside it.
3. **Identity asked at the END, with a plain-language why.** The Inno wizard now
   runs prerequisites + clone first (no personal data), then a final page
   explains — in user terms grounded in Mirror's requirements — why it needs a
   name (local private identity/memory) and an OpenRouter key (embeddings,
   memory extraction, multi-model features; ≥ US$5 credit) before collecting
   them. `install.ps1` gained a `-Phase bootstrap|configure|all` split to support
   this.

## Guiding decisions

1. **Keep upstream-native.** Do not revert to the v1.3 fork. The PR target is
   upstream, so the installer must stay close to it.
2. **Harden the download/dependency layer** as the top priority, reusing v1.3's
   proven techniques and adding real network resilience.
3. **Make Windows Sandbox a first-class, repeatable clean-room test** so we stop
   guessing whether a failure is our bug or an environment flake.
4. **Every fix ships with a test** (unit/Pester where possible, plus a Sandbox
   smoke run) before moving on.

---

## Phase A — Harden the dependency download layer  ← START HERE

Target files: `installer/bootstrap.ps1`, `installer/lib/MirrorInstall.psm1`.

### A1. Port v1.3's API-resolved Git download (the proven fix) + resilient transport
The primary, sandbox-proven fix is **A2** (GitHub-API-resolved URL). A1 wraps it
in a resilient transport helper (`Invoke-MirrorDownload`) used by every download.
Order of attempts:
1. **`curl.exe`** (built into Windows 10 1803+): native TLS, redirects, resumable,
   robust on flaky links — `curl.exe -L --fail --retry 3 --retry-all-errors -o <dest> <url>`.
2. **BITS** (`Start-BitsTransfer`) as a second transport.
3. **`Invoke-WebRequest`** as last resort, with `TLS 1.2`/`1.3` set explicitly
   (not `-bor` onto legacy protocols) and `-UseBasicParsing`.
- Wrap all three in **retry with backoff** (e.g. 3 tries, 2s→4s→8s).
- Validate the downloaded file exists and is non-trivially sized before use.
- Log each attempt/transport to the detail log.

### A2. API-resolved Git URL (v1.3 technique)
Resolve Git's installer through `api.github.com/repos/git-for-windows/git/releases/latest`
→ pick the `Git-*-64-bit.exe` asset `browser_download_url`, then download via A1.
Keep the redirect URL only as a final fallback.

### A3. Node.js already API-resolved
`Install-Node` already resolves the LTS MSI from `nodejs.org/dist/index.json`;
route its download through A1 too.

### A4. Preflight connectivity check
Before installing deps, a quick reachability probe (github.com, nodejs.org,
astral.sh, registry.npmjs.org). On failure, emit a friendly `NO_INTERNET` error
early instead of failing mid-Git. (Good hygiene — not the root cause, since the
sandbox has working networking that v1.3 uses successfully.)

**Validation A:** Pester unit tests for `Invoke-MirrorDownload` (transport
selection, retry, size check) with mocked transports; `bootstrap.ps1 -DetectOnly`
green; full `smoke.ps1`.

---

## Phase B — Reliable Windows Sandbox clean-room test

Target: `installer/tests/` + a `.wsb` config.

### B1. Sandbox launcher (`installer/tests/sandbox/mirror-sandbox.wsb`)
A `.wsb` that maps the `dist\` folder (read-only) into the sandbox and, optionally,
auto-runs a logon command that launches the `.exe` or a headless
`bootstrap.ps1 -DetectOnly` and copies logs back to a mapped host folder.

### B2. Headless bootstrap smoke in Sandbox
A script that, inside the sandbox, runs `bootstrap.ps1` (deps + clone + uv sync)
and writes a pass/fail + log to the mapped folder — so a Sandbox run is
reproducible and its result is inspectable on the host.

### B3. Regression guard: current route must match v1.3 in the sandbox
Since v1.3 passes in the sandbox and the current route fails, the smoke run is a
direct A/B regression check: after Phase A, the current `bootstrap` must reach
parity with v1.3 in the **same** sandbox. Per-transport logging records which
transport/URL succeeded.

**Validation B:** two consecutive clean-Sandbox runs of `bootstrap` succeed
(Git → Node → uv → Pi → clone → uv sync), logs captured on the host — matching
v1.3's known-good result.

---

## Phase C — First-run configuration & launcher (confirm intact)

Target: `installer/configure.ps1`, `installer/launcher/mirror.cmd`, `mirror.iss`.

- Confirm `.env` (`MIRROR_USER`, `OPENROUTER_API_KEY`, `PYTHONUTF8=1`),
  `memory init <user>`, OpenRouter validation with friendly `OPENROUTER_INVALID`.
- Confirm UTF-8 launcher (code page 65001 + `PYTHONUTF8=1`) and Desktop shortcut.
- Re-verify after Phase A changes; no rework expected unless A touches config.

**Validation C:** post-install smoke — `runtime status`, one Pi turn with logging,
`runtime update --dry-run`.

---

## Phase D — Full-install acceptance in Sandbox (dress rehearsal)

Run the actual **`.exe`** end-to-end in a clean Sandbox: silent deps, config,
launcher, shortcut, one Pi session, update dry-run, and confirm every friendly
error renders (simulate no-internet, bad key). This is the automated rehearsal
**before** the author's own gate.

**Validation D:** `.exe` completes end-to-end in a clean Sandbox with logs
captured; friendly-error catalog exercised.

---

## Phase E — Author acceptance test  [HARD GATE]

The author builds/obtains the `.exe` and installs it **himself on a real Windows
machine** (ideally clean), following the install guide. Validates silent deps,
first-run config, launcher + Desktop shortcut, one working Pi session,
`runtime update` dry-run, friendly errors.

> The upstream PR is **not** opened until the author confirms the install worked
> for him.

---

## Phase F — Upstream PR  [DANGEROUS — explicit stop]

Only after Phase E. Open PR to `mirror-mind-ai/mirror` from the
`rodrigoimmaginario` fork. Any push to remotes and opening the PR are explicit
stop points.

---

## Immediate next actions (ordered)

1. **A1** — implement `Invoke-MirrorDownload` (curl→BITS→IWR + retry) in the module.
2. **A2** — switch Git fallback to API-resolved URL via A1.
3. **A3/A4** — route Node download through A1; add preflight connectivity check.
4. **Validation A** — Pester + `smoke.ps1` + `-DetectOnly` green.
5. **B1/B2** — add the `.wsb` clean-room and headless bootstrap smoke; run twice.
6. Rebuild `.exe`, then **Phase D** rehearsal, then hand off to **Phase E** gate.

---

## Dangerous decisions (explicit stop points)

- Any `git push`, force-push, branch deletion, or history rewrite.
- Opening the upstream Pull Request (only after the author's own install test).
- Skipping the author's acceptance install test (Phase E gate).
- Code signing / publishing artifacts.
- Network installs requiring admin elevation or credentials.
- Anything that mutates the user's existing production Mirror home.

## Risks

1. Non-admin install → prefer per-user installers.
2. SmartScreen/AV blocking unsigned `.exe` → signing or reputation (Phase F+).
3. `main` vs local divergence → align base branch before packaging.
4. Pre-installed old uv/Node → clear "use existing vs upgrade" policy (already in
   `Test-MirrorDependency` min-version logic).
5. Windows Sandbox is the shared test bed (v1.3 passes there) → not a variance
   risk; A1/A2 bring the current route to parity.
