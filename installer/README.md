# Mirror Mind — Windows installer

A single per-user `.exe` (no UAC) that gives a Windows user a working Mirror
in one pass: Node.js, Git Bash (Pi's shell), Pi, `mirror-mind`, an identity,
the seeded personas, OpenRouter as the one account for chat and memory, and a
Start Menu / Desktop shortcut that opens Pi inside the Mirror workspace.

## The rule: the installer consumes the core, it does not change it

Everything in this folder is Windows-only tooling — PowerShell, Inno Setup,
`.cmd` launchers, a Sandbox harness, icon assets. None of it runs on macOS or
Linux, and none of it ships in the npm package (`package.json` `files` is an
allowlist and `installer/` is not on it). A Mac or Linux user of `mirror-mind`
never receives or executes a byte of this folder.

So this folder may change freely without touching anyone else — **as long as it
stays on its side of the line**:

- The installer calls `mirror`, `pi` and `npm` the way any user would (`mirror
  init`, `mirror seed`, `pi install <pkg>`, `mirror runtime status`). It does
  not patch, wrap or reach into `ts/src`.
- When the installer *needs* something from the core — a flag, an output
  format, a behavior — that is a **separate, small PR against `ts/src`**, run
  through the same CI as every other change (`ubuntu-latest` + `macos-latest`),
  and labeled as a core change, not an installer change. PR #42 (install-kind
  detection) and PR #43 (Notepad default behind `platform === "win32"`, `init`
  refusing a leading `-`) are the pattern: platform-conditional where the
  behavior is platform-specific, platform-neutral bug fixes otherwise.
- Every bug the Sandbox found so far (code page in a `.cmd`, ANSI vs UTF-8 in
  files we write, `npm prefix` read back in the wrong encoding) was in this
  folder, not in the core. The core handled `mirror init "João Çãõ"`, `seed`,
  `pi install` and `runtime status` under an accented path unchanged. Keep
  that bar: fix the installer first; suspect the core last, and prove it with
  a reproduction outside the installer before proposing a core change.

A reviewer who sees a PR touching both `installer/` and `ts/src` should ask
for it to be split.

## Layout

| Path | What |
|---|---|
| `mirror.iss` | Inno Setup script: wizard pages, identity page (name + OpenRouter key, PT/EN), phases, uninstall |
| `install.ps1` | The work: `-Phase bootstrap` (Node, Git, Pi, mirror-mind) and `-Phase configure` (key, env, init, seed, `pi install`, Pi settings, workspace, verify) |
| `build.ps1` | Compiles the `.exe` (`-OutputSuffix -bN` when iterating, `-OutputDir` when `dist` is held open) |
| `launcher/` | `mirror.cmd` (opens Pi in `%USERPROFILE%\Mirror`) and `mirror-status.cmd` |
| `assets/` | `mirror.ico` (octahedron, rendered by `build-icon.ps1`), wizard bitmaps |
| `sandbox/` | Windows Sandbox harness: `MirrorSetup.wsb` (clean) and `MirrorSetup-PerfilPT.wsb` (simulated `C:\Users\João Çãõ Silva`, `/LANG=pt`); logs land in `.local\sandbox-out` as they are written |
| `spike/` | The first throwaway script that proved the recipe; kept for the record |
| `VERSION` | Installer version (independent of `mirror-mind`'s) |

## Rules learned the hard way (all Windows, all in this folder)

- **No `chcp` inside a `.cmd`.** A code page change mid-batch makes `cmd`
  re-read the file with the new one; accented paths turn to garbage. The
  wizard starts `powershell.exe` directly.
- **Only strings PowerShell produced itself are reused as paths.** PowerShell
  5.1 decodes native output (npm, pi, mirror) in the OEM code page; `npm
  prefix -g` came back as `Jo+ão`. The script knows its own paths; it does not
  ask the tools for them.
- **Every text file written for another program goes through `WriteUtf8`**
  (UTF-8, no BOM). `Set-Content` on 5.1 is ANSI; `-Encoding UTF8` adds a BOM
  that becomes part of the first key. Our own files are read back with
  `-Encoding UTF8` too.
- **Names with accents are names.** The identity page refuses only what
  Windows forbids in a folder name (`\ / : * ? " < > |`) and a leading `-`.
- **Test under the PT profile, not only the clean Sandbox.** The Sandbox's own
  user is `WDAGUtilityAccount`: ASCII, no space. Every encoding bug above was
  invisible there and immediate under `João Çãõ Silva`.

## Build and test

```powershell
installer\build.ps1                       # -> dist\MirrorMind-Setup-<VERSION>.exe
installer\assets\build-icon.ps1           # regenerate mirror.ico and the wizard image
```

Double-click `installer\sandbox\MirrorSetup-PerfilPT.wsb` (or the clean one).
The harness starts the setup, mirrors `install-detail-*.log` to
`.local\sandbox-out` line by line, writes `report.json` when the setup closes,
and offers to open Mirror from the same window. The end-to-end check is `listar
minhas personas` inside Pi: twelve names means Node, Git Bash, Pi, mirror, the
skill and the database all agree.
