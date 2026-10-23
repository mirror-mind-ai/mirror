# Testing the Windows installer

Three layers, from cheapest to most faithful. The core is never waiting on
any of them: they tell the installer when to follow a core release, not the
other way round.

| Layer | What | Where | When | Time |
|---|---|---|---|---|
| **Contract** | `tests/contract.ps1`: the commands `install.ps1` runs, against a core version, in a throwaway prefix and home; then `runtime update` to latest and the same checks again. Asserts [CONTRACT.md](CONTRACT.md) line by line. | host or `windows-latest` | every change under `installer/`; **daily against `mirror-mind@latest`** (the canary) | ~1 min |
| **Build check** | compile the `.exe`, open it once (InitializeWizard runs; nothing installs) | `windows-latest` | every change under `installer/` | ~2 min |
| **End to end** | Windows Sandbox: `sandbox/MirrorSetup.wsb` (clean) and `sandbox/MirrorSetup-PerfilPT.wsb` (profile `C:\Users\João Çãõ Silva`, `/LANG=pt`); wizard, Finished-page checkbox opens Mirror, `listar minhas personas` answers with twelve names | a Windows machine with the Sandbox feature; someone at the keyboard (or `video/record-frames.ps1`, which drives it unattended) | before an installer release; when the canary turns red | ~5 min each |

## What each layer catches

- Contract: a core release that changes `init`, `seed`, a `runtime status`
  line, the config file, the package layout. This is what v0.33.4 did (a user
  name became a key) between two Sandbox runs a night apart.
- Build check: a PascalScript error in the wizard ("Could not call proc"
  reached a tester once; it is a five-second check).
- Sandbox: everything the other two cannot see -- the wizard's pages, the
  code page of a `.cmd`, the PATH a window inherits, a launcher that forgets
  `call`, the `[Run]` entry Inno evaluates before the identity page exists.
  Every bug the Sandbox found so far was in this folder; see `README.md`.

## When the canary is red

1. Read the failing check; it names the CONTRACT.md line.
2. Fix the installer (or, if the installer needs something the core no longer
   offers, open a small PR against `ts/src` -- never a change here that reaches
   into the core).
3. `tests/contract.ps1 -MirrorVersion <new core>` green → both Sandbox
   profiles green → bump `MIRROR_VERSION` (and `VERSION`) → release.

## Releasing

1. `MIRROR_VERSION` = the core version both Sandbox profiles passed against.
2. `VERSION` bumped; `docs/releases/installer-v<VERSION>.md` written (core
   version, SHA-256 comes from the workflow, the SmartScreen note, the video).
3. Tag `installer/v<VERSION>`; `.github/workflows/installer-release.yml`
   builds, runs the contract, attaches the `.exe` and `SHA256SUMS` to a GitHub
   Release. The `.exe` is not in git and not in the npm package.

## Not here

- Core behavior: the core's own suite (`ubuntu-latest`, `macos-latest`).
- The video: `video/` is reproducible from the Sandbox frames and the
  roteiro; the `.mp4` is a release asset, not a test.
