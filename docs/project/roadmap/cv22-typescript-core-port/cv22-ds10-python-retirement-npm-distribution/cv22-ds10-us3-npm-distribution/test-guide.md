[< Story](index.md)

# Test Guide — CV22.DS10.US3

Written at the Plan checkpoint, 2026-09-30. Commands name the files and verbs the
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

Expected: every command exits 0; `smoke_npm_package.sh` prints the installed version, the
install kind `package (mirror-mind@<version>)`, twelve seeded personas, a `_migrations`
ledger that ends at `017`, and `0 interpreter spawns`. CI runs the same set twice, the
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
command -v mirror             # → <global bin>/mirror
mirror runtime status | grep -i 'install'
```

Expected observation: `Install: clone (/Users/vinicius/dev/workspace/mirror-ts-core)`.
Then open Pi in the checkout and run `/mm-mirror`, `/mm-journeys`,
`/mm-build mirror-ts-core`, `/mm-backup`, and `/mm-update --check`.

- Pass: every skill runs `mirror …` (visible in the tool calls) and answers as it did on
  2026-09-30; `front-door.log` records each; no `NODE_OPTIONS`, `--env-file`, or
  `ts/src/frontDoor/cli.ts` appears in any command the agent runs.
- Fail: `mirror: command not found`; a skill that still prints the checkout invocation; an
  answer that differs from the plateau-0 capture for the same family.

### Route 2 — outside the checkout, plateau 2

Two halves. **2a** proves the install and the config write with a scratch `HOME`, no Pi.
**2b** proves Pi loads Mirror from that install with the Navigator's real Pi
configuration (auth lives under the real `HOME`), while the Mirror home, the config file,
and the Pi sessions directory are scratch (CR106).

```bash
# 2a — the install, from nothing
set -eu
SCRATCH="$(mktemp -d /tmp/us3-route2.XXXXXX)"
mkdir -p "$SCRATCH/prefix" "$SCRATCH/home" "$SCRATCH/pi-sessions" "$SCRATCH/mirror-home"
( cd ~/dev/workspace/mirror-ts-core && npm pack --pack-destination "$SCRATCH" >/dev/null )
TARBALL="$(ls "$SCRATCH"/mirror-mind-*.tgz)"
npm install -g --prefix "$SCRATCH/prefix" "$TARBALL"
PKG="$(npm root -g --prefix "$SCRATCH/prefix")/mirror-mind"

cd /tmp                       # no checkout anywhere near
env -i PATH="$SCRATCH/prefix/bin:/usr/bin:/bin:$(dirname "$(command -v node)")" \
       HOME="$SCRATCH/home" XDG_CONFIG_HOME="$SCRATCH/home/.config" bash -c '
  command -v mirror
  mirror init route2
  mirror seed
  mirror list personas --verbose | head -5
  mirror runtime status | grep -i "install"
  stat -f "%Sp" "$XDG_CONFIG_HOME/mirror/env" "$XDG_CONFIG_HOME/mirror"
'
```

- Expected observation: `mirror` resolves under `$SCRATCH/prefix/bin`; `init` prints the
  config path and the line to add; twelve personas; `status` says
  `package (mirror-mind@<version>)` with the scratch root; the two `stat` lines read
  `-rw-------` and `drwx------`.
- Pass: all of the above, and `$SCRATCH/home/.mirror-minds/route2/memory.db` exists.
- Fail: any command reaching for `ts/src/frontDoor/cli.ts`; a `.env` "not found" notice;
  a permission wider than owner-only; anything written under the real `HOME`.

```bash
# 2b — Pi, from the same install, real Pi auth, scratch Mirror state
mkdir -p "$SCRATCH/config/mirror"
printf 'MIRROR_HOME=%s\n' "$SCRATCH/mirror-home" > "$SCRATCH/config/mirror/env"
chmod 700 "$SCRATCH/config/mirror"; chmod 600 "$SCRATCH/config/mirror/env"
# add OPENROUTER_API_KEY=… to that file by hand; the route never passes it on a command line
pi install "$PKG"             # personal package, real ~/.pi/agent/settings.json; removed below
cd /tmp
PATH="$SCRATCH/prefix/bin:$PATH" XDG_CONFIG_HOME="$SCRATCH/config" PI_SESSIONS_DIR="$SCRATCH/pi-sessions" \
  MIRROR_USER= MIRROR_HOME= pi
```

Inside Pi: `/mm-seed`, then `/mm-mirror`, `/mm-journeys`, `/mm-build personal-growth`.

- Expected observation: the status line renders `◇ … · ◌ Mirror Mode · ✓`; the three
  skills run `mirror …` and answer; after quitting,
  `PATH="$SCRATCH/prefix/bin:$PATH" XDG_CONFIG_HOME="$SCRATCH/config" mirror conversations`
  lists the session.
- Pass: all of the above; `~/.mirror-minds/vinicius-ts` untouched (compare `ls -la` before
  and after); `$SCRATCH/pi-sessions` holds the session, `~/.pi/agent/sessions` gained
  nothing.
- Fail: a skill that names the checkout; the real Mirror home or the real Pi sessions
  touched; the extension logging to a home other than `$SCRATCH/mirror-home`.

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
