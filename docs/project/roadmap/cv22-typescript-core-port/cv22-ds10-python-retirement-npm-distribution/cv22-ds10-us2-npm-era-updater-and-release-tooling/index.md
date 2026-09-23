[< Parent](../index.md)

# CV22.DS10.US2 — npm-era updater and release tooling

**Status:** 🟡 Pulled 2026-09-23, Prepared; Plan is the next event, and it opens on six named
decisions rather than on implementation. The inventory below was taken at Pull, because
this journey has paid four times for trusting the authored gate's layer count
**Type:** User Story
**Depends on:** the [2026-09-07 ops-tail decision](../../../../decisions.md#cv22ds7ts1-ops-tail-runtime-splits-rehearsal-and-legacy-migration-retire-in-ds10),
which assigned the `runtime` update/release half here **to be redesigned under npm
distribution rather than ported at parity**, and left `release-promote`'s
product-versus-tooling placement as a DS10 design decision

---

## Outcome

Mirror updates itself without Python. The git-clone updater — status gate, backup, verify,
fast-forward, migrate, self-repair — is replaced by a TypeScript-owned mechanism built for
versioned installs and dist-tags, with operational smoke coverage it has never had. The
release chain (`release-doctor`, `release-promote`) is re-homed with its placement decided
rather than assumed. `mm-update` stops calling Python, `PYTHON_ALLOWLIST` goes empty, and
the skill parity check stops asserting *agreement* about the Python entry point and starts
asserting its *absence* — including for an installed user, not only inside a runtime clone.

## Story Statement

As a Mirror user who installed the product rather than cloning it,
I want updates and releases to run on the same single-language runtime the rest of Mirror
already uses,
so that the last Python callers in daily operation disappear and TS5 can delete the core
without breaking the one command whose job is to repair a broken install.

## What The Inventory Found

Run at Pull, because this journey has paid four times for taking the authored gate's layer
count as the inventory (TS1's `probe.py`, US1's `surfaces/` and `scene.py`, TS2 four
separate times, TS4's uncounted callers). The gate named four items. The inventory found
eight layers, two corrections, and one stale denominator.

### The gate names six subcommands. Four exist.

Python's `cmd_runtime` parser accepts exactly
`{status, version, diagnose, update, release-notes, release-doctor, release-promote, backup}`.

**`runtime pull` and `runtime stable` are not subcommands on either engine.** Both exit `2`
with argparse's `invalid choice`, verified on both. `pull` is the *action* the update
planner emits (`action: "pull"`); `stable` is the *channel*. The 2026-09-07 decision
transcribed both as subcommands — the identical error
[`runtimeRoute.ts:48`](../../../../../../ts/src/frontDoor/runtimeRoute.ts) already corrected
for `latest`/`pending`, in its own comment, and then reproduced two lines below in
`DS10_RUNTIME_SUBCOMMANDS`. `PYTHON_ALLOWLIST` carries them too. **Two of six allowlist
entries guard commands that have never existed**, and an empty allowlist is this story's
gate.

The real surface is **4 subcommands, 8 behaviors**: `update` (default, `--check`,
`--dry-run`, `--repair-updater`), `backup` (create+verify, `--verify PATH`),
`release-doctor`, `release-promote` (`--dry-run`, `--push`).

### Part of the "unported" half is already in TypeScript, graded, and unreachable

| Behavior | TypeScript state |
|---|---|
| `update --check` | **Fully ported** — `checkUpdateAvailability` + `renderRuntimeUpdateAvailability` (`ts/src/runtime/git.ts:258,431`), graded against Python by `runtime-git.golden.json`, **11 scenarios** |
| update plan | **Ported** — `inspectGitUpdatePlan` (`git.ts:337`) |
| `update --dry-run` | Not ported — `ts/src/runtime/status.ts:16` names the omission deliberately |
| update pipeline, stages, repair lane | Not ported |
| `release-doctor`, `release-promote` | Not ported |
| `runtime backup` verify + render | Not ported |

The front door refuses `runtime update` **wholesale**, so `runtime update --check` is
answered by Python although TypeScript answers it byte-identically today. Its only live
consumer is the welcome card. This is not waste to delete — it is the part of the redesign
that is already done and already graded, and the story should say so rather than rebuild it.

### `runtime backup` is not `backup`

DS7.TS1 ported plain `backup`. `runtime backup` is a different surface:
`verify_backup_archive` + `render_backup_verification` + `render_runtime_backup_created`
(62 lines, `runtime.py:1052-1113`), **none of which exist in TypeScript**. The update
pipeline's safety stage `_try_runtime_backup` depends on all three, so "the updater backs
up and verifies before it moves" cannot be rebuilt without them.

### Line budget

**~1,459 of `runtime.py`'s 2,954 lines** are the update/release half. The large bodies:
`run_runtime_update` (314), `run_runtime_update_repair` (139), `run_release_promotion`
(128), `check_runtime_update_availability` (98, ported), `build_release_doctor_report`
(93), `cmd_runtime` dispatch (172). **71 of 115 tests** in
`tests/unit/memory/cli/test_runtime.py` (2,478 lines) cover it.

### Callers the gate does not name

1. **`frame/main/command-registry.js`** — the Windows Electron frame spawns
   `uv run python -m memory` for **8 commands**: `identity list` (twice, warm-up and list),
   `runtime status`, `init`, `seed`, `runtime version`, `journeys`, `detect-persona`. It is
   JavaScript, so `check_skill_command_parity.py` (scans skill `.md` only) and
   `check_retired_surfaces.py` are both blind to it; `frame/tests/command-registry.test.js`
   pins the argv. **The Frame already refused to wire the updater**, and its recorded reason
   is this story's premise: *"`memory runtime update` atualizaria só o clone, deixando o
   executável instalado operando contra uma minor futura sem contrato de compatibilidade.
   Updates completos chegam por um novo installer."* The Frame is waiting for exactly the
   mechanism US2 builds.
2. **`installer/`** — 6 PowerShell files whose stated premise is that Mirror is a git clone
   *so that* `runtime update` fast-forwards in place without a reinstall
   (`bootstrap.ps1:11,23`, `mirror.iss:11`, `build.ps1:52`, `health-check.ps1:7`, plus
   `configure.ps1` and `lib/MirrorInstall.psm1`). The redesign invalidates the installer's
   reason for its own shape.
3. **TypeScript that instructs Python.** `ts/src/runtime/git.ts:453,456` prints
   `uv run python -m memory runtime update --dry-run` and `uv run python -m memory runtime
   update`; `ts/src/welcome/card.ts:311` prints `run runtime update`. The TS core tells
   users to run Python, and both strings are golden-pinned, as are Python's originals
   (`cli/welcome.py:268`, `tests/unit/memory/cli/test_welcome.py:316`).
4. **Installed-user extension skills.** `~/.mirror-minds/<user>/runtime/skills/pi/` carries
   **17 live `uv run python -m memory` invocations** — `ext-session-export` (7) and
   `ext-persona-export` (10), including `seed`. They sit outside the three copies the parity
   check scans, which is precisely gate item 3: *"verify the packaged plugin's invocation
   form resolves for an installed user, not only inside a runtime clone."*
5. `scripts/smoke_mirror_mcp.sh` drives `python -m memory mcp`.

Inside the three scanned skill copies the residue is clean and minimal: **`mm-update` only**,
one line each, all three consistent.

### The Zero Python Gate's own denominator is stale

The gate's table says `scripts/` = **5**. `git ls-files 'scripts/*.py'` = **6**. The missing
file is **`check_retired_surfaces.py`**, added 2026-09-21 by US1 — two days *after* the gate
was written — and it is the guard that mechanically enforces every retirement TS1–TS4
performed. It has **no disposition in any story**. Also unassigned:
`check_skill_command_parity.py` ("ported to Node") and `check_doc_links.py` ("ported") name
no owning story, while this story's gate requires changing the first one.

### No smoke covers the updater

Six smokes in `scripts/`; none touches update, backup-verify, doctor, or promote. The
candidate row demands operational smoke coverage, and the surface has never had any.

## Decisions This Story Must Take

Named here so Plan resolves them explicitly rather than inheriting them. None is decided by
this document.

- **D1 — `release-promote`'s placement.** Product command surface, or release tooling
  outside the shipped artifact? Named as open by the 2026-09-07 decision and by the
  candidate row. `release-doctor` inherits the answer.
- **D2 — version authority seam with US3.** `release-doctor` reads `pyproject.toml`; the
  Zero Python Gate moves version authority to `package.json` **in US3**. Either US2 reads
  pyproject and US3 moves it, or the seam is defined now.
- **D3 — what the read half reports after the mechanism changes.** An npm updater installs
  a version and follows a dist-tag; it does not fast-forward a clone. `clone_role`,
  `update_channel`, the `stable` branch and `inspect_git` stop meaning what they mean
  today — but `runtime status`/`version`/`diagnose` render them **from TypeScript already**
  (DS7.TS3), graded by goldens against the Python oracle. Changing the mechanism changes
  surfaces this story does not own.
- **D4 — `frame/` and `installer/` disposition.** Both are Python-calling layers outside
  every existing guard. Migrate, retire under a cutoff, or declare outside the migration as
  Mirror Desktop was. Whichever it is, it must be recorded, not assumed.
- **D5 — installed-user extension skills.** The 17 invocations in shipped extension skills
  break at TS5. TS2 already migrated three extensions to `mirror-cli-v1` and retired two
  under a cutoff; whether their *skill copies* are this story's, TS2's follow-up, or the
  `automation` repository's is undecided.
- **D6 — the guards' own language.** `check_skill_command_parity.py` must assert the Python
  entry point is absent; a guard that proves skills call no Python cannot itself be Python.
  Whether it ports to Node in US2 or TS5, and who owns `check_retired_surfaces.py`, needs an
  owner.

## Acceptance Behavior

```text
Given any runtime — Pi, Gemini CLI, Codex, Claude Code
When  a user asks Mirror to update itself
Then  the update runs entirely on TypeScript, with no `uv` or Python process spawned
And   the safety chain is preserved in substance: a gate before it moves, a verified
      backup, an explicit failure with a printed recovery route, and a self-repair lane
      for an updater too broken to run

Given scripts/check_skill_command_parity.py
Then  PYTHON_ALLOWLIST is empty, and the check asserts the Python entry point is
      ABSENT rather than merely agreed upon across copies
And   the assertion holds for the packaged plugin resolved as an installed user sees
      it, not only inside a runtime clone

Given `runtime pull` and `runtime stable`
Then  neither is carried into the TypeScript surface as a subcommand, because neither
      has ever existed — the same correction runtimeRoute.ts already made for
      `latest` and `pending`

Given the release chain
Then  release-doctor and release-promote have a decided home, a TypeScript owner, and
      process documentation that names the npm-era chain rather than the git-branch one

Given the new updater
Then  an operational smoke exercises it end to end against an isolated install,
      including the failure path and the recovery print — coverage the git updater
      never had
```

## Scope

Bounded at Plan. The inventory supports this shape:

- Replace the update/release half of `src/memory/cli/runtime.py` (~1,459 lines) with a
  TypeScript mechanism designed for versioned installs and dist-tags; reach the already-ported
  `--check` and plan code rather than rebuilding it.
- Port `runtime backup`'s verify + render surface (62 lines), which the update pipeline's
  safety stage requires and DS7.TS1 did not cover.
- Open the front door's `runtime` route to the redesigned subcommands, and correct
  `DS10_RUNTIME_SUBCOMMANDS` to the four that exist.
- `mm-update` in all three skill copies; `PYTHON_ALLOWLIST` emptied; the parity check's
  absence assertion, with the installed-user resolution path.
- The Python-instructing strings in `ts/src/runtime/git.ts` and `ts/src/welcome/card.ts`,
  and their goldens.
- An operational smoke for the updater.
- `REFERENCE.md` §Release and §Runtime, `docs/process/engineering-principles.md:565-582`,
  `docs/process/release-notes.md`, `docs/process/runtime-repair-policy.md`,
  `docs/process/versioning.md` — the release chain is documented as principle, not tooling.
- The DS10 parent's Skill Invocation Gate items, checked against evidence rather than claim.

## Out Of Scope

- **Deleting `src/memory/`** — TS5, separately Navigator-authorized. This story removes the
  update/release half's *callers* and gives it a successor; the module's deletion is not here.
- **Package rename, npm publication, dist-tag promotion, tag, GitHub Release** — US3 and its
  Navigator gates. US2 builds the mechanism; it does not publish anything.
- **`runtime status`, `version`, `diagnose`, `release-notes`** — the read half, ported by
  DS7.TS3. Touched only where D3 forces it.
- **Mirror Desktop** — outside the migration by the 2026-09-19 decision.
- Rewriting `frame/` or `installer/` beyond whatever D4 decides.

## Gate Items (from the [DS10 package](../index.md#skill-invocation-gate))

1. No skill copy in any runtime invokes `uv run python -m memory` — inside the three scanned
   copies this is `mm-update` alone; the installed-user layer is D5.
2. The parity check asserts the entry point is **absent**, not merely consistent.
3. The packaged plugin's invocation form resolves for an installed user, not only inside a
   runtime clone.
4. The `runtime` update/release path has a TS-owned npm-era replacement **with operational
   smoke coverage**.
5. `release-promote`'s product-versus-tooling placement is decided (D1).

## Validation

Navigator-visible route plus automated checks:

1. A real update is executed against an isolated install and observed to spawn no Python;
   the failure path and the recovery print are exercised, not described.
2. `scripts/check_skill_command_parity.py` (or its Node successor) passes with an empty
   allowlist and the absence assertion active, and fails when a Python invocation is
   reintroduced into any of the three copies.
3. The packaged plugin is resolved the way an installed user resolves it, and its
   invocations answer.
4. The pre-push set — the workflow's own list, not `npm test` plus `pytest`, which say
   nothing about it: the parity generators, write-parity probes, smokes, both suites, and
   the four checks. TS2 failed CI twice for skipping exactly this.
5. A Mirror session on Pi behaves identically.

## Where To Resume

Pulled and Prepared 2026-09-23. **Plan is the next event**, and it opens on six named
decisions (D1–D6) rather than on implementation. The inventory above is the story's own
record — read it rather than re-deriving it.

Two findings belong to the parent, not here, and are reported rather than repaired:

- **DS10's `index.md` Status header reads `3/8`** while its own candidate table shows TS3
  done 2026-09-22 and TS4 done 2026-09-23 — **5/8**. This is the third instance of the
  lesson TS4 paid for in US1's row: a story's Done record is not evidence. It would block
  DS10's closure preflight.
- **The Zero Python Gate's `scripts/` denominator is 5 and reality is 6**, with
  `check_retired_surfaces.py` — the guard enforcing every DS10 retirement so far — carrying
  no disposition in any story.
