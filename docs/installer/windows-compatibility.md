# Windows Compatibility — findings & guarantees

Investigation output for the Windows installer project (plan.md Phase 4). This
tracks the concrete Windows-specific issues, their status, and how the installer
addresses each one.

---

## 1. UTF-8 / mojibake — HANDLED

- **Issue:** Portuguese accents can render as mojibake (`Ã©`) on Windows consoles
  and older stored data.
- **Guarantee:** the launcher forces code page 65001 and `PYTHONUTF8=1` /
  `PYTHONIOENCODING=utf-8`; the generated `.env` also sets `PYTHONUTF8=1`. The
  CLI already reconfigures stdout/stderr to UTF-8.
- **Legacy data:** `uv run python -m memory repair-encoding` (dry-run, then
  `--apply`) repairs previously stored mojibake, backup-gated.

## 2. Colon (`:`) in paths — HANDLED + GUARDED

- **Issue:** Claude skill command names use `mm:<name>` / `ext:<name>`, but `:`
  is illegal in Windows path components. A committed `mm:build` directory cannot
  even be checked out on Windows.
- **Guarantee:** on-disk skill directories use sanitized `mm-`/`ext-` names.
  `_filesystem_skill_dir_name` maps `:` (and other illegal chars) to `-`, and
  legacy `:` directories are cleaned up when present (a no-op on Windows, where
  they cannot exist).
- **Regression guard:** `tests/unit/memory/cli/test_windows_path_safety.py`
  asserts the sanitizer output is Windows-safe and that no committed directory
  under `.claude/skills`, `.pi/skills`, or `templates` contains an illegal char.

## 3. Long paths / MAX_PATH (260) — FINDING (mitigated, optional fix)

- **Issue:** Mirror can create deeply nested roadmap directories
  (`docs/project/roadmap/<cv>/<ds>/<ts>/...`). Combined with a long base path,
  these can exceed the legacy Windows `MAX_PATH` limit of 260 characters,
  producing `WinError 206: filename or extension is too long`.
- **Where it shows:** observed in the test suite when pytest's temp base path is
  long (e.g. `test_plan_artifact_path_prefers_existing_canonical_package`). Real
  users with deep roadmaps under a long home path could also hit it.
- **Impact on the PR:** upstream CI runs on `ubuntu-latest`, so this does not
  affect upstream CI. It is a Windows-local concern.
- **Mitigation:** `installer/enable-long-paths.ps1` enables
  `HKLM\...\FileSystem\LongPathsEnabled = 1`. It is **not** run automatically:
  it needs Administrator rights and is a machine-wide change (a "dangerous"
  system decision), so the user runs it deliberately if they hit the limit.
- **Recommendation:** keep repository clones under a short path (the installer's
  default `%LOCALAPPDATA%\Programs\MirrorMind\app` is short) and enable long
  paths on machines that use deep roadmaps.

## 4. Pi logger uses `uv run python` (not `python3`) — HANDLED upstream

- Already fixed in the tracked codebase: `.pi/extensions/mirror-logger.ts` uses
  `uv run python`, so the project venv is used regardless of PATH order.

## 5. Line endings — HANDLED

- `.gitattributes` keeps CRLF for Windows scripts (`.ps1`, `.cmd`, `.iss`) and
  LF for shell scripts, so scripts behave correctly on checkout.

---

## Update model (why it keeps working)

The install is a **git clone**, so `uv run python -m memory runtime update`
fast-forwards in place (backup → fetch → fast-forward → migrations → validate).
No reinstall of the `.exe` is needed to move to a new version. Pi updates via
`npm update -g @earendil-works/coding-agent`.
