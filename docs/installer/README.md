# Mirror Mind — Windows Installer

A native Windows `.exe` that installs Mirror Mind + Pi on a clean machine:
silently installs every prerequisite, configures your identity, keeps
self-updates working, and drops a one-click Desktop shortcut.

> Design and phases: [plan.md](plan.md).

---

## What it does

1. **Prerequisites (silent):** Git, Node.js LTS, uv, and Pi. Detects what is
   already present and installs only what is missing (winget first, direct
   download fallback).
2. **Mirror files:** a shallow `git clone` of the Mirror **`stable`** release
   branch into `%LOCALAPPDATA%\Programs\MirrorMind\app`, then `uv sync`. Cloning
   the `stable` branch (not a zip) is what installs the latest release AND keeps
   `runtime update` fast-forwarding in place without reinstalling.
3. **First-run config (asked at the END):** after prerequisites and the download
   succeed, a final page explains why Mirror needs a name and an OpenRouter key,
   then writes `.env` (`MIRROR_USER`, `OPENROUTER_API_KEY`, `PYTHONUTF8=1`), runs
   `memory init <user>`, and verifies the OpenRouter key.
4. **Desktop shortcut:** "Mirror Mind" → a UTF-8-safe launcher that starts Pi in
   the Mirror folder.

A timestamped install log is kept under `...\MirrorMind\logs\` (with an
environment banner, no secrets) for future analysis.

Installation runs through a **visible progress panel** (`install.ps1`): it shows
each step live and keeps the window open if anything fails, so errors are always
readable.

## Layout after install

```
%LOCALAPPDATA%\Programs\MirrorMind\
  bin\            launcher (mirror.cmd) + bootstrap/configure scripts + icon
  app\            the git clone of Mirror (this is where updates happen)
```

## Windows compatibility guarantees

- **UTF-8:** the launcher forces code page 65001 and `PYTHONUTF8=1`, so
  Portuguese accents render correctly. Legacy mojibake can be repaired with
  `uv run python -m memory repair-encoding`.
- **No `:` in paths:** skill directories use Windows-safe `mm-`/`ext-` names.
  A CI guard and unit tests ensure no `:` is introduced (the colon is illegal in
  Windows paths).

## Updating (no reinstall)

- **Mirror:** open Mirror and ask to update, or run
  `uv run python -m memory runtime update` in `...\MirrorMind\app`.
- **Pi:** `npm update -g @earendil-works/coding-agent`.

Because the install is a git clone, updates fast-forward in place — you never
reinstall the `.exe` to move to a new version.

---

## Building the installer

```powershell
# One-time: install the Inno Setup compiler
winget install --id JRSoftware.InnoSetup --exact

# Build (stamps the installer's own version from installer/VERSION;
# override URL/branch for testing)
pwsh -File installer\build.ps1
pwsh -File installer\build.ps1 -RepoUrl https://github.com/rodrigoimmaginario/mirror.git -RepoBranch feature/windows-installer
```

Output: `dist\MirrorMind-Setup-<version>.exe` (+ printed SHA256).

The installer is a **bootstrapper**, so its version is **decoupled** from the
Mirror product version: Mirror updates itself in place via the git-based runtime
updater. Bump `installer/VERSION` only when the installer itself changes.

## Testing

```powershell
# Fast, dependency-free (Windows PowerShell 5.1+)
pwsh -File installer\tests\smoke.ps1

# Full Pester 5 suite
Invoke-Pester -Path installer\tests\MirrorInstall.Tests.ps1

# Safe detection on any machine (no install, no clone)
pwsh -File installer\bootstrap.ps1 -DetectOnly
```

CI runs all of the above plus PSScriptAnalyzer and compiles the `.exe`
(`.github/workflows/windows-installer.yml`).

---

## Friendly error catalog

The installer never shows a raw stack trace. Every failure is rendered as
`code + message + likely cause + what to do`, and a full log is written to
`%TEMP%\mirror-install.log`.

| Code | When | What the user should do |
|---|---|---|
| `DEP_INSTALL_FAILED` | A prerequisite could not be installed | Check internet; install the named tool manually and re-run |
| `DEP_STILL_MISSING` | Tool not on PATH after install | Reopen the installer so PATH refreshes, or install manually |
| `PI_INSTALL_FAILED` | `npm install -g` for Pi failed | Confirm Node/npm and connectivity, then re-run |
| `REPO_SYNC_FAILED` | Clone or `uv sync` failed | Check connectivity and that the folder is writable |
| `OPENROUTER_INVALID` | OpenRouter key rejected | Verify the key and add ≥ $5 credits at openrouter.ai |
| `INIT_FAILED` | `memory init` failed | Re-run; share the log if it persists |
| `NO_INNO_SETUP` | Building without Inno Setup | `winget install --id JRSoftware.InnoSetup --exact` |
| `UNEXPECTED` | Any uncaught error | Re-run; share the log file with support |

---

## Acceptance gate (before upstream PR)

Per project agreement, the author performs a **real install of the generated
`.exe`** on a Windows machine and confirms it works before any Pull Request is
opened to `mirror-mind-ai/mirror`. See [plan.md](plan.md) Phase 8.5.
