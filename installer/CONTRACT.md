# What the Windows installer relies on

The installer is a bootstrapper: it puts a known-good `mirror-mind` on a
Windows machine and leaves. From then on the core updates itself
(`/mm-update` → `mirror runtime update`); the installer is never in the
core's path, and the core never waits for it. This file lists what the
installer reads from the core, so that a change on either side is a known
event rather than a surprise. It is extracted from `install.ps1` and the two
launchers; `tests/contract.ps1` asserts every line of it.

**Tested with:** `mirror-mind@0.33.4`, Pi 1.3.0, Node 24.22.0, Git 2.56.0.2.

## Commands the installer runs

| Command | Expects | Used for |
|---|---|---|
| `mirror runtime version` | exit 0; a line `Version: <semver>` | records the installed core version |
| `mirror init <key>` | exit 0; creates `~/.mirror-minds/<key>/`; first stdout line is a summary | the identity home. `<key>` is kebab-case (`[a-z0-9-]`, CR141); the installer derives it from what the person types |
| `mirror seed` | exit 0; last stdout line is a summary (`Result: N created, …`) | the twelve personas, the journey |
| `mirror runtime status` | exit 0; lines `Version:`, `Install:`, `Database exists:`, `Core migrations:` | the verify step; `mirror-status.cmd` |
| `mirror welcome` | exit 0 | warms the welcome card; proves the database opens |
| `mirror runtime diagnose` | exit 0 or 1 (findings) | `mirror-status.cmd` only; output not parsed |
| `pi install <dir>` | exit 0 | registers the package's `.pi/skills` and `.pi/extensions` with Pi |
| `pi --version` | exit 0 | the transcript |

Any other `mirror` subcommand is the user's, not the installer's.

## Files and variables the installer writes, the core reads

| What | Where | Format |
|---|---|---|
| Mirror config | `%USERPROFILE%\.config\mirror\env` | UTF-8, no BOM; `MIRROR_USER=<key>` and `OPENROUTER_API_KEY=sk-or-…`; other lines preserved |
| Node for hooks | user env `MIRROR_NODE` | `<app>\node\node.exe` — the repair route `runtime diagnose` names |
| OpenRouter key | user env `OPENROUTER_API_KEY` | also read back from `HKCU\Environment` by `mirror.cmd` for windows opened before the install |
| PATH | user env `Path` | `<app>\node` prepended (`mirror.cmd`, `pi.cmd`, `node.exe` live there) |
| Pi settings | `%USERPROFILE%\.pi\agent\settings.json` | UTF-8, no BOM; keys `defaultProvider` (`openrouter`), `defaultModel` (`~anthropic/claude-sonnet-latest`), `shellPath` (`<app>\git\bin\bash.exe`); other keys preserved |
| Workspace | `%USERPROFILE%\Mirror\` | the folder Pi opens in; Pi keys its sessions by it |

## Package layout the installer assumes

- `npm install -g mirror-mind` puts `mirror.cmd` and `mirror-hook.cmd` in the npm prefix (`<app>\node`) and the package at `<app>\node\node_modules\mirror-mind`.
- That package directory carries `.pi/skills/mm-*/SKILL.md` and `.pi/extensions/*.ts`, which `pi install <dir>` registers. (`package.json` `files` includes `.pi/extensions` and `.pi/skills`.)
- The core's runtime hooks and the Pi extension start Node by name or via `MIRROR_NODE`; `<app>\node` is on the user PATH and `MIRROR_NODE` points at it.

## Not relied on

- The text of any message, beyond the lines named above.
- The database schema, migrations, or file layout under `~/.mirror-minds/<key>/` (the core owns it; the installer only checks `Database exists: yes`).
- Any Python.

## When this changes

- **The core changes one of these** (a new `init` rule, a renamed status line, a moved config file): the daily canary (`.github/workflows/installer-canary.yml`, against `mirror-mind@latest`) turns red; the installer is fixed and a new `.exe` released. The core does not wait.
- **The installer needs something new from the core**: a separate, small PR against `ts/src`, through the core's own CI — never a change here that reaches into the core. See `README.md`, "the installer consumes the core".
