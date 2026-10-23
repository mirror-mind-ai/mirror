---
digest: >
  The first Windows installer for the terminal Mirror: one per-user .exe, no
  administrator password, that puts Node, Git Bash, Pi and mirror-mind on the
  machine, asks for a name and an OpenRouter key, and opens Mirror in Pi. Tested
  against mirror-mind 0.33.4 in two Windows Sandbox profiles, one of them under
  C:\Users\João Çãõ Silva. The installer is a bootstrapper: installed users
  update through `mirror runtime update`; the installer never gates a core
  release. The .exe is a GitHub Release asset, not a file in the repository or
  the npm package.
---

# Windows installer 2.0.0 — One File, Five Minutes

**Date:** 2026-10-17 · **Installs:** mirror-mind 0.33.4 · Pi 1.3.0 · Node 24.22.0 · Git 2.56.0.2

## Highlights

- **One `.exe`, per user, no UAC.** Welcome → Install → "Almost there" (a name
  and an OpenRouter key) → Finished, with "Open Mirror Mind" checked. Node,
  Git Bash (Pi's shell), Pi and mirror-mind land under
  `%LOCALAPPDATA%\Programs\MirrorMind`; the identity and the seeded personas
  under `~/.mirror-minds/<key>`; Pi opens in `~/Mirror`.
- **The name you type becomes the key the core wants.** "João Çãõ" → `joao-cao`,
  shown under the field before Next (mirror-mind 0.33.4, CR141).
- **One OpenRouter account for both chat and memory.** The key is validated
  once against the OpenRouter API, written to `~/.config/mirror/env` and to the
  user environment; Pi's default model is `~anthropic/claude-sonnet-latest`.
  OpenAI or Anthropic accounts can be added after the install through Pi.
- **Portuguese and English wizard.** `/LANG=pt` is the Brazilian Portuguese
  path, with accents intact.
- **Uninstall removes only the program.** `~/.mirror-minds`, `~/.config/mirror`,
  `~/.pi` and `~/Mirror` stay.

## Where We Started

The retired desktop frame installed a GUI nobody used; what people use is Pi
with the Mirror skills. The first spike in a clean Windows Sandbox showed the
only hard dependency: Pi's bash tool needs a `bash.exe`, so every `mm-*` skill
failed without Git Bash. The recipe from there was one Node zip (SHA-256
checked), one PortableGit (SHA-256 checked), `npm install -g`, `pi install`.

## What Changed Along the Way

Every bug the Sandbox found was in the installer, not in the core -- the core
handled `init`, `seed`, `pi install` and `runtime status` under an accented
path unchanged. In order: a `chcp` inside a `.cmd` made `cmd` re-read the file
and garble `João`; `npm prefix -g` read back in the OEM code page became a
broken PATH entry; `Set-Content` wrote ANSI where Pi reads UTF-8; a launcher
without `call` let npm's shim tear down its own `setlocal`, so Mirror opened in
`System32` without Node; the `[Run]` entry's `Check` was evaluated before the
identity page existed, so the Finished page never offered to open Mirror. Each
is a rule now in `installer/README.md`.

## Installing

1. Download `MirrorMind-Setup-2.0.0.exe` from this release. Check the SHA-256
   against `SHA256SUMS` if you like.
2. The `.exe` is not code-signed yet. On first downloads SmartScreen says
   "Windows protected your PC": click **More info → Run anyway**.
3. Install. At "Almost there", type your name and paste an OpenRouter key
   (`sk-or-…`; the button opens the page to create one; add credit, five
   dollars for example).
4. Finish with "Open Mirror Mind" checked. Ask it something.

A narrated walkthrough (2 min 37 s, Portuguese) is attached to this release
as `mirror-instalador-windows.mp4`.

## Updating

The installer does not update Mirror; Mirror does. `/mm-update` in Pi (or
`mirror runtime update`) brings the core forward through npm. A new installer
is released when the daily contract check (`installer/tests/contract.ps1`
against `mirror-mind@latest`) says a core change reached something the
installer reads; see `installer/TESTING.md`.

## Conscious Exclusions

- No code signing yet (Azure Trusted Signing is a later decision).
- No silent/enterprise install, no per-machine install, no ARM64 build.
- The installer always creates the Desktop shortcut (per-user, one Delete away).
- The wizard requires an OpenRouter key; other providers are configured in
  Pi after the install.

## What We Learned

The Sandbox's own user is `WDAGUtilityAccount`: ASCII, no space. Every
encoding bug above was invisible there and immediate under
`C:\Users\João Çãõ Silva`. The second profile is not optional.
