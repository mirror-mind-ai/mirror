[< Story](index.md)

# What US3 Inherits — CV22.DS10.US3

Written 2026-09-25 by CV22.DS10.TS5's
[handoff review](../cv22-ds10-ts5-python-core-deletion/handoff-review.md)
(finding P4). TS5 left each item below for this story on purpose. They were
scattered across TS5's index, plan, inventory, and `decisions.md`, which is
how this journey once lost a deferred finding: its revisit trigger fired
where nobody was reading. This list is where to read. It is its own file, not
a section of `index.md`. The reason once given here, that Plan materialization
could overwrite an authored story index, was already false: Plan writes each
package file only when it is absent
([CR079](../../../../refinement/rs001-ariad-runtime-trust/cr079-preserve-authored-content-in-every-lifecycle-artifact.md),
which closes CR004).

Items 1–12 are TS5's. Item 13 was added by CR008 on 2026-09-25, because it
changes the output of the instrument item 10 names.

| # | Item | What US3 decides or does | Recorded in |
|---|---|---|---|
| 1 | The docs' bridge to `mirror` | Delete the bridge paragraph in `REFERENCE.md` and `docs/getting-started.md` (the front-door invocation `mirror` stands for, and a shell alias) once the npm `bin` exists | TS5 [D14](../cv22-ds10-ts5-python-core-deletion/plan.md#taken-at-plateau-4-driver-2026-09-24) |
| 2 | The program's name | `PROGRAM` in `ts/src/util/program.ts` is the name every usage line and hint prints. Rename it with the `bin`; the seven goldens `ts/test/goldens/README.md` lists take the same edit again | TS5 D12 |
| 3 | The package's identity | The name constant in `ts/src/runtime/packageIdentity.ts`, and `name` and `private` in `ts/package.json` | TS5 D1 |
| 4 | Frame and installer | Nine interpreter call sites (`frame/main/command-registry.js`, the installer), and root detection by the deleted `pyproject.toml` (`frame/main/root-resolve.js`, `installer/health-check.ps1`, `install.ps1`, `launcher/mirror.cmd`). Their `python-core-mentions` exemptions expire with them | TS5 [known risks](../cv22-ds10-ts5-python-core-deletion/index.md#frame-and-installer-still-call-python-when-this-story-closes), D4, D11 |
| 5 | The installed-plugin hook window | Every hook wrapper (and the Codex hooks under `scripts/codex-hooks/`) finds Mirror from `$BASH_SOURCE`, which is correct only inside a checkout. `plugins/mirror-mind/mcp/launch.sh` also runs a bare `node`, with none of the wrappers' resolution | TS5 [known risks](../cv22-ds10-ts5-python-core-deletion/index.md#the-installed-plugin-hook-window-is-broken-by-design-between-ts5-and-us3) |
| 6 | Where configuration lives | The wrappers and the front door read `<checkout>/.env`, and an npm install has no checkout. With no `.env`, Node also prints a "not found, continuing" notice on every hook | TS5 handoff review (seen in the CI runtime smokes, N2) |
| 7 | F20's closing check | Once the production clone takes the CV22 release, `build load` against it must refuse. Until then the guard does not recognize a Python-era clone | TS5 [known risks](../cv22-ds10-ts5-python-core-deletion/index.md#the-clone-role-guard-does-not-recognize-a-production-clone-older-than-the-cv22-release), F20 |
| 8 | CR093's other half | The documented invocations in the extension repositories | [CR093](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr093-documented-invocations-name-a-python-entry-point-ts5-deletes.md) |
| 9 | D-026 and D-027 | The updater's pipeline implemented twice, once per install kind; nothing writes the package update-channel file | [US2 review](../cv22-ds10-us2-npm-era-updater-and-release-tooling/review.md), the debt ledger |
| 10 | `scripts/ts5/` | `generate_hook_wrappers.sh` is permanent product tooling under a story's name, cited in every wrapper's header. `capture_family_outputs.sh` is the only before/after instrument on a real database, which is what US3 needs to prove "no user-visible change" across packaging. Give both permanent names | TS5 handoff review |
| 11 | Promotion by rename on Windows | `openLiveWriteDatabase` promotes its snapshot with `renameSync`, which fails on Windows while any process holds the target open, and the write then aborts. Decide whether a failed promotion aborts the write or keeps the verified staging file. No CI job runs the core on Windows | TS5 handoff review, Q2 |
| 12 | The newer-database remedy | The core says "update this Mirror installation"; the troubleshooting guide adds "(in a clone, `git pull`)". Add the package route | TS5 handoff review, P5 |
| 13 | A deliberate output change before the "before" capture | `build inspect-method` with no argument no longer names a journey it was not given: it renders the no-journey card unless a named session is in Builder Mode. `scripts/ts5/capture_family_outputs.sh` captures exactly that command, so a before/after pair that straddles CR008 differs there by design. Take the "before" capture after CR008, or expect that one difference | [CR008](../../../../refinement/rs001-ariad-runtime-trust/cr008-bind-lifecycle-commands-to-active-journey.md), added 2026-09-25 |
