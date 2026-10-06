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

Expected: every command exits 0; `smoke_npm_package.sh` prints `passed: 64 failed: 0`
(plateau 4 adds the install kind `package (mirror-mind@<version>)`; since plateau 3 the four
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

### Route 3 — the runtimes outside the tree, plateau 3

**3a — without a session (no auth, no tokens): the plugin and the launcher from Claude
Code's cache.** `bash scripts/smoke_claude_plugin.sh` is this route run by machine: the
plugin copied to a scratch directory, `mirror-hook` and `mirror` on a scratch `PATH` as
npm's global bin links them, the home named by a scratch `~/.config/mirror/env`. It
proves the three hooks reach that home through `mirror-hook` and log `claude_code`, the
launcher answers `initialize` with an empty stderr, and then — `mirror-hook` removed —
a hook still exits 0, lands one line in `hooks.log`, and `mirror runtime diagnose`
reports `hook_failures_recorded` without the prompt. `scripts/smoke_npm_package.sh`
sections 8–12 do the same from a real `npm install -g` for all four runtimes.

**3b — the wiring, as `mirror init` prints it.** From route 2a's scratch install, with
`PATH` holding the runtimes you have:

```bash
env PATH="$SCRATCH/prefix/bin:$PATH" HOME="$SCRATCH/home" mirror init route3 | sed -n '/Wire your runtime/,$p'
```

Expected: a block per runtime found on the `PATH` and none for the others — Pi (1 step),
Claude Code (1), Gemini CLI (2), Codex (2) — every path inside `$SCRATCH/prefix/lib/node_modules/mirror-mind`.

**3c — Claude Code, if the Navigator uses it (a real session; tokens).** With the scratch
install's bin first on the `PATH` and a scratch config dir so nothing of yours is touched:

```bash
mkdir -p "$SCRATCH/claude/skills"
ln -s "$PKG/plugins/mirror-mind" "$SCRATCH/claude/skills/mirror-mind"
CLAUDE_CONFIG_DIR="$SCRATCH/claude" claude plugin list          # mirror-mind@skills-dir, loaded
CLAUDE_CONFIG_DIR="$SCRATCH/claude" claude plugin details mirror-mind   # 25 skills, 3 hooks, 1 MCP server
cd /tmp && env PATH="$SCRATCH/prefix/bin:$PATH" HOME="$SCRATCH/home" CLAUDE_CONFIG_DIR="$SCRATCH/claude" claude
```

(`CLAUDE_CONFIG_DIR` moves auth too; log in once in the scratch dir, or skip 3c and let 3a
stand as the evidence, recorded as such.) In the session: `/mm:journeys` answers from the
install; a Mirror Mode question is answered under a `◇ persona` signature — the Operating
Instructions arrived through the plugin's SessionStart hook, not a CLAUDE.md (D13); after
the session, `$SCRATCH/home/.mirror-minds/route3/memory.db` holds the turns as
`claude_code`, and no `hooks.log` exists beside it.

**3d — Gemini CLI and Codex, discovery only (no session).** Verified at plateau 3 from
scratch configuration directories; rerun if wanted:

```bash
# Gemini: link the skills; a nested directory symlink is NOT discovered (0.61.0).
mkdir -p "$SCRATCH/gemini-home" && HOME="$SCRATCH/gemini-home" gemini skills link --consent "$PKG/.pi/skills"
HOME="$SCRATCH/gemini-home" gemini skills list | grep -c '^mm-'      # 25
# Codex: skills recursively, AGENTS.md globally; the prompt rendered without a model call.
mkdir -p "$SCRATCH/codex-home/skills" && ln -s "$PKG/.pi/skills" "$SCRATCH/codex-home/skills/mirror-mind" && ln -s "$PKG/AGENTS.md" "$SCRATCH/codex-home/AGENTS.md"
cd /tmp && CODEX_HOME="$SCRATCH/codex-home" codex debug prompt-input hello | grep -c 'mm-journeys\|Ego-Persona Model'   # ≥ 2
```

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

- **Routes 1, 1b, 2a, 2b — walked by the Navigator on 2026-10-06, all passed.** Evidence and
  the two findings the walk produced (the manifest's `pi` key; route 2b pinning `MIRROR_HOME`)
  are in the story index's plateau-2 record. Observed: the agent without `mirror` improvised
  onto `node bin/mirror.js`, the sanctioned entry; the D13 prompt answered under `◇ financial`;
  Builder load stopped at the boundary; Pi loaded the package extension once.
- Route 3a: run by machine on 2026-10-06 (`smoke_claude_plugin.sh`, `smoke_npm_package.sh` 64/64). Routes 3b–3d and 4: pending the Navigator's walk and plateau 6.
