[< Installer](README.md)

# Resume — where we stopped (session 2026-07-01)

> Read this first when resuming the Windows installer work. It captures the exact
> state, how to re-enter the journey, what was validated, and the next steps.
> (Written because the runtime chat history is not persisted; git + this file +
> the journey note in the DB are the durable record.)

## STATUS: Upstream PR opened

- **PR:** https://github.com/mirror-mind-ai/mirror/pull/26 — *Add a native Windows
  installer (.exe) for Mirror Mind + Pi* (author `rodrigoimmaginario`, base
  `mirror-mind-ai/mirror:main`, head `rodrigoimmaginario:feature/windows-installer`).
  State: OPEN. 26 files, +3204/-0.
- **CI on the fork is green** (`installer-scripts` + `build-installer` on
  `windows-latest`).
- **Installer version is decoupled** from the Mirror product version (bootstrapper;
  Mirror self-updates). Fixed at **0.30.0** in `installer/VERSION`; bump only on
  installer changes. Output: `dist/MirrorMind-Setup-0.30.0.exe`.
- **Open follow-ups:** real-machine (non-Sandbox) acceptance install; code-signing
  the `.exe` (SmartScreen); addressing any upstream review feedback (new commits
  pushed to `feature/windows-installer` update the PR automatically).

## How to re-enter the journey (Builder Mode)

The journey lives in the **development** database (not production):

```bash
cd /c/VSCode/mirror   # the Mirror Mind runtime repo
MEMORY_ENV=development \
  DB_PATH="C:\Users\rodri\.mirror\Rodrigo\memory_dev.db" \
  MEMORY_DIR="C:\Users\rodri\.mirror\Rodrigo" \
  uv run python -m memory build load mirror-windows --ignore-production-role
```

- Journey slug: **`mirror-windows`** (the user sometimes calls it "mirror-exe").
- Project path: **`C:\VSCode\mirror-windows`**, branch `feature/windows-installer`.
- Prior working reference (v1.3, standalone, passed in Sandbox):
  **`C:\VSCode\mirro-mind-ai-windows`** (branch `main`).

## What this project is

A native Windows `.exe` (Inno Setup) that installs Mirror Mind + Pi on a clean
machine: silently installs Git, Node.js LTS, uv, Pi; clones the Mirror **stable**
branch; configures identity; keeps self-updates working; Desktop shortcut. The
end goal is a PR to `mirror-mind-ai/mirror` from `rodrigoimmaginario`, **after**
the author installs the `.exe` himself on real Windows (hard gate).

## Current state — installer builds and nearly completes end-to-end

Latest build: `dist\MirrorMind-Setup-0.29.1.exe`
(SHA256 `17B977482C41776058EF402A16B3424DBFEFB1D0891BDF732318CDAD2183E15F`).
Build it with: `pwsh -File installer\build.ps1` (Inno Setup is installed at
`%LOCALAPPDATA%\Programs\Inno Setup 6`).

### Fixed and validated this session (Windows Sandbox, iterative)

Each fix was proven by a real Sandbox run getting one step further:

1. **Git download** failed with "connection closed unexpectedly". Root cause: the
   winget-absent fallback used a redirect URL + a single non-retried
   `Invoke-WebRequest`. Fix: `Invoke-MirrorDownload` (curl.exe → BITS → IWR, retry
   + backoff + size guard) and `Resolve-GitHubLatestAsset` (GitHub-API-resolved
   URL, the v1.3-proven technique). → Git/Node/uv now download via curl.exe. ✅
2. **Pi (npm)** failed with "%1 is not a valid Win32 application". Root cause:
   `Start-Process -FilePath 'npm'` runs the npm shim (not a PE). Fix: run npm via
   `cmd.exe /c`. Package name confirmed correct: `@earendil-works/pi-coding-agent`
   (`@earendil-works/coding-agent` is 404). ✅
3. **`memory init`** failed with "uv is not recognized". Root cause: the configure
   phase runs in a separate process that started before uv existed. Fix: moved
   `Update-SessionPath` into the module and call it at the start of
   `configure.ps1`. ✅ (validated locally; needs a Sandbox re-run to confirm)

### Review points implemented

- **Install from `stable` + preserve updates**: clone
  `--branch stable --single-branch --depth 1`; reinstall fast-forwards. The
  runtime updater's default channel is `stable`, so a `main` clone left it
  blocked. Pi stays current via npm.
- **Persistent log for analysis**: `{app}\logs\install-detail-<ts>.log` opened
  with an environment banner (no secrets).
- **Identity asked at the END**: `install.ps1 -Phase bootstrap|configure|all`;
  Inno runs bootstrap during install, then a final page explains why Mirror needs
  a name + OpenRouter key and collects them.
- **pt/en localization**: the final page + messages via `[CustomMessages]`
  (English + Brazilian Portuguese, no accents for encoding safety); Select-Language
  dialog at startup.
- **Wizard illustration**: `installer/assets/wizard-large.bmp` (Welcome/Finished)
  and `wizard-small.bmp` (interior top-right), generated from the repo hero image
  by `installer/assets/build-wizard-images.ps1`.

## NEXT STEPS (in order)

1. **Watch PR #26** for upstream review; address feedback with new commits on
   `feature/windows-installer` + push to the fork (updates the PR automatically).
2. **Real-machine acceptance:** install `dist/MirrorMind-Setup-0.30.0.exe` on a
   real (non-Sandbox) Windows machine end-to-end; confirm `/login` onboarding and
   that `memory runtime status` shows the `stable` channel NOT blocked:
   ```powershell
   cd "$env:LOCALAPPDATA\Programs\MirrorMind\app"
   uv run python -m memory runtime status
   ```
3. **Code-signing** the `.exe` (SmartScreen reputation) — packaging/publishing
   follow-up.
4. Optional polish: pt accents (save `.iss` as UTF-8 BOM); swap the wizard image
   to the before/after "mirror" cartoon if preferred.

### Already done this session (validated)

- Sandbox full flow completes: bootstrap → stable clone → `uv sync` → Pi →
  `memory init` → configure → Finished.
- Fixes: resilient downloads (Git via API), Pi npm via `cmd.exe`, `uv` PATH in the
  configure process.
- UX: identity asked at the END; visible pt/en switch; Mirror banner illustration;
  persistent env-banner log; first-run `/login` + subscription guidance.
- Installer version decoupled (0.30.0). CI green. PR #26 opened.

## Key files

- `installer/lib/MirrorInstall.psm1` — helpers: downloads, PATH refresh, env
  banner, friendly errors, dependency detection.
- `installer/bootstrap.ps1` — deps (Git/Node/uv/Pi) + clone/sync `stable`.
- `installer/configure.ps1` — `.env`, `memory init`, OpenRouter validation.
- `installer/install.ps1` — phase orchestrator (`-Phase`), logs, env banner.
- `installer/mirror.iss` — Inno wizard: flow, `[CustomMessages]`, images.
- `installer/tests/smoke.ps1` (28/28) + `MirrorInstall.Tests.ps1` (Pester 5).
- `docs/installer/analysis-two-routes.md`, `plan.md` — analysis + plan.

## Session commits (branch feature/windows-installer)

```
b8a4594 Installer: pt/en localized identity page + Mirror illustration in the wizard
a6e14c9 Fix 'uv not recognized' in configure phase: refresh PATH in its own process
37f8f8a Fix Pi npm install on Windows: run npm through cmd.exe
781bc9b Install from stable (updatable), persistent log, ask identity at the end
4772d5a Phase A: resilient downloads + API-resolved Git (fix Sandbox install failure)
daee792 Rebuild installer plan after history loss; root-cause the Sandbox download failure
```
