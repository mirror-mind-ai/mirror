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
node ts/scripts/checkPackContents.ts            # new: the tarball holds the runtime subset and nothing else
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
bash scripts/smoke_runtime_update.sh            # + runtime channel, + the clone post-update line
bash scripts/smoke_npm_package.sh               # new: pack → scratch install → init/seed/status → migrating open → runtime smokes
for smoke in smoke_codex smoke_gemini_cli smoke_claude_plugin smoke_mirror_mcp; do
  bash "scripts/$smoke.sh" || break             # smoke_claude_plugin runs the plugin's hooks through mirror-hook on a scratch PATH
done
```

Expected: every command exits 0; `smoke_npm_package.sh` prints `passed: 40 failed: 0`
(plateau 4 adds the install kind `package (mirror-mind@<version>)`; plateau 3 the runtime
smokes against the installed wrappers), twelve seeded personas, a migrating open that
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
| 3 | `ts/test/hooks/hooks.test.ts` | both wrapper forms match their templates; the bin form's search order; the skip note when nothing resolves |
| 4 | `ts/test/runtime/channel.test.ts` | `runtime channel` reads and writes the marker for a clone and the XDG file for a package; the post-update `npm link` line appears only for a clone with no `mirror` on the `PATH` |
| 5 | `ts/test/guards/retiredSurfaces.test.ts` | the `frame-installer` row (if D4 retires) |

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

### Route 3 — the plugin outside the tree, plateau 3

If the Navigator uses Claude Code: copy `plugins/mirror-mind` to a scratch directory, point
Claude Code at it, and start a session with the scratch install's `PATH` from route 2.
Expected: SessionStart injects, a prompt is logged, SessionEnd closes the conversation; the
MCP server answers `initialize`. Otherwise `bash scripts/smoke_claude_plugin.sh` in
package mode is the evidence, and Validation records that the Navigator did not walk it.

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

Pending implementation and validation.
