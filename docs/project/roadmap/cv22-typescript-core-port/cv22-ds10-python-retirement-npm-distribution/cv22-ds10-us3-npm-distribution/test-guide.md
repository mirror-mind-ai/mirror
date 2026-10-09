[< Story](index.md)

# Test Guide — CV22.DS10.US3

Written at the Plan checkpoint, 2026-09-30; routes 1 and 2 rewritten at plateau 2
(2026-10-05) to what the tree does now. Commands name the files and verbs the
[plan](plan.md) introduces; each plateau updates this guide when a name settles.

## Automated Validation

From the repository root, after plateau 1 moves the manifest there (before it, from
`ts/`):

```bash
npm ci
npm run typecheck
npm run lint
npm test
git diff --check

# The repository checks. Stage new files first: the retired-surface sweep reads the index.
node ts/scripts/checkRetiredSurfaces.ts
node ts/scripts/checkDocLinks.ts
node ts/scripts/checkSkillCommandParity.ts      # now also: no checkout invocation in any skill copy
node ts/scripts/buildClaudePlugin.ts --check
node ts/scripts/checkPackContents.ts            # new: the tarball holds the runtime subset and nothing else; no shipped file names the author (F4)
bash scripts/generate_hook_wrappers.sh --check  # renamed from scripts/ts5/ (item 10)

# Custody proofs and the end-to-end smokes, unchanged.
node ts/smoke/migration_structural_parity.ts
node ts/smoke/bootstrap_custody_parity.ts
node --no-warnings ts/smoke/generate_demo_memory_db.ts --out tmp/smoke/demo-memory.db
MEMORY_ENV=test node --no-warnings ts/smoke/migrate_on_open_smoke.ts --source-db tmp/smoke/demo-memory.db
node --no-warnings ts/smoke/conversation_lifecycle_smoke.ts
node --no-warnings ts/smoke/builder_lifecycle_smoke.ts
MEMORY_ENV=test node --no-warnings ts/smoke/extension_catalog_smoke.ts

# The operational smokes.
bash scripts/smoke_runtime_update.sh            # plateau 4: the clone line both ways; section 6 is the package lane end to end, registry shadowed
bash scripts/smoke_npm_package.sh               # new: pack → scratch install → init/seed/status → migrating open → runtime smokes
for smoke in smoke_codex smoke_gemini_cli smoke_claude_plugin smoke_mirror_mcp; do
  bash "scripts/$smoke.sh" || break             # smoke_claude_plugin runs the plugin's hooks through mirror-hook on a scratch PATH
done
```

Expected: every command exits 0; `smoke_runtime_update.sh` prints `passed: 86 failed: 0`
(plateau 4: sections 3 and 3b grade the `npm link` line with and without a `mirror` on the
PATH; section 6 installs a tarball into a scratch prefix and, through an `npm` shim that
answers `root -g`, `view … dist-tags`, and `install -g <name>@<version>` from the smoke's own
files, runs status, channel, `--check`, dry run, the real update through migrate and
validate in fresh processes, and the refused downgrade — recording every npm call, so a
`publish` or anything unscripted fails it); `smoke_npm_package.sh` prints `passed: 68
failed: 0` (plateau 4 asserts `Install: package (mirror-mind@<version>)`, its `Install root:`,
and `Repository: none (package install)` with npm off the PATH; since plateau 3 the four
runtimes run against the installed wrappers and `mirror mcp`, sections 8–12), twelve seeded personas, a migrating open that
applies `017` from the package location, and `no python, python3, or uv process was spawned`.
`seed` inside it exits 1 by **F1** (the empty `ego/constraints` template), named in the smoke. CI runs the same set twice, the
second time with `python`, `python3`, and `uv` shadowed.

### New unit coverage (plateau by plateau)

| Plateau | Test | Pins |
|---|---|---|
| 1 | `ts/test/runtime/config.test.ts` | precedence: environment > `<clone>/.env` > `~/.config/mirror/env`; a package install never reads a `.env`; the warning filter passes non-experimental warnings through |
| 1 | `ts/test/runtime/treeRoot.test.ts` | `init`, `releaseNotes`, and the welcome card read from the tree holding the front door, never the cwd |
| 1 | `ts/test/runtime/installKind.test.ts` | a linked clone (`npm link`) is `clone`; a copy under `npm root -g` is `package` |
| 1 | `ts/test/scripts/packContents.test.ts` | the whitelist; the forbidden list; no lifecycle scripts |
| 1 | `ts/test/init/init.test.ts` | `init` writes `MIRROR_USER` only when no source resolved a user; `0600`/`0700`; never a key from argv |
| 2 | `ts/scripts/checkSkillCommandParity.ts` self-test | a seeded `ts/src/frontDoor/cli.ts` line in any copy fails with the path and line |
| 3 | `ts/test/hooks/hooks.test.ts` | the two wrapper forms share everything but how the entry is found; both run the bin and pass no flag; the launcher searches where the wrappers do; `SessionStart` hands Claude Code and Gemini CLI the Operating Instructions unless the project is this tree (D13) |
| 3 | `ts/test/hooks/hookBin.test.ts` | `mirror-hook` on the shared loader shim; the hook entry reads the user's config file itself, from a tree with no `.env`; the plugin's wrappers copied out of the tree find `mirror-hook` on the `PATH` or through `MIRROR_BIN`, and with nothing anywhere exit 0 with one `hooks.log` line; the launcher copied out of the tree starts the server, or says why not on stderr |
| 3 | `ts/test/runtime/wiring.test.ts`, `initCli.test.ts` | the per-runtime steps and their honest counts (1 / 1 / 2 / 2); `init` prints them for the runtimes on the `PATH` and only those |
| 3 | `ts/test/mcp/launcher.test.ts` | a `.env` beside the plugin is NOT read (the launcher has no tree); the environment still reaches the server |
| 4 | `ts/test/runtime/update.test.ts` | the 15 US2 pipeline tests unchanged across the D-026 refactor; the repair lane's stages, what it skips, and its gate before capture; a channel behind the install refused at plan with the carrier named; a dist-tag value that is not a version refused before install; the `npm link` line for a successful clone only, while `mirror` is missing |
| 4 | `ts/test/runtime/packageStrategy.test.ts` | `--check` for a package: `update_available`, `up_to_date`, `channel_behind` with `Next: runtime channel main`, `unresolved` with the reason; the channel's note travels |
| 4 | `ts/test/runtime/channel.test.ts` | `runtime channel` reads and writes the clone marker and the package file beside the config (its directory created `0700`); normalization; refusal before any write; an unknown install has nowhere |
| 4 | `ts/test/runtime/installKind.test.ts` | a package known by its layout with no npm probe; the layout alone is not enough (the prefix's bin must resolve into it); containment in npm's root still required when it is known, after resolving its symlinks; `renderInstallLines` |
| 4 | `ts/test/runtime/status.test.ts`, `git.test.ts` | the `Install:` line in the two frozen goldens (hand-edited, 27 + 11); a package graded without git: `Repository: none (package install)`, verdict `ready`, the gate open |
| 4 | `ts/test/runtime/release.test.ts` | `npm publish --dry-run --tag stable` before the tag, injected and recorded; a promotion dry run runs no npm; an artifact that cannot pack stops before any tag; `--push` still publishes nothing; the printed plan names both forms |
| 4 | `ts/test/util/semver.test.ts`, `paths.test.ts` | one semver reader (the oracle's refusals sort below everything; the strict form a registry answer must take); `commandOnPath` as a shell's `command -v` |
| 4 | `ts/test/db/schemaState.test.ts`, `migrateOnOpen.test.ts` | the newer-database refusal ends in `mirror runtime update` (item 12) |
| 5 | `ts/test/scripts/retiredSurfaces.test.ts` | the `frame-installer` row is enforced; every deleted path fails it if it comes back; a `.ps1`, `.psm1`, `.iss`, or `.cmd` anywhere fails it; a file naming the product's scripts outside the record is reported with its line; the eleven "until US3" exemptions are gone from `python-core-mentions`; the sweep is clean against this tree |
| 5 | `ts/test/scripts/packContents.test.ts` | a shipped file carrying any interpreter-invocation form is named by file and line; `docs/releases/` and the retired-surface guard may; the rule cannot trip on its own source; this repository packs clean on both axes |

## E2E Decision

Required. The story's subject is an install with no checkout; nothing run inside this
repository stands in for it.

## Navigator Validation

Four routes. Run them as written, with `bash`, so aliases do not apply
([collaboration strategy](../../collaboration-strategy.md)).

### Route 1 — the checkout, plateau 2

```bash
cd ~/dev/workspace/mirror-ts-core
npm link                      # once; puts `mirror` on the PATH from this tree
command -v mirror             # → /opt/homebrew/bin/mirror (or the global bin of your Node)
mirror runtime status | sed -n '3,4p'
```

Expected observation: `Version: 0.31.14` and `Repository: /Users/vinicius/dev/workspace/mirror-ts-core`
(the `Install kind:` line is plateau 4's).

Then open Pi in the checkout and run `/mm-mirror`, `/mm-journeys`, `/mm-build mirror-ts-core`,
`/mm-backup`, and `/mm-update --check`.

- Pass: every skill runs `mirror …` (visible in the tool calls) and answers as it did on
  2026-09-30; `front-door.log` records each; no `NODE_OPTIONS`, `--env-file`, or
  `ts/src/frontDoor/cli.ts` appears in any command the agent runs; the status line renders.
- Fail: `mirror: command not found`; a skill that still prints the checkout invocation; an
  answer that differs from the plateau-0 capture for the same family.

**1b — the agent with no `mirror`** (the ai-engineer finding). Once, deliberately:

```bash
npm unlink -g mirror-mind && command -v mirror || echo "gone, as intended"
```

Open Pi in the checkout. Expected observation: at session start, one visible notice —
``Mirror: `mirror` is not on the PATH — run `npm link` once in /Users/vinicius/dev/workspace/mirror-ts-core. Skills will fail until it is.``
Then ask for `/mm-journeys` and record what the agent does when the command is absent (the
plan asks for this observation). Quit, and `npm link` again.

### Route 2 — outside the checkout, plateau 2

Two halves. **2a** proves the install and the config write with a scratch `HOME`, no Pi.
**2b** proves Pi loads Mirror from that install with the Navigator's real Pi
configuration (auth lives under the real `HOME`), while the Mirror home, the config file,
and the Pi sessions directory are scratch (CR106).

```bash
# 2a — the install, from nothing
set -eu
SCRATCH="$(mktemp -d /tmp/us3-route2.XXXXXX)"
mkdir -p "$SCRATCH/prefix" "$SCRATCH/home" "$SCRATCH/pi-sessions"
( cd ~/dev/workspace/mirror-ts-core && npm pack --pack-destination "$SCRATCH" >/dev/null )
TARBALL="$(ls "$SCRATCH"/mirror-mind-*.tgz)"
npm install -g --prefix "$SCRATCH/prefix" "$TARBALL"
PKG="$SCRATCH/prefix/lib/node_modules/mirror-mind"

cd /tmp                       # no checkout anywhere near
env -i PATH="$SCRATCH/prefix/bin:/usr/bin:/bin:$(dirname "$(command -v node)")" \
       HOME="$SCRATCH/home" bash -c '
  command -v mirror
  mirror                                    # the orientation: three lines
  mirror init route2
  mirror seed || echo "exit $? — F1, expected"
  mirror list personas | head -5
  mirror runtime status | sed -n "3,8p"
  stat -f "%Sp" "$HOME/.config/mirror/env" "$HOME/.config/mirror"
  cat "$HOME/.config/mirror/env"
'
```

- Expected observation: `mirror` resolves under `$SCRATCH/prefix/bin`; bare `mirror` prints
  `No user configured yet.` and two lines; `init` prints `Configuration: …/.config/mirror/env
  (MIRROR_USER=route2)` and where the key goes; `seed` creates 19 entries and exits 1 by F1;
  twelve personas; `status` names the version, `Mirror home: $SCRATCH/home/.mirror-minds/route2`,
  and `Database exists: yes`; the two `stat` lines read `-rw-------` and `drwx------`; the
  config file holds exactly `MIRROR_USER=route2`.
- Pass: all of the above, and `$SCRATCH/home/.mirror-minds/route2/memory.db` exists.
- Fail: any command reaching for `ts/src/frontDoor/cli.ts`; an `ExperimentalWarning` on
  stderr; a `.env` "not found" notice; a permission wider than owner-only; anything written
  under the real `HOME`.

```bash
# 2b — Pi, from the same install, real Pi auth, scratch Mirror state
# Pi runs with the REAL HOME (its auth lives there), so `MIRROR_USER=route2` alone
# would resolve to ~/.mirror-minds/route2 in the real homes root. Pin the scratch
# home in the scratch config file, and add the key by hand -- never on a command line:
printf 'MIRROR_HOME=%s\n' "$SCRATCH/home/.mirror-minds/route2" >> "$SCRATCH/home/.config/mirror/env"
#   echo 'OPENROUTER_API_KEY=…' >> "$SCRATCH/home/.config/mirror/env"
pi install "$PKG"             # personal package, real ~/.pi/agent/settings.json; removed below
ls -la ~/.mirror-minds > "$SCRATCH/real-homes-before.txt"
cd /tmp
env -u MIRROR_USER -u MIRROR_HOME PATH="$SCRATCH/prefix/bin:$PATH" XDG_CONFIG_HOME="$SCRATCH/home/.config" PI_SESSIONS_DIR="$SCRATCH/pi-sessions" pi
```

One line, so a terminal wrap does not split `env` from `pi` (an `env` with no command prints
the environment -- secrets included -- and `pi` then runs with the real configuration).

Do **not** blank `MIRROR_USER=`/`MIRROR_HOME=` in the shell: an empty variable is
"defined" to the core's loader and would block the config file. `env -u` unsets them.

Inside Pi, in this order:

1. `/mm-journeys` — the skill runs `mirror journeys` and answers from the scratch database.
2. `/mm-mirror`, then a Mirror Mode question that needs a specialist — for example
   *"How should I think about pricing a mentorship?"* — **the D13 prompt**: the answer must
   carry a `◇ <persona>` signature and be in the first person, which only the Operating
   Instructions tell the model to do. Without them the skill still answers; the signature
   is the proof the instructions arrived.
3. `/mm-build personal-growth` — must load context and **stop at the Builder Activation
   Boundary**, asking what to do next (the second D13 proof: the boundary is an instruction,
   not a skill step).

- Expected observation: the status line renders `◇ … · ◌ Mirror Mode · ✓`; every skill
  runs `mirror …`; the persona signature appears; Builder load stops and asks. After
  quitting, `PATH="$SCRATCH/prefix/bin:$PATH" XDG_CONFIG_HOME="$SCRATCH/home/.config" mirror conversations`
  lists the session, and `$SCRATCH/home/.mirror-minds/route2/mirror-logger.log` holds
  `operating instructions appended from …/mirror-mind/AGENTS.md` and, if Pi reached the
  extension twice, one `second registration skipped` line (record which).
- Pass: all of the above; `diff <(ls -la ~/.mirror-minds) "$SCRATCH/real-homes-before.txt"`
  is empty (no new home appeared beside the real ones); `$SCRATCH/pi-sessions` holds the
  session and `~/.pi/agent/sessions` gained nothing.
- Fail: a skill that names the checkout; no persona signature on the D13 prompt; Builder
  load that starts work; the real Mirror home or the real Pi sessions touched; the
  extension logging to a home other than the scratch one.

Clean up: `pi remove "$PKG"`, then `rm -rf "$SCRATCH"`.

### Route 3 — the runtimes outside the tree, plateau 3

One script, one command per step, run from the repository root: [`route3.sh`](route3.sh).
Each step prints ✓ / ✗ and the evidence to look at. Everything lives in `/tmp/us3-route3`;
nothing touches your real Mirror home or runtime configs. Run it **before** `npm link`:
step 2's removal case needs no global `mirror-hook`, and skips (saying so) when one exists.

```bash
R=docs/project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-us3-npm-distribution/route3.sh
bash $R 1      # 3b — install from nothing; `mirror init` prints the wiring
bash $R 2      # 3a — the plugin from a cache copy: hooks, D13, MCP; then mirror-hook removed
bash $R 3      # 3d — Claude Code, Gemini CLI, Codex discover the package (no session, no tokens)
bash $R 4      # 3c — optional: a real Claude Code session on the scratch install (tokens)
bash $R 5      # after /exit in step 4: what the session left; your real mirror untouched
bash $R clean
```

- **Step 1 passes** when the wiring section names every runtime on your `PATH` (and only
  those) with paths inside `/private/tmp/us3-route3/prefix/lib/node_modules/mirror-mind`,
  and seed leaves 12 personas. Read the wiring; do not run it — it edits real configs.
- **Step 2 passes** when SessionStart returns the package's `AGENTS.md` byte for byte (Claude
  Code and Gemini), a prompt lands as `claude_code` in the scratch mirror, the launcher's
  server answers `initialize` with an empty stderr, and with `mirror-hook` gone the turn is
  not failed, `hooks.log` gets one line, and `mirror runtime diagnose` prints
  `hook_failures_recorded` without the prompt.
- **Step 3 passes** when Claude Code lists `mirror-mind@skills-dir` loaded with 25 skills,
  3 hooks, 1 MCP server; Gemini CLI discovers 25 skills; Codex discovers 25 and its prompt
  carries the Operating Instructions.
- **Step 4** prints a marker (`ROUTE3-xxxxxx`) and two prompts, then opens Claude Code in
  `/tmp/us3-route3/project` with `--plugin-dir`, your real login, and the Mirror home and
  Pi sessions directory pinned to scratch ones. Pass: prompt 1 lists **only**
  `personal-growth` (the scratch install's journey); prompt 2 enters Mirror Mode unasked and
  answers under a `◇ <persona>` line, likely `◇ financial`. The `◇` format is in no skill and
  not in `mirror load`'s output, so it can only come from the Operating Instructions the
  plugin's SessionStart hook delivered (D13).
- **Step 5 passes** when the scratch mirror holds the session's `claude_code` turns with the
  marker, `journeys` and `mirror` ran through the install, `hooks.log` is empty, and no real
  mirror database holds a `claude_code` message with the marker.

### Route 3e — the checkout's own updater surface, plateau 4

Machine evidence carries plateau 4 (the package lane runs only where a scratch prefix and a
shadowed registry exist). What the Navigator can see on this checkout, in one minute:

```bash
cd ~/dev/workspace/mirror-ts-core
mirror runtime version | head -5          # Install: clone (<this path>)
mirror runtime channel                    # Update channel: main, Source: <this path>/.mirror-update-channel
mirror runtime channel beta; echo "exit=$?"   # Error: unknown channel "beta": choose stable or main, exit=2
mirror runtime update --check | head -4   # the clone's check, unchanged
npm run release:promote -- --target v0.31.14 --dry-run   # the doctor fails on this tree (no v0.31.14 note): expected
bash scripts/smoke_runtime_update.sh | tail -3           # passed: 86   failed: 0
```

- Pass: the lines as commented; the smoke's `Result` line reads `passed: 86   failed: 0`.
- Fail: `Install:` missing or `unknown`; a channel written for `beta`; a smoke check marked ✗.

### Route 4 — the capture replay, plateau 6

```bash
cd ~/dev/workspace/mirror-ts-core
cp ~/.mirror-minds/vinicius-ts/memory.db tmp/us3/replay.db     # a COPY; the script never opens the live file
bash scripts/capture_family_outputs.sh tmp/us3/replay.db --through-bin > tmp/us3/after.tsv
diff tmp/us3/before.tsv tmp/us3/after.tsv && echo IDENTICAL
```

- Pass: `IDENTICAL`. (The plateau-0 capture is taken after CR008, so item 13's expected
  difference does not apply.)
- Fail: any family whose hash moved; the family is named, and the diff is investigated
  before Validation.

## Validation Evidence

- **Route 3e — walked by the Navigator on 2026-10-09, all seven steps passed** (under `bash`
  3.2): `Install: clone (<this path>)`; the channel `main` from this checkout's marker; `beta`
  refused with exit 2 and the marker untouched; the clone's check unchanged; the promotion dry
  run stopping at the doctor with one failure (the absent `v0.31.14` note — a release-gate
  item, not this plateau's); the update smoke at `passed: 86 failed: 0`; no `~/.config/mirror/`
  and a clean tree afterwards.

- **Routes 1, 1b, 2a, 2b — walked by the Navigator on 2026-10-06, all passed.** Evidence and
  the two findings the walk produced (the manifest's `pi` key; route 2b pinning `MIRROR_HOME`)
  are in the story index's plateau-2 record. Observed: the agent without `mirror` improvised
  onto `node bin/mirror.js`, the sanctioned entry; the D13 prompt answered under `◇ financial`;
  Builder load stopped at the boundary; Pi loaded the package extension once.
- **Route 3 — walked by the Navigator on 2026-10-09, all passed.** Steps 1–3 gave 12/12, 12/12, 7/7.
  Step 4, the Claude Code session:
  - "list my journeys" showed only `personal-growth`, from the scratch install;
  - the pricing question entered Mirror Mode unasked, under `◇ financial` (D13).

  Step 5 gave 7/7: the turns are in the scratch home, there is no `hooks.log`, the real homes
  are untouched, and the transcript carries the Operating Instructions. The Builder had run
  steps 1–3 and simulated step 5 on 2026-10-08. Findings F2–F4 are in the story index; F2 and
  F3 became CR120 and CR121.
- Route 4: pending plateau 6.
