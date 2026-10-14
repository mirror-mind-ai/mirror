[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR137 — The updater smoke's package lane fails on a machine that exports `MIRROR_USER`

## Problem

`scripts/smoke_runtime_update.sh` never clears `MIRROR_USER`, so it inherits the one
the machine exports. The Navigator's shell exports `MIRROR_USER=vinicius-dev`, because
the launcher sets the home per target.

Section 6, the package lane, runs its commands with `MIRROR_HOME` set to a scratch home
named `pkg-mirror-home`. `resolveMirrorHome` (`ts/src/frontDoor/dbPath.ts`) refuses a
`MIRROR_HOME` whose last segment is not the `MIRROR_USER` name: "MIRROR_HOME
(.../pkg-mirror-home) conflicts with MIRROR_USER (vinicius-dev)." So 24 of the
section's checks fail, and the smoke exits 1. Sections 1 to 5 pass on the same machine.
Why they escape the rule was not traced.

CI exports no `MIRROR_USER`, so CI passes and the failures show only on a maintainer's
machine.

## Expected Behavior

- The smoke gives the same result on any machine. Before it builds its scratch homes,
  it clears every variable that chooses a Mirror home, user, or database: the ones
  `DbPathEnv` names (`MEMORY_ENV`, `DB_PATH`, `MEMORY_PROD_DIR`, `MEMORY_DIR`,
  `MIRROR_HOME`, `MIRROR_USER`).
- Run with `MIRROR_USER` exported, the smoke passes as it does in CI.

## Impact

Low for the product, real for the route. On the Navigator's machine the smoke reports
26 failures where two were real (CR132's red phase), so a real failure hides among
false ones. CR132's validation route had to run the smoke with `env -u MIRROR_USER`.
Siblings: CR123 and CR128, smokes whose result depends on the machine they run on.

## Plan Or Decision

Captured, unassigned, 2026-10-14, from CR132's validation, at the Navigator's request.
Current Focus unchanged.

Selected 2026-10-14. The plan below was reviewed by a three-lens panel the same day
([record below](#panel-review-2026-10-14)), and its findings are folded in.
**Approved 2026-10-14 by the Navigator, with the panel's findings.** Driver
`@viniciusteles` and Delivery `main` were assigned in the same turn.

**The smoke reads the machine in two more ways than the capture names.** Tracing why
sections 1 to 5 escape found:

- **The clone lanes escape only through `--mirror-home`.** Every clone-lane command
  that needs a home passes it, and it takes precedence over `MIRROR_USER`, as sections
  1 to 5 passing with `MIRROR_USER` exported shows. The package lane's `run_pkg` sets
  only the `MIRROR_HOME` variable, so the inherited `MIRROR_USER` collides with it.
- **The clone lanes load the OS user's configuration file.** `run_cli` sets no `HOME`,
  so the front door fills unset variables from `~/.config/mirror/env`
  (`ts/src/runtime/config.ts`). On this machine that file holds `MIRROR_USER`,
  `MEMORY_RECEPTION`, and `OPENROUTER_API_KEY`. A scratch clone with no `.env` ran
  `runtime status` as `run_cli` runs it, but without `--mirror-home`, and reported
  "MIRROR_HOME (...) conflicts with MIRROR_USER (vinicius)". That is the file's user,
  the Navigator's production user, not the shell's. The conflict rule is all that
  keeps such a command off the production home. And the provider key, which the
  header says a smoke must never load, is in the clone lane's environment.
- **`smoke.env` is dead.** The smoke writes it and nothing reads it. It was made for
  the `--env-file` flag that CV22.DS10.US3's decision D3 retired.

So unsetting `MIRROR_USER` alone is not enough: the front door would fill it again
from the file.

### Objective

The updater smoke gives the same result on any machine. Its Mirror commands see only
the homes and configuration the smoke builds. No inherited variable that chooses a
home, user, or database reaches them, and neither does a configuration file of the
machine's OS user. The header's isolation claims become true.

### Design

**One clean slate.** Right after the real tools are captured, the smoke unsets every
variable that chooses a Mirror home, user, or database, plus `NODE_OPTIONS`. Those
are the ones `DbPathEnv` names: `MEMORY_ENV`, `DB_PATH`, `MEMORY_PROD_DIR`,
`MEMORY_DIR`, `MIRROR_HOME`, and `MIRROR_USER`. It is the list `smoke_npm_package.sh`
already unsets.

**The clone lane gets a scratch OS home, as the package lane has.** `run_cli` runs with
`HOME` set to a scratch directory and `XDG_CONFIG_HOME` unset, as `run_pkg` already
does with its own. The smoke's own tools, git and npm, keep the machine's `HOME`, as
today.

**A check that shows it, and guards the production home.** A new first step runs
`runtime status` in the clone lane without `--mirror-home`. It passes only if the status
names the smoke's scratch home and no conflict, so a `MIRROR_USER` from any source makes
it fail, whether inherited or loaded from a file. The production home is what this
protects. The provider key in the clone lane's environment is latent, since no command
the smoke runs calls a provider, but a configured user puts the production home one
omitted `MIRROR_HOME` away. A file is loaded whole or not at all, so a user that stays
out proves the key stays out too.

**The dead env file goes, and the header says what is true.** `smoke.env` is removed.
The header's isolation list names what does the job now:

- the repository's `.env` is not in the clone;
- the selecting variables are unset;
- the Mirror commands run with a scratch `HOME` and no `XDG_CONFIG_HOME`;
- the smoke's own tools, git and npm, run with the machine's `HOME` and read its
  configuration, `~/.npmrc` included.

**CI runs the smoke against a hostile environment.** The workflow step sets
`MIRROR_USER`, `MIRROR_HOME`, `MEMORY_DIR`, `DB_PATH`, and `MEMORY_ENV` in its `env:`,
pointing nowhere, so no other step inherits them. Its script plants a decoy `mirror/env`
that names a decoy user in two places: under an exported `XDG_CONFIG_HOME`, and at the
runner's own `$HOME/.config/mirror/env`, the path that leaked on the Navigator's
machine. A trap removes the second when the step ends. With both decoys present, the
smoke passes only if each lane unsets `XDG_CONFIG_HOME` and also runs with a scratch
`HOME`, so every push proves the isolation on both operating systems. The step's
comment, which still promises a scratch env file, is corrected.

### Files

- `scripts/smoke_runtime_update.sh`: the clean slate, `run_cli`'s scratch `HOME`, the
  new first step, `smoke.env` removed, and the header.
- `.github/workflows/tests.yml`: the updater smoke step's hostile environment, its two
  decoys, and its comment.
- `docs/project/refinement/rs010-cv22-oracle-and-port-hygiene/cr128-the-smokes-production-guard-checks-no-database-in-ci.md`:
  the other three smokes' exposure, by the Navigator's decision.
- This CR and its index row.

### Acceptance

- With `MIRROR_USER` exported, the smoke passes with no failures. Before the change,
  section 6 failed 24 checks.
- With every selecting variable exported to a place that does not exist, the smoke
  passes.
- On a machine whose `~/.config/mirror/env` names a user, the new first step passes:
  the clone lane resolves the scratch home. Before the change it reports the conflict.
- CI's updater smoke step runs with the hostile variables and both decoys, passes on
  both operating systems, and leaves no decoy behind. `actionlint` is clean.
- `bash -n` on the smoke, and the rest of CI, stay green.

### Validation Route

Navigator, in the development clone, from their normal shell, with `MIRROR_USER`
exported and `~/.config/mirror/env` in place, as they are now:

```bash
bash scripts/smoke_runtime_update.sh /tmp/cr137-smoke
MIRROR_HOME=/nonexistent MEMORY_DIR=/nonexistent DB_PATH=/nonexistent/memory.db MEMORY_ENV=development \
  bash scripts/smoke_runtime_update.sh /tmp/cr137-hostile
```

Pass: both runs end with `failed: 0`, and the new first step reports the scratch home.
Fail: any failure, in particular a home conflict.

### Non-Goals

- The product's rules. The `MIRROR_HOME`/`MIRROR_USER` conflict and the front door's
  configuration loading are right; the defect is in how the smoke runs.
- The other smokes. `smoke_codex.sh`, `smoke_external_review_copy.sh`, and
  `smoke_gemini_cli.sh` unset none of these variables, and whether they are exposed was
  not checked. `smoke_npm_package.sh`, `smoke_claude_plugin.sh`, and
  `smoke_mirror_mcp.sh` already unset them. CR123 and CR128 cover the smokes' other
  dependencies on the machine.
- The smoke's own tools. git and npm keep the machine's `HOME`, and the header says so.
- The other three smokes' exposure is CR128's, by the Navigator's decision.

### Panel review (2026-10-14)

The Navigator requested this review. The quality-assurance, devops-engineer, and
security-engineer lenses reviewed the Driver's draft. Each tested its claims against the
smoke, the workflow, the runtime's code, and the probes recorded under Evidence. Only
dissent was recorded.

Synthesis: the plan's mechanism is right. A scratch `HOME` and the unset variables
together remove both ways in. Its weak points were in what proves it and what it
claims:

- CI would have guarded a path other than the one that leaked;
- the header would still have overclaimed;
- the draft named the wrong asset.

The plan succeeds if no machine can change the smoke's result, and if CI keeps proving
it.

| Lens | Dissent | Resolution |
|---|---|---|
| quality-assurance | The draft's CI decoy sat under `XDG_CONFIG_HOME`, but the leak this CR found came through `$HOME/.config/mirror/env`, a path a CI runner never has. CI would have proven the half that did not happen here | The step plants a decoy on both paths. With both present, each lane must unset `XDG_CONFIG_HOME` and also run with a scratch `HOME`. A trap removes the `$HOME` decoy, though the step is its job's last today |
| devops-engineer | The corrected header would still overclaim: the smoke's own npm, in section 6, reads the machine's `~/.npmrc`. And the CI step's comment promises "a scratch env-file", the same dead claim in a second place. The hostile variables belong in the step's `env:`, which GitHub scopes to that step | The header names the smoke's own tools as the machine's. The comment is corrected. The variables go in `env:` |
| security-engineer | The draft framed the provider key as the exposure. It is latent: no command the smoke runs calls a provider (nothing under `ts/src/runtime/` does). The asset is the production home, which the file's user puts one omitted `MIRROR_HOME` away from any clone-lane command. The first step is its guard, not a convenience | The design names the production home as what the first step protects. A file is loaded whole or not at all, so the decoy user is the canary for the key too. No sentinel key is planted |

Not asked:

- the engineer: the change is shell and workflow, with no application code;
- the database-architect, ai-engineer, and prompt-engineer: the slice has no data,
  model, or prompt;
- the product and experience designers: nothing a person sees changes.

## Evidence

- 2026-10-14, CR132's red phase at `dcddb33e`, run with the shell's
  `MIRROR_USER=vinicius-dev`: `smoke exit=1`, 63 passed, 26 failed. Two failures were
  step 2b's, the defect CR132 fixes. The other 24 were section 6's, beginning with
  `status not ready` and `dry run capture: MIRROR_HOME
  (/tmp/cr132-smoke-red/pkg-mirror-home) conflicts with MIRROR_USER (vinicius-dev).`
- The same smoke at `3b16a510` with `env -u MIRROR_USER`, by the Driver and then by
  the Navigator: 89 passed, 0 failed.
- `grep -c MIRROR_USER scripts/smoke_runtime_update.sh`: 0.

At selection (2026-10-14):

- **The clone lane's configuration, observed.** A probe called `loadConfiguration`
  from a tree with no `.env`, with `MIRROR_USER`, `MEMORY_RECEPTION`, and
  `OPENROUTER_API_KEY` unset in the shell. It printed only the source paths and whether
  each variable was set:
  - with the real `HOME`: sources `environment | user_config
    /Users/vinicius/.config/mirror/env`, and all three set after loading;
  - with a scratch `HOME` and no `XDG_CONFIG_HOME`: source `environment`, and none set.
- **What a clone-lane command sees.** In a scratch clone with no `.env`, `runtime
  status` ran without `--mirror-home`, with `MIRROR_HOME` set and `MIRROR_USER` unset in
  the shell:
  - with the real `HOME`: "Mirror home: not configured" and "MIRROR_HOME
    (/tmp/cr137-sim/mirror-home) conflicts with MIRROR_USER (vinicius)";
  - with a scratch `HOME`: "Mirror home: /tmp/cr137-sim/mirror-home".
- **`smoke.env`** is written at line 73 and read nowhere.
- **The other smokes.** `smoke_npm_package.sh` exports a scratch `HOME` and unsets
  `MIRROR_HOME MIRROR_USER MEMORY_DIR DB_PATH MEMORY_ENV NODE_OPTIONS XDG_CONFIG_HOME`
  (lines 90 and 91). `smoke_claude_plugin.sh` (line 73) and `smoke_mirror_mcp.sh` (line
  38) unset the Mirror variables. `smoke_codex.sh`, `smoke_external_review_copy.sh`,
  and `smoke_gemini_cli.sh` do not.

## Outcome

Pending.
