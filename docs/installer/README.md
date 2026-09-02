# Mirror Mind — Windows Installer

The native Windows `.exe` installs Mirror Mind, its Windows Desktop Frame, Pi,
and all prerequisites on a clean machine. The primary shortcut opens a guided
window for onboarding and conversation; a terminal shortcut remains available as
an independent recovery and maintenance route.

> Design history and phases: [plan.md](plan.md).
>
> Desktop architecture and release rules: [../../frame/README.md](../../frame/README.md).

---

## What it does

1. **Prerequisites:** detects Git, Node.js LTS, uv, and Pi; installs only what is
   missing, using winget first and a direct-download fallback where supported.
2. **Mirror runtime:** clones the Mirror `stable` branch into
   `%LOCALAPPDATA%\Programs\MirrorMind\app` and runs `uv sync`.
3. **Desktop Frame:** installs the packaged Electron/ConPTY application under
   `{app}\frame` and makes `Mirror Mind` the primary shortcut.
4. **Guided onboarding:** the Frame writes a validated UTF-8 `.env`, runs the
   real `memory init` and `seed` commands, and supports either OpenRouter or Pi's
   official subscription-login flow.
5. **Recovery:** installs `Mirror Mind (Terminal)` as a complete fallback that
   does not depend on the Frame UI.

Installation uses a visible progress panel and writes a timestamped log without
secrets under the Mirror installation logs directory.

## Layout after install

```text
%LOCALAPPDATA%\Programs\MirrorMind\
  app\            stable-channel Mirror git checkout
  bin\            bootstrap, launcher, Pi pin, and support scripts
  frame\          packaged MirrorFrame.exe and runtime payload
  logs\           installation diagnostics
```

The persistent identity home is separate from the executable payload and is
preserved across reinstallations. The Frame never silently chooses an identity
after reinstall; the user enters the intended name explicitly.

## Version and update model

- **Mirror and Frame:** share the Mirror release version. Complete Frame + Mirror
  updates arrive through a new installer.
- **Installer:** has an independent version in `installer/VERSION`, bumped only
  when the bootstrapper or installed experience changes.
- **Pi:** is pinned exactly in `installer/pi-version.txt`. Installation and the
  Frame's Pi updater converge to that homologated version and never use
  `@latest`.
- **Manual core maintenance:** remains available through the Terminal shortcut,
  but the first Frame release deliberately has no automatic Mirror-core updater.

All Frame PTYs participate in one session gate. Pi maintenance is rejected while
any Mirror, login, shell, or bootstrap PTY is open.

## Windows compatibility and security

- UTF-8 execution supports profile and identity paths containing accents and
  other non-ASCII characters.
- The renderer is sandboxed with context isolation and no Node integration.
- Main-process commands use fixed arguments and validate IPC senders.
- OpenRouter values reject embedded newlines; Pi owns its OAuth credentials.
- Unexpected navigation and new windows are denied.
- The terminal route remains available if the Frame cannot start.

The installer is currently **not code-signed**. Windows SmartScreen may warn
before execution; verify the SHA-256 published with the GitHub Release asset.

---

## Building the installer

```powershell
# One-time dependency
winget install --id JRSoftware.InnoSetup --exact

# Canonical build: Frame package → payload verification → Inno Setup
pwsh -File installer\build.ps1
```

Output:

```text
dist\MirrorMind-Setup-<installer-version>.exe
```

The build prints the artifact's SHA-256. Packaging fails closed if
`MirrorFrame.exe`, the ConPTY native binary, preload, renderer, or required
assets are missing.

## Validation

From `frame/`:

```powershell
npm ci
npm test
npm run sim
```

Installer checks:

```powershell
Invoke-Pester -Path installer\tests\MirrorInstall.Tests.ps1
pwsh -File installer\bootstrap.ps1 -DetectOnly
pwsh -File installer\build.ps1
pwsh -File frame\scripts\smoke-electron.ps1
```

GitHub Actions additionally runs PSScriptAnalyzer, exercises the packaged
Electron binary with a real ConPTY, executes the installer under a genuinely
non-ASCII `USERPROFILE`, and uploads the installer only after every gate passes.

## Release acceptance

Before publication:

1. merge the release-preparation commit and verify integrated CI on `main`;
2. promote that exact commit to `stable` and create the matching Mirror tag;
3. publish the GitHub Release from the canonical release note;
4. attach the installer built from the tagged/integrated commit and publish its
   SHA-256;
5. download that exact asset and complete a clean-Windows installation smoke.
