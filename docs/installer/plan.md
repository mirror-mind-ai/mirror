# Mirror Mind — Windows Installer (.exe)

> Execution plan for a native Windows installer that sets up Mirror Mind + Pi on
> a clean Windows machine, silently installing every prerequisite, preserving
> Windows compatibility and self-updates, and exposing a one-click desktop
> shortcut.
>
> **Upstream intent:** at the end of the project, open a Pull Request to
> `mirror-mind-ai/mirror` from the author's GitHub account (`rodrigoimmaginario`).
> **Before the PR, the author performs a real acceptance test by installing the
> generated `.exe` himself on a Windows machine.** Work is executed as
> autonomously as possible, stopping only for dangerous decisions (destructive
> git ops, force-push, publishing/signing, network installs requiring credentials
> or admin elevation, and opening the PR).

---

## Technical baseline (from repo analysis)

- **Python core** (`memory` package, Python >=3.10) managed by **uv** (`uv sync`
  builds `.venv` and installs the package editable).
- **Pi** = recommended harness = `@earendil-works/coding-agent` (npm) → requires
  **Node.js**. `.pi/extensions/mirror-logger.ts` runs under Node and must call
  `uv run python` (not `python3`) to find the venv on Windows.
- **Updates are git-based**: `memory runtime update` does fetch + fast-forward on
  the tracked branch (`stable`/`main`), with backup, migrations and validation.
  ⟹ The installed product MUST be a git clone so updates keep working.
- **OpenRouter API key** + `MIRROR_USER` are required (`.env`), then
  `python -m memory init <user>`.
- **Windows compatibility** already in upstream main (v0.29.1):
  - Skill directories use Windows-safe `mm-` names (no `:` — illegal in Windows
    paths). Must be preserved.
  - CLI reconfigures stdout/stderr to UTF-8; `memory repair-encoding` repairs
    legacy mojibake. Launcher should force `PYTHONUTF8=1` / code page 65001.

**Silent dependencies to install:** Git, Node.js LTS, uv, Pi (npm global), the
repo clone, and `uv sync`.

---

## Phases

### Phase 0 — Project setup & baseline
- Create `mirror-windows` journey (done) with `project_path=C:\VSCode\mirror-windows`.
- Clone `mirror-mind-ai/mirror` (`main`) into `C:\VSCode\mirror-windows` (done).
- `uv sync` + run current test suite → establish a green baseline on Windows.

### Phase 1 — Installer specification (architecture decision)
- **Tech: Inno Setup** (native `.exe`, `/VERYSILENT` support, Pascal scripting to
  orchestrate downloads/detection, shortcuts, friendly messages). Alt: NSIS.
- Install model = `git clone` into a user-chosen dir (default
  `%LOCALAPPDATA%\MirrorMind`), keeping `.git` for updates.
- Dependency matrix with detection (installed? min version?) → install only what
  is missing.

### Requirement — Visible progress panel (real-time feedback)
- The installer must show a **visible progress panel** with what is happening at
  each step (never run fully hidden). `install.ps1` is a visible orchestrator
  that streams bootstrap + configure output live and **keeps the window open on
  error** so failures are readable (no silent "it flashed and said done").

### Phase 2 — Dependency bootstrapper (silent)
| Dependency | Silent strategy |
|---|---|
| Git | Git for Windows `/VERYSILENT /NORESTART` or `winget install Git.Git` |
| Node.js LTS | `msiexec /i node.msi /qn` or winget |
| uv | official PowerShell installer `irm https://astral.sh/uv/install.ps1 \| iex` |
| Pi | `npm install -g @earendil-works/coding-agent` |
| Mirror | `git clone` + `uv sync` |

Prefer winget when available, fallback to direct download. Ensure PATH updated
(session + persistent). Logs to `%TEMP%\mirror-install.log`.

### Phase 3 — First-run configuration (onboarding)
- Collect `MIRROR_USER` + `OPENROUTER_API_KEY` → write `.env`.
- Run `python -m memory init <user>` (identity seed).
- Validate OpenRouter with a friendly message on failure.

### Phase 4 — Windows compatibility guarantees
- UTF-8: launcher forces `PYTHONUTF8=1` and `chcp 65001`; run
  `repair-encoding --dry-run` post-install.
- Paths with `:`: test ensuring no `:` in generated skill/dir names.
- Investigate: path separators in `MEMORY_DIR`/`MIRROR_HOME`, junctions vs
  symlinks, long paths (>260), CRLF in generated files, permissions.
- Findings recorded in [windows-compatibility.md](windows-compatibility.md):
  UTF-8 and `:` are handled + guarded by tests; MAX_PATH/long-paths is a
  documented finding with an optional admin-gated fix
  (`installer/enable-long-paths.ps1`); line endings handled via `.gitattributes`.

### Phase 5 — Update preservation
- git-clone install keeps `memory runtime update` working natively.
- Pi self-update: `npm update -g @earendil-works/coding-agent` (+ optional
  launcher update check).
- Clone tracks a release branch; keep tree clean so fast-forward is not blocked.

### Phase 6 — Desktop shortcut + launcher
- Launcher (`mirror.cmd`/`mirror.ps1`): cd into install dir, set UTF-8/env, run `pi`.
- Installer creates a Desktop shortcut "Mirror Mind" (dedicated icon), opening in
  Windows Terminal when available.

### Phase 7 — Tests, coverage & friendly errors
- Install tests on clean Windows (CI `windows-latest`): fresh install, partial
  deps present, reinstall, uninstall.
- Post-install smoke: `runtime status`, seed, one Pi turn with logging, update
  dry-run.
- Friendly error catalog for each failure point (no internet, download fail, no
  admin, invalid OpenRouter, missing Node/uv, PATH) with cause + suggested action.

### Phase 8 — Packaging, signing & distribution
- Reproducible `.exe` build via Inno Setup in CI, versioned with Mirror.
- Optional code signing (SmartScreen); publish checksum.
- Deliver `MirrorMind-Setup-x.y.z.exe` + release notes + Windows install guide.

### Phase 8.5 — User acceptance test (author installs)  [GATE]
- The author builds/obtains the `.exe` and installs it himself on a real Windows
  machine (ideally a clean one), following the install guide.
- Validate: silent dependency install, first-run config, launcher + desktop
  shortcut, one working Pi session, `runtime update` dry-run, friendly errors.
- This is a **hard gate**: the upstream PR is not opened until the author
  confirms the install worked for him.

### Phase 9 — Upstream PR
- Only after Phase 8.5 acceptance is confirmed by the author.
- Open PR to `mirror-mind-ai/mirror` from `rodrigoimmaginario` fork.
- (DANGEROUS: opening the PR and any push to remotes are explicit stop points.)

---

## Risks
1. Non-admin install → prefer per-user installers.
2. SmartScreen/AV blocking unsigned `.exe` → signing or reputation.
3. Divergence between `main` and local fixes → align base branch before packaging.
4. Pre-installed old uv/Node → clear "use existing vs upgrade" policy.

## Dangerous decisions (explicit stop points)
- Any `git push`, force-push, branch deletion, or history rewrite.
- Opening the upstream Pull Request (only after the author's own install test).
- Skipping the author's acceptance install test (Phase 8.5 gate).
- Code signing / publishing artifacts.
- Network installs that require admin elevation or credentials.
- Anything that mutates the user's existing production Mirror home.
