[< Installer](README.md)

# Analysis — Two Installer Routes (why the current .exe fails, why v1.3 worked)

> Reconstructed after the working session's chat history was lost (the runtime
> screen closed and no conversation/memory was persisted to the dev database).
> This document re-establishes the shared knowledge from the two repositories on
> disk so it is never lost again.

## Repositories on disk

| Path | Role | Branch | State |
|---|---|---|---|
| `C:\VSCode\mirror-windows` | **Current route** — upstream-native installer (Inno Setup). The `.exe` that fails on each attempt. | `feature/windows-installer` | clean |
| `C:\VSCode\mirro-mind-ai-windows` | **Prior route v1.3** — standalone installer, debugged on a real Windows machine, worked. | `main` | clean |
| `C:\VSCode\mirror-exe` | empty scratch folder | — | ignore |

## The failure, decoded

The last acceptance attempt (`MirrorMind-Setup-0.29.1.exe`) ran inside **Windows
Sandbox** (user `WDAGUtilityAccount`) and stopped here:

```
[STEP]  BEGIN install Git
[INFO]  download Git from https://github.com/git-for-windows/git/releases/latest/download/Git-64-bit.exe
[ERROR] FAIL  install Git :: The request was aborted: The connection was closed unexpectedly.
```

Tracing the code path (`installer/bootstrap.ps1` + `installer/lib/MirrorInstall.psm1`):

1. Windows Sandbox has **no winget** → `Test-WingetAvailable` returns `$false`.
2. `Install-Dependency` therefore invokes the dependency **Fallback**.
3. Git's fallback is `Install-FromDownload` with the **redirect URL**
   `.../releases/latest/download/Git-64-bit.exe`.
4. `Invoke-WebRequest ... -ErrorAction Stop` throws *"The request was aborted:
   The connection was closed unexpectedly"* — a classic .NET `HttpWebRequest`
   TLS/connection drop. There is **no retry**, so a single transient failure
   aborts the whole install.

## Why v1.3 worked and the current route does not

| Aspect | v1.3 (`mirro-mind-ai-windows`) — worked | Current (`mirror-windows`) — fails |
|---|---|---|
| Git download (no winget) | GitHub **API** (`api.github.com/.../releases/latest`) resolves the asset `browser_download_url`, then downloads it | Hard-coded **redirect** URL `releases/latest/download/...` |
| Network resilience | Two-step: `Invoke-RestMethod` to the API, then download the asset | Single `Invoke-WebRequest`, **no retry**, no `curl.exe`/BITS fallback |
| Validation environment | **Windows Sandbox** — **passed** | **Windows Sandbox** — **fails** |
| Packaging | Monolithic `install.ps1` + `adapter/` + rollback + NSIS option | Inno Setup wizard + `bootstrap.ps1`/`configure.ps1` + friendly errors |
| Pi npm package | `@mariozechner/pi-coding-agent` (legacy) | `@earendil-works/pi-coding-agent` (correct) |
| Windows compat shim | `adapter/win_compat.py` via `PYTHONSTARTUP` | none — relies on upstream v0.29.1 compat |

### Already ported (commit `c8358ff`)

The current route already adopted most v1.3 fixes: correct Pi package name,
PS 5.1 native-command safety (`$ErrorActionPreference='Continue'` + explicit
`$LASTEXITCODE`/`-ErrorAction Stop`), `Update-SessionPath` (rebuild PATH +
well-known dirs), `npm install -g --ignore-scripts`, forced TLS 1.2, partial-clone
rollback, and a `health-check.ps1`.

### Intentionally NOT ported (correct decision)

`win_compat.py` / `PYTHONSTARTUP`: it only runs for **interactive** Python, never
for `python -m memory`, so it never actually protected the CLI. The real Windows
compatibility (UTF-8, `mm-` skill dirs without `:`) now lives in upstream
`main` (v0.29.1). Keeping the installer upstream-native is the right call for the
eventual PR.

### The real gap — it is a code difference, not the environment

**Both installers are tested first in the same Windows Sandbox.** v1.3 **passes**
there; the current route **fails** there. Because the test bed is identical, the
failure is a genuine **code difference in the download path**, not environment
variance or network flakiness.

The delta: v1.3 resolves Git through the **GitHub API** (`Invoke-RestMethod` to
`api.github.com/.../releases/latest`, then download the resolved asset URL), which
succeeds in the sandbox. The current route hits the **redirect** URL
`releases/latest/download/Git-64-bit.exe` with a single non-retried
`Invoke-WebRequest`, which drops the connection in the same sandbox. The port
(`c8358ff`) verified "bootstrap clone + uv sync ok" but did **not** carry over
v1.3's API-resolved download for the winget-absent path — the one path the
sandbox exercises.

## Root cause (one sentence)

> The current installer's winget-absent Git **fallback download** uses a redirect
> URL and a single non-retried `Invoke-WebRequest`, which fails in the Windows
> Sandbox — whereas v1.3's **GitHub-API-resolved** download succeeds in that same
> sandbox. The fix is a known-good technique, not a hypothesis.

## Decision

Keep the **upstream-native route** (`mirror-windows`, Inno Setup) — it is the one
we can PR upstream. Do **not** revert to the v1.3 fork. Instead, **port v1.3's proven download technique** (GitHub-API-resolved URLs) —
which is already green in the same Windows Sandbox — and reinforce it with
retry/backoff and a robust transport (`curl.exe` primary, BITS fallback) so the
winget-absent path is bulletproof.

See [plan.md](plan.md) for the rebuilt execution plan.
