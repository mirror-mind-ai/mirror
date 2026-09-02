# Mirror Frame (Windows)

The native Windows desktop experience for Mirror Mind: a single window where
the user onboards, converses with Mirror through **Pi** in tabbed real
terminal sessions (ConPTY), and manages setup. The Frame **orchestrates** the
existing runtime — every mutation goes through a fixed-argv command registry
that calls the official Mirror CLI; Pi flows (`/login`) are driven, never
reimplemented.

Credential handling, stated precisely: the OpenRouter key transits the
renderer and main process once, to be written into the local `.env` (password
field, no logging, cleared from transient state after persistence). Pi's OAuth
tokens never touch the Frame — Pi owns them in `~/.pi/agent/auth.json`; the
Frame only watches for key names to detect completion.

Exploration story: `docs/project/exploration/es-004-windows-desktop-frame.md`.

## Versioning

**The Frame is a private component distributed by Mirror and follows the
Mirror release version** (maintainer decision, PR #32 review). `package.json`
version always equals the Mirror version in `pyproject.toml`. The Frame has no
independent release line.

**Electron:** pinned to **42.8.0**. Per the official schedule
(https://releases.electronjs.org/schedule), the supported stable lines are 42,
43 and 44 (45 is still nightly); 42 reaches EOL on 20 Oct 2026. 42.x is chosen
as the most conservative supported line and re-validated on any bump with the
full regression (tests + simulator + package + Electron/ConPTY smoke).

## Controlled Pi version (never `@latest`)

The `/login` automation depends on observed surfaces of a specific Pi version
(readiness lines, the authentication-method menu, the paste-code fallback
prompt). The homologated version is pinned in **`installer/pi-version.txt`** —
the single versioned source:

- the installer ships it to `{app}\bin\pi-version.txt`;
- `installer/bootstrap.ps1` reads that sibling installed copy and installs
  exactly `@earendil-works/pi-coding-agent@<pin>`;
- the **packaged Frame** reads the same installed copy (exe-relative
  `..\bin`); the repo checkout file is a development-only fallback. The Frame
  never reads the clone primarily — `updateMirror` advances the clone
  independently of the installed Frame;
- a missing or malformed pin **disables** the Pi auto-update (with manual
  instructions) — `@latest` is structurally impossible in the registry.

If Pi surfaces change in a newer version, re-homologate: run the subscription
matrix (update, `/login`, OAuth completed, OAuth cancelled, manual fallback)
against the candidate, then bump `pi-version.txt` in one commit.

## Build, verification and CI (fail-closed)

One canonical chain, one validation pass:

```
npm ci → npm test → npm run sim
→ installer/build.ps1        # scripts/package.ps1 → scripts/verify-payload.ps1 (once) → ISCC
→ scripts/smoke-electron.ps1 # packaged self-test: real ConPTY under Electron's Node
→ (CI) artifact upload only after the smoke passes
```

- `scripts/package.ps1` — deterministic portable assembly (Electron dist +
  `resources/app` with runtime deps only). After `npm ci`, Electron 42's
  official installer materializes the exact pinned binary with checksum when
  `dist/` is absent; this is part of the canonical build, not a CI-only step.
  Produces; does not validate.
- `scripts/verify-payload.ps1` — the **single source of payload asserts**
  (exe, ConPTY native binary, preload, main, renderer, assets, xterm).
- `scripts/smoke-electron.ps1` — starts the packaged `MirrorFrame.exe` with
  `MIRROR_FRAME_SELFTEST=1`: the main process opens a real ConPTY, echoes a
  fixed marker and exits with a verifiable code. No window, no IPC, no
  external input — it proves node-pty's ABI under Electron's own Node in the
  packaged layout, the one defect class pure-Node tests cannot cover.
- The `.iss` Frame source is required: a missing payload aborts the build
  instead of shipping broken primary shortcuts.

## Security posture

`contextIsolation` + `sandbox: true` renderer, no `nodeIntegration`, narrow
preload API; every IPC handler validates the sender against the main window;
navigation and new windows are denied app-wide; `.env` writes pass a key
allowlist with per-key format rules and reject embedded CR/LF (injection);
session input/resize/close require a known SID; no `shell.openExternal` — Pi
opens the browser in the homologated OAuth flow, and the login terminal
("Ver detalhes") is the fallback where any URL can be seen and copied.

## Runtime rules

- Sessions are **never** gated on a Mirror warm-up: a Mirror failure must not
  prevent conversing in Pi. The Setup panel offers an explicit, optional,
  non-blocking diagnostic instead.
- The Pi update only runs with **zero open Frame ptys** — Mirror sessions,
  the hidden `/login` pty, system terminals and bootstrap all count — and
  never concurrently; enforced in the main process (renderer buttons merely
  reflect the gate).
- **No automatic Mirror core update in the first release** (maintainer
  decision): the Frame follows the Mirror version, and `memory runtime
  update` would advance only the clone, leaving the installed executable
  running against a future minor with no compatibility contract. Full
  Frame+Mirror updates arrive through a new installer; conscious manual
  maintenance stays available through the Terminal shortcut.
- The terminal route (`Mirror Mind (Terminal)` → `mirror.cmd`) remains a
  full recovery path independent of the Frame.
