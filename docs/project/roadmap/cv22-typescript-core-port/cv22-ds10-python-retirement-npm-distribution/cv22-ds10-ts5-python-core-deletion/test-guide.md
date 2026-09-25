[< Story](index.md)

# Test Guide — CV22.DS10.TS5

Every command is run from the repository root unless stated. Commands that
exist only until plateau 3 are marked **(pre-deletion)**; commands that exist
only from plateau 3 on are marked **(post-deletion)**.

## Automated Validation

### Plateau 0 — the final parity evidence (pre-deletion)

The last time these will ever run. Their output is recorded below under
*Validation Evidence* as the closing parity record of the migration.

```bash
# Golden determinism: regenerate must be a no-op
for g in ts/parity/generate_*_golden.py ts/parity/generate_golden.py; do uv run python "$g"; done
git diff --exit-code ts/test/goldens/

# Oracle drift
uv run python scripts/check_oracle_drift.py

# Real-DB-copy parity and write parity on the demo copy
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
uv run python ts/parity/real_db_copy_parity.py --source tmp/parity/demo-memory.db
node ts/parity/write_parity_verify.ts --source tmp/parity/demo-memory.db

# Both suites, both guards
uv run pytest tests/unit/ tests/integration/ -m "not live"
(cd ts && npm test)
uv run python scripts/check_retired_surfaces.py
node ts/scripts/checkSkillCommandParity.ts
```

Expected: every command exits 0; `git diff` on the goldens is empty. A
non-empty diff is a stop condition (the oracle drifted after the last
regeneration).

### Plateau 0 — the per-family capture on the real copy (pre-deletion)

The before/after evidence that survives the deletion. Taken once, here,
because after plateau 3 the "before" cannot be produced at any price.

```bash
cp <real-memory.db> tmp/ts5/nav-copy.db
bash scripts/ts5/capture_family_outputs.sh tmp/ts5/nav-copy.db \
  > tmp/ts5/capture-plateau0.tsv
wc -l tmp/ts5/capture-plateau0.tsv        # one row per ported family (29)
```

The script (added in slice A, retained through Done) runs one representative
invocation per ported command family against a **read-only copy** and prints
one tab-separated row per family: `family`, `argv`, `exit_code`,
`line_count`, `sha256(stdout)`. **No output text is recorded** — hashes,
counts, and exit codes only — so the file can be quoted beside the story
without carrying user data. Real database artifacts are never committed; the
capture stays in `tmp/`.

Expected: 29 rows, every `exit_code` 0 (or the family's documented non-zero),
no empty hash. A family that cannot be invoked read-only is recorded with the
reason rather than skipped silently.

### Plateau 0 — the tags (pre-deletion)

Two tags, at two different moments. Taking the recovery tag here would mean
recovering from a plateau-3 problem by discarding plateaus 1 and 2.

```bash
# Plateau 0 (done): provenance for the capture, NOT a recovery point.
git tag -a cv22-ts5-baseline -m "Pre-TS5 baseline: the tree the capture was taken against"
git push origin cv22-ts5-baseline
git rev-parse cv22-ts5-baseline^{commit}   # 2adf2951 -- note the ^{commit}: an
                                          # annotated tag's own object SHA is
                                          # not the commit's (4e83c69e here)

# End of plateau 2, immediately before F's first commit: the recovery point.
git tag -a cv22-last-python-bearing -m "Last commit with the Python core present (CV22.DS10.TS5)"
git push origin cv22-last-python-bearing
git rev-parse cv22-last-python-bearing^{commit}   # record in index.md and decisions.md
```

### Plateau 0 — guards side by side (pre-deletion)

```bash
# Clean tree: both agree
uv run python scripts/check_retired_surfaces.py; echo "py=$?"
node ts/scripts/checkRetiredSurfaces.ts;          echo "ts=$?"
uv run python scripts/check_doc_links.py;         echo "py=$?"
node ts/scripts/checkDocLinks.ts;                 echo "ts=$?"

# Seeded regression: both refuse, same first problem line
echo 'python3 -m memory backup --silent' >> .claude/hooks/session-start.sh
uv run python scripts/check_retired_surfaces.py 2>&1 | head -1
node ts/scripts/checkRetiredSurfaces.ts          2>&1 | head -1
git checkout .claude/hooks/session-start.sh

# Plugin builder: byte-identical output
node ts/scripts/buildClaudePlugin.ts && git diff --exit-code plugins/
```

Expected: exit codes equal on the clean tree (0); on the regression both
exit 1 and print the same `path:line` first problem; `git diff` on
`plugins/` is empty.

### Plateau 1 — migrations as sole custodian

**Do not simulate a behind-schema database by deleting ledger rows.**
`DELETE FROM _migrations WHERE id > '014'` leaves the *current* schema with a
lying ledger; `migrations.ts` carries fifty `IF NOT EXISTS` guards, so the
re-run applies three no-ops and reports `applied`. That fixture passes green
and proves nothing. The real user brings an old **schema**, not an old ledger.

```bash
# 1. Every committed pre-state fixture reaches its expected snapshot,
#    with no Python involved. This is the custody proof.
node ts/parity/migration_structural_parity.ts     # → ts/smoke/ after F
node ts/parity/bootstrap_custody_parity.ts

# 2. One real-shape case: a demo database generated BEFORE 015 existed,
#    migrated forward by the TypeScript engine, schema-diffed against today.
git stash && git checkout <pre-015-commit>
uv run python ts/parity/generate_demo_memory_db.py --out tmp/ts5/pre015.db
git checkout - && git stash pop
sqlite3 tmp/ts5/pre015.db "SELECT id FROM _migrations ORDER BY id"   # ends at 014
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts runtime migrate --db-path tmp/ts5/pre015.db; echo "exit=$?"
sqlite3 tmp/ts5/pre015.db ".schema" | sort > tmp/ts5/pre015-after.sql
sqlite3 tmp/parity/demo-memory.db ".schema" | sort > tmp/ts5/current.sql
diff tmp/ts5/pre015-after.sql tmp/ts5/current.sql
ls tmp/ts5/backups/

# 3. A copy that is not a Mirror database — the surviving `declined` case
sqlite3 tmp/ts5/empty.db "CREATE TABLE t(x)"
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts runtime migrate --db-path tmp/ts5/empty.db; echo "exit=$?"
```

Expected: (1) both exit 0 across every fixture; (2) `Migrate result: applied`
naming `015_create_builder_workbench`,
`016_builder_workbench_display_codes`, `017_journey_parent_column`, exit 0,
an **empty schema diff**, and a `frontdoor-pre-migration-backup.db` present;
(3) `Migrate result: declined` with the structural reason, exit non-zero.
The word `Deferred` appears nowhere, and `TS_AUTHORED_MIGRATION_IDS` no
longer exists in the source.

### Plateau 1 — hook row-diffs (pre-deletion; the only cross-engine hook proof)

For each hook family, run the **old** (Python) and **new** (Node) hook against
two copies of the same database with the same stdin payload, then diff the
rows:

```bash
for family in claude gemini codex plugin; do        # claude: session-start, user-prompt, inject, session-end
  for case in happy muted fast empty-prompt no-session-id rebackfill cp1252; do
    scripts/ts5/hook_rowdiff.sh "$family" "$case" tmp/parity/demo-memory.db
  done
done
```

The cases are the ones this surface has broken on before, not only the happy
path:

| Case | What it must do |
|---|---|
| `happy` | identical rows in `conversations`, `messages`, `runtime_sessions` |
| `muted` | write nothing, exit 0 (Python's `is_muted` early exit) |
| `fast` | `session-start --fast`: unmute and reorient, no close tail |
| `empty-prompt` | no row, no error |
| `no-session-id` | **fail loud** — Python's `mirror_state` does, by design; the port keeps it |
| `rebackfill` | `backfill-codex-session` on an already-backfilled session is idempotent |
| `cp1252` | on Windows, injected `◇` glyphs survive; `_prefer_utf8_stdio` lived in the Python entry point and the Node entries need the same posture |

The script (added in slice C, deleted in F with the Python it compares
against) copies the database twice, feeds a recorded hook JSON payload to
each engine's hook with `MIRROR_HOME` pointed at each copy, and prints the
diff of `conversations`, `messages`, and `runtime_sessions` with `id`,
`created_at`, `updated_at`, and `session_id` columns masked.

Expected: an empty diff for every family **and every case**. A non-empty diff
not explained by a masked column is a stop condition.

When this is re-run against a copy of the **real** database rather than the
demo one, what enters this file is counts and hashes only — never rows —
matching the redacted-by-default posture of the parity harness.

### Plateau 2 — nothing reaches for the interpreter

```bash
# The whole suite under the shadow (this is also the CI step).
# Same mechanism as TS2's `Extension suites need no interpreter`, widened
# from test/extensions/ to the whole suite. Until this plateau that CI step
# is `continue-on-error: true`; here it becomes required.
mkdir -p tmp/ts5/shadow
export TS5_SHADOW_LOG="$PWD/tmp/ts5/shadow.log"; : > "$TS5_SHADOW_LOG"
for b in python python3 uv; do
  printf '#!/bin/sh\necho "TS5 SPAWN: $0 $*" >> "$TS5_SHADOW_LOG"\nexit 66\n' > tmp/ts5/shadow/$b
  chmod +x tmp/ts5/shadow/$b
done
(cd ts && PATH="$PWD/../tmp/ts5/shadow:$PATH" npm test)
test ! -s "$TS5_SHADOW_LOG" && echo "no spawn attempted" || cat "$TS5_SHADOW_LOG"

# The type is the inventory
(cd ts && npx tsc --noEmit)
rg -n '"python"' ts/src/frontDoor/routing.ts ts/src/providers/transport.ts ts/src/frontDoor/cli.ts
```

Expected: the suite passes, the shadow log is **empty**, `tsc` is clean, and
the `rg` prints nothing. The log is the verdict rather than a `ps` sample:
sampling a process tree is non-deterministic, and a short-lived spawn between
two samples is invisible.

### Plateau 2 — flag-first pairwise (pre-deletion)

Finding [F5](inventory.md#f5--valid-flag-first-invocations-reach-python-through-the-fallthroughs)'s
proof, and possible only while both engines exist. Every flag-first shape the
oracle accepts, answered by Python and by TypeScript on two copies of the same
database, compared on exit code, stdout, stderr, and the rows a write leaves
behind. TypeScript runs under the interpreter shadow, so the fallback cannot be
what answers.

```bash
uv run python ts/parity/generate_demo_memory_db.py --out tmp/ts5/d2/home/memory.db
bash scripts/ts5/flag_first_pairwise.sh tmp/ts5/d2/home/memory.db
```

Expected: every row `SAME` or a named deviation, `0 differ unexpectedly`,
`interpreter spawns under the shadow: 0`, exit 0. Each row also says whether
the invocation changed its copy (`read`/`wrote`); a write reported as `read`
on both engines compares two untouched databases and proves nothing.

### Plateau 3 — the gate (post-deletion)

```bash
git ls-files '*.py' | wc -l                       # 0
test ! -e pyproject.toml && test ! -e uv.lock && echo absent
rg -n 'setup-python|setup-uv|uv sync|uv run|pytest|ruff' .github/workflows/   # nothing
node ts/scripts/checkRetiredSurfaces.ts           # python-core row live, exit 0
node ts/scripts/checkDocLinks.ts
node ts/scripts/checkSkillCommandParity.ts
(cd ts && npx tsc --noEmit && npx biome check . && npm test)
```

Then the seeded regressions for the new row, each expected to exit 1 with a
line naming the file. **Stage each seed**: the sweep reads the git index, so a
file that is only on disk is invisible to it and the seed proves nothing (as
first written here, these three were unstaged).

```bash
mkdir -p src/memory && echo 'x = 1' > src/memory/__init__.py && git add src/memory/__init__.py
node ts/scripts/checkRetiredSurfaces.ts; git rm -q --cached src/memory/__init__.py; rm -rf src

echo 'version = "0.0.0"' > pyproject.toml && git add pyproject.toml
node ts/scripts/checkRetiredSurfaces.ts; git rm -q --cached pyproject.toml; rm pyproject.toml
```

*Amended at plateau 3 (D12):* the row went live in two halves. A hook seed —
`echo 'python3 -m memory backup' >> plugins/mirror-mind/hooks/session-start.sh`
— is a MENTION, so it fails `python-core-mentions` from plateau 4; until then
the guard passes it and `ts/test/hooks/hooks.test.ts` fails instead. The
evidence section records both, plus two seeds the live half added: a `.py`
anywhere, and a workflow installing an interpreter.

### Plateau 3 — the replay (post-deletion)

The other half of the plateau-0 capture, and the story's central claim:
nothing a user invokes changed.

```bash
# Same script, same copy, same invocations — now with no Python in the tree
bash scripts/ts5/capture_family_outputs.sh tmp/ts5/nav-copy.db \
  > tmp/ts5/capture-plateau3.tsv
diff tmp/ts5/capture-plateau0.tsv tmp/ts5/capture-plateau3.tsv
```

Expected: **empty diff** — 29 families, identical exit code, line count, and
stdout hash. Any difference is either a regression or a deliberate change
that must be named in the story before Done; there is no third reading, and
no oracle left to arbitrate it.

### Goldens are frozen

```bash
git diff <plateau-0-commit> -- ts/test/goldens/ --stat
```

Expected: exactly the files `ts/test/goldens/README.md` lists, each with its
reason. *(Amended at plateau 3: the Plan expected two; F4, D10, and D12 each
added hand edits, and the README — JSON cannot carry a header comment — is
where every one of them is recorded.)*

### Plateau 4 — the mentions half of the gate

`python-core-mentions` is enforced from plateau 4, so the ordinary run of the
guard is the check. The seeds prove it can still see a regression; **stage
each one**, as at plateau 3:

```bash
node ts/scripts/checkRetiredSurfaces.ts          # ten rows, all enforced, exit 0

echo 'python3 -m memory backup --silent' >> plugins/mirror-mind/hooks/session-start.sh
git add plugins/mirror-mind/hooks/session-start.sh
node ts/scripts/checkRetiredSurfaces.ts          # exit 1, the hook named with its line
git checkout HEAD -- plugins/mirror-mind/hooks/session-start.sh

(cd ts && node --test test/scripts/retiredSurfaces.test.ts)   # includes: nothing staged,
                                                              # every exemption tracked and needed
```

## E2E Decision

**Required.** This story removes an engine. A fixture-level route can prove
that no test spawns Python; only a real runtime session on a real database
copy can prove that a *user's* session — hooks, inject, logging, MCP —
survives the removal. The Navigator route below is the E2E.

## Navigator Validation

Performed on a copy of the real database, on the dev clone, at plateau 3 or
later, with the interpreter removed from `PATH` for the whole walk:

```bash
# Prepend the shadow stubs; do NOT try to filter PATH. /usr/bin holds
# python3 on every macOS, so a grep-based filter leaves the interpreter
# reachable and the precondition silently false.
export TS5_SHADOW_LOG="$PWD/tmp/ts5/nav-shadow.log"; : > "$TS5_SHADOW_LOG"
export PATH="$PWD/tmp/ts5/shadow:$PATH"
python3 --version; echo "exit=$?  # 66 = shadowed, correct"
cp <real-memory.db> tmp/ts5/nav-copy.db
export MIRROR_HOME=tmp/ts5/nav-home   # pointing at the copy
```

Every runtime below is launched from this shell so it inherits the shadow. At
the end of the walk `tmp/ts5/nav-shadow.log` must be empty — that file, not a
`ps` sample, is the no-interpreter verdict.

| Step | Command / action | Expected observation | Pass | Fail |
|---|---|---|---|---|
| 1 | Open Pi in the dev clone, send one prompt, quit | `mirror-logger.ts` logs the turn | `recall` (step 6) shows the turn | turn missing |
| 2 | Open Claude Code with `.claude/hooks/`, send one prompt, quit | `session-start`, `user-prompt`, `inject`, `session-end` each run once | shadow log still empty; the inject context appears in the prompt | any line in the shadow log; inject silent |
| 3 | Open Gemini CLI, send one prompt, quit | the three hooks run | same | same |
| 4 | Run `scripts/codex-mirror.sh` for one exchange | wrapper starts and ends the session | same | same |
| 4b | Move `node` out of PATH for one prompt, then restore | the hook cannot resolve Node | one line in `<mirror-home>/hooks.log`, and `runtime diagnose` reports *node not resolvable from hook context* | a silent no-op — the failure mode this rewrite introduces |
| 5 | Launch the packaged plugin's MCP server through `plugins/mirror-mind/mcp/launch.sh` and call one tool | Node server starts; `initialize` reports `0.31.14` | version from `ts/package.json` | version `null`/`0.0.0`, or a `python3` exec |
| 6 | `node ts/src/frontDoor/cli.ts recall <conversation>` for each session above | every hook-logged turn present | transcript complete | a turn missing |
| 7 | `node ts/src/frontDoor/cli.ts frobnicate` | `Unknown command: frobnicate` + usage, exit 1, nothing spawned | as stated | spawn attempt or different exit |
| 8 | `node ts/src/frontDoor/cli.ts week frobnicate` | one-line `week` usage on stderr, exit 2 | as stated | same |
| 9 | Genuinely pre-`015` copy (old **schema**, not a trimmed ledger), any read command | migrations `015`–`017` applied, backup taken, command answers | `runtime migrate` then says `nothing pending`; schema diff empty | `Deferred`, or `nothing pending` on the first run |
| 9b | Replay the plateau-0 per-family capture against `nav-copy.db` | the 29 families answer identically | `diff` of the two capture files is empty | any hash, count, or exit-code difference |
| 10 | `MIRROR_TS_BUILD=0` in a scratch `.env`; `runtime diagnose`; `build load mirror-ts-core` | diagnose names the variable inert since TS5; `build load` answers from TypeScript | as stated | route changes or diagnose silent |
| 11 | `runtime version`, `runtime status`, `welcome` | `0.31.14` in each | as stated | `null` or `0.0.0` |
| 12 | Builder guard: `build load` against a journey whose `project_path` is the production clone | the clone-role guard refuses as before | refusal | silent acceptance (guard disabled by the deletion) |

### The walk, as commands (2026-09-24)

The table above, as a runbook. Written for zsh or bash on macOS, from the dev
clone. Everything happens in **one terminal**, and every runtime in steps 1–5
is launched from it, so each inherits the interpreter shadow and the database
copy. Nothing here touches the production database: the copy is read with
SQLite's online backup, and every write lands in the copy.

**0 — the validation shell.**

```bash
cd ~/dev/workspace/mirror-ts-core
git pull --ff-only && (cd ts && npm ci)

NAV="$PWD/tmp/ts5/nav"; rm -rf "$NAV"; mkdir -p "$NAV/shadow" "$NAV/home"
export TS5_SHADOW_LOG="$NAV/shadow.log"
for bin in python python3 uv; do
  printf '#!/bin/sh\necho "SPAWN: %s $* <- $(ps -o command= -p $PPID)" >> "%s"\nexit 66\n' "$bin" "$TS5_SHADOW_LOG" > "$NAV/shadow/$bin"
  chmod +x "$NAV/shadow/$bin"
done
export PATH="$NAV/shadow:$PATH"
python3 --version; echo "exit=$?"            # exit=66: the shadow works
: > "$TS5_SHADOW_LOG"                        # the walk starts with an empty log

sqlite3 ~/.mirror-minds/vinicius-ts/memory.db ".backup '$NAV/home/memory.db'"
chmod 700 "$NAV/home"; chmod 600 "$NAV/home/memory.db"
export MIRROR_HOME="$NAV/home" MIRROR_USER=  # the empty MIRROR_USER outranks the one in .env
mirror() { NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts "$@"; }
WALK_START="$(date -u +%Y-%m-%dT%H:%M:%S)"

mirror runtime status | grep -E '^(Mirror home|Core migrations):'
```

Expect `Mirror home: …/tmp/ts5/nav/home` and `Core migrations: current (17/17)`.
Each stub records the command line of the process that called it, so a spawn
names its caller. The runtimes load third-party integrations of their own —
the first walk logged Herdr's agent-state hooks and Gemini CLI's self-update —
and those are not Mirror's: the verdict below is about spawns whose caller is
Mirror code. `mirror` is a function here rather than the documented alias, so that
`VAR=value mirror …` works in both shells. The copy's `.env` still carries the
OpenRouter key: session ends and `build load` make a few live calls, costing
cents and writing their ledger rows to the copy.

**1 — Pi.** `pi "Say hello in one sentence."` → wait for the answer → quit.
Add `--model <provider/id>` if the default model is not the one to use: do not
switch it in the TUI.

The prompt goes on the command line on purpose: that is F21's field shape. Pi
starts its session maintenance in the background at launch and logs a prompt
given at launch about 40 ms later — before the fix, twenty sessions in twenty
lost that prompt. Nothing may happen in the TUI before the prompt is sent: the
second walk's first attempt switched models three times and sent it 51 seconds
in, long after maintenance had finished. Then read Pi's own log:

```bash
grep -E 'session-maintenance started|log-user|maintenance complete|Error|\[(WARN|ERROR)\]' "$MIRROR_HOME/mirror-logger.log"
```

Expect three lines and nothing else: `session-maintenance started …`, then
`[INFO] log-user: Say hello in one sentence....` a tenth of a second or less
later (the field losses were 0.04 to 0.12 s apart; the second walk's pass,
0.014 s), then `Conversation maintenance complete.` Seconds apart, the step did
not test the race and must be repeated. Either writer can lose: a `[WARN]` or
`[ERROR]` line is `log-user` losing, and an error trace (`BackupGateError`,
`Error: …`) or a missing `maintenance complete` is the maintenance losing —
it runs detached and writes its own output here, unprefixed. On a repeat in the same shell, move
the log aside first, or the grep reads both attempts.

**2 — Claude Code.** `claude` → `/mm:mirror What should I focus on today?`
(approve the front-door command if asked) → one plain follow-up → `/exit`.
Mirror Mode context must shape the answer — that is the inject hook. Then:

```bash
cat "$MIRROR_HOME/hooks.log" 2>/dev/null | wc -l
```

Expect `0`. A hook that cannot do its job writes one line to `hooks.log` and
nowhere the user sees; this file is where the first walk found F21.

**3 — Gemini CLI: skipped** (Navigator, 2026-09-25). Gemini CLI is retired
and Antigravity replaces it; adapting Mirror to Antigravity is CV21's, after
this migration. Mirror's `.gemini/` hooks stay graded by the suite and
`scripts/smoke_gemini_cli.sh`.

**4 — Codex.** `./scripts/codex-mirror.sh` → one exchange → exit.

**4b — a hook that cannot find `node` (optional; renames Homebrew's `node` for seconds).**

```bash
NODE_REAL="$(node -p process.execPath)"
mv /opt/homebrew/bin/node /opt/homebrew/bin/node.nav-off && {
  echo '{}' | env -i HOME="$HOME" MIRROR_HOME="$MIRROR_HOME" PATH=/usr/bin:/bin \
    bash .claude/hooks/session-start.sh; echo "hook exit=$?"
  env -i HOME="$HOME" MIRROR_HOME="$MIRROR_HOME" PATH=/usr/bin:/bin \
    "$NODE_REAL" --no-warnings ts/src/frontDoor/cli.ts runtime diagnose | grep -A2 hook_node_unresolvable
}; mv /opt/homebrew/bin/node.nav-off /opt/homebrew/bin/node
tail -1 "$MIRROR_HOME/hooks.log"
```

Expect `hook exit=0`, a `hook_node_unresolvable` finding, and a `hooks.log`
line ending `node not found on PATH; hook skipped. Set MIRROR_NODE.` The
restore is on the same line as the rename, so it runs whatever happens between.

**5 — the MCP server, through the plugin's launcher.**

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"navigator","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_journeys","arguments":{}}}' \
  | bash plugins/mirror-mind/mcp/launch.sh | cut -c1-160
```

Expect `"serverInfo": {"name": "mirror-mind", "version": "0.31.14"}`, then a
journeys list.

**6 — every session, read back.**

```bash
sqlite3 "$MIRROR_HOME/memory.db" "select substr(id,1,8), interface,
  (select count(*) from messages m where m.conversation_id = c.id)
  from conversations c where started_at >= '$WALK_START' order by started_at"
mirror recall <id>          # once per id above
```

Expect one row each for `pi`, `claude_code`, and `codex` — none for
`gemini_cli`, step 3 being skipped — each with user **and** assistant
messages; a walk that repeats only some steps expects only the runtimes it ran
(the second walk: `pi` and `claude_code`). Rows for Pi sessions that session
start backfilled from `~/.pi/agent/sessions` are expected noise. Then the
isolation check — the walk wrote nothing to production:

```bash
sqlite3 ~/.mirror-minds/vinicius-ts/memory.db "select interface, count(*)
  from conversations where started_at >= '$WALK_START' and interface != 'pi' group by 1"
```

Expect no rows. (`pi` is excluded because the Pi session you are working in
keeps logging to production during the walk.)

**7–8 — names nothing owns.**

```bash
mirror frobnicate > "$NAV/unknown.out"; echo "exit=$?"; head -1 "$NAV/unknown.out"
mirror week frobnicate; echo "exit=$?"
```

Expect `Unknown command: frobnicate` with exit 1, then `usage: week …` and
`week: error: argument command: invalid choice: 'frobnicate' …` on stderr with
exit 2.

**9 — a database with an old schema.** The Python-generated demo database from
plateau 3's port proof stops at migration 016 — an old *schema*, not a
trimmed ledger.

```bash
mkdir -p "$NAV/old" && sqlite3 tmp/ts5/demo-port/py.db ".backup '$NAV/old/memory.db'"
MIRROR_HOME="$NAV/old" mirror runtime status | grep 'Core migrations'
MIRROR_HOME="$NAV/old" mirror journeys > /dev/null; echo "exit=$?"
sqlite3 "$NAV/old/memory.db" "select max(id) from _migrations"; ls "$NAV/old/backups"
MIRROR_HOME="$NAV/old" mirror runtime migrate | tail -1
MIRROR_HOME="$NAV/old" mirror runtime status | grep 'Core migrations'
```

Expect, in order: `attention needed (16/17 applied; missing
017_journey_parent_column)` (F19), exit 0, `017_journey_parent_column` and
`frontdoor-pre-migration-backup.db` (applied on open, backup first), `Migrate
result: nothing pending`, `current (17/17)`.

**9b — the per-family replay.**

```bash
bash scripts/ts5/capture_family_outputs.sh "$PWD/tmp/ts5/pristine.db" > "$NAV/capture.tsv"
diff tmp/ts5/capture-plateau3-close.tsv "$NAV/capture.tsv" && echo IDENTICAL
```

**10 — a stale revert variable.**

```bash
MIRROR_TS_BUILD=0 mirror runtime diagnose | grep -A2 stale_revert_gate
MIRROR_TS_BUILD=0 mirror build load mirror-ts-core | head -3
tail -1 "$MIRROR_HOME/front-door.log"
```

Expect the variable named as inert since CV22.DS10.TS5, the Builder banner,
and a log line `build ts exit=0 leaf=load …`.

**11 — the version, everywhere.**

```bash
mirror runtime version | grep Version; mirror runtime status | grep Version; mirror welcome | head -2
```

Expect `0.31.14` in all three.

**12 — the production clone-role guard, on a TypeScript-era clone.** The
guard recognizes a Mirror Mind checkout by the TypeScript package and its
front door, so this stages a production clone of that shape and points the
copy's `mirror` journey at it:

```bash
PROD="$NAV/prod-clone"; mkdir -p "$PROD/ts/src/frontDoor" && git -C "$PROD" init -q
cp ts/package.json "$PROD/ts/" && : > "$PROD/ts/src/frontDoor/cli.ts"
echo production > "$PROD/.mirror-clone-role"
mirror journey set-path mirror "$PROD"          # the copy's journey, not production's
mirror build load mirror; echo "exit=$?"
```

Expect `Builder Mode refused: the journey project clone is marked
'production'.` and exit 2.

Your real production clone, `~/dev/workspace/mirror`, is a Python-era
checkout, and the guard does **not** recognize it — an accepted known risk
until it takes the CV22 release ([F20](inventory.md#f20--the-clone-role-guard-does-not-recognize-the-production-clone),
Navigator, option b). `mirror journey set-path mirror ~/dev/workspace/mirror`
followed by `mirror build load mirror` shows the risk: the Builder banner,
exit 0.

**The verdict.**

```bash
wc -l < "$TS5_SHADOW_LOG"; cat "$TS5_SHADOW_LOG"
```

Nothing listed whose caller (after `<-`) is Mirror code: a hook wrapper under
`.claude/`, `.gemini/` or `plugins/`, `scripts/codex-mirror.sh`, the MCP
launcher, or a `node … ts/src/…` process. A spawn by a runtime's own
integration is recorded and attributed, not failed.

### The first walk (Navigator, 2026-09-25, at `7583384d`) — not accepted

| Step | Result |
|---|---|
| 0 | as expected |
| 1 — Pi | **pass** — the prompt and the answer are in the copy (`9bfc62e9`) |
| 2 — Claude Code | **fail** — [F21](inventory.md#f21--concurrent-writers-race-on-the-fixed-pre-write-snapshot): every prompt's hooks collided on the pre-write snapshot; the inject hook failed on two of three prompts, so their Mirror context was never injected |
| 3 — Gemini CLI | **not exercised** — Gemini CLI updated itself on launch and no prompt went through it; the "Hi" was sent to Antigravity CLI, which runs no Mirror hook |
| 4 — Codex | **pass**, twice (`de377c79`, `500b550b`: prompt and answer each) |
| 4b — no `node` | **pass** — hook exit 0, `hook_node_unresolvable`, the `hooks.log` line |
| 5 — MCP | **pass** — `0.31.14`, journeys listed |
| 6 — read back, isolation | Pi and Codex read back; the isolation query returned no rows. The copy also holds 24 Pi sessions from other projects, backfilled by session start from `~/.pi/agent/sessions` — expected (`PI_SESSIONS_DIR`), and noise for this query |
| 7–8 | **pass** — exit 1 and exit 2, as specified |
| 9 — old schema | **pass** — F19's line, 017 applied on open with its backup, then `nothing pending` and `current (17/17)` |
| 9b — replay | **pass** — identical |
| 10 — stale gate | **pass** |
| 11 — version | **pass** — `0.31.14` three times |
| 12 — clone guard | **fail**, as predicted — [F20](inventory.md#f20--the-clone-role-guard-does-not-recognize-the-production-clone) |
| verdict | five lines, **none from Mirror** (attributed below) |

Dispositions (Navigator, 2026-09-25): F21 fixed (`118d4a67`); F20 accepted
as a known risk, step 12 re-aimed at a TypeScript-era clone; step 3 skipped,
Gemini CLI being retired. The second walk covers steps 1, 2, 6, and 12 and
the verdict.

The five spawns, attributed after the fact — the stub did not yet record its
caller, and the evidence came from the runtimes' own logs:

- `python3 -`, three times: Herdr's agent-state `SessionStart` hooks, which
  Herdr installs for Claude Code (`~/.claude/hooks/herdr-agent-state.sh`) and
  Codex (`~/.codex/herdr-agent-state.sh`) and which run `python3 - <<'PY'` —
  one Claude session and two Codex sessions.
- `python3 -c …sys.executable…`, then `python -c …`: node-gyp's
  `find-python.js`, during Gemini CLI's self-update (`npm install --global
  @google/gemini-cli@0.61.0`, 07:36:49Z). It was building `node-pty`, an
  optional dependency; the build failed without Python, npm dropped it, and the
  update succeeded (exit 0) on the prebuilt `@lydell/node-pty`.

### The second walk (Navigator, 2026-09-25, at `ca6f9cba`) — accepted

| Step | Result |
|---|---|
| 0 | as expected |
| 1 — Pi | **not in the window** — the prompt was logged (`9fa2a50b`, user and assistant) with no `[WARN]` or `[ERROR]`, but the model was switched three times in the TUI first (09:46:16Z to 09:46:32Z), so `log-user` ran 51 s after `session-maintenance` started and 38 s after it finished. The race could not happen: this shows that Pi logs, not that F21's Pi half is fixed |
| 1 — Pi, repeated (10:07Z) | **pass, in the window** — the model given by `--model`, nothing touched before the prompt: `session-maintenance` started at 10:07:02.357Z and `log-user` at 10:07:02.371Z, 14 ms apart, closer than any of the twenty field losses. Both writers answered `exit=0` (`log-user` at 10:07:02.8Z; the maintenance at 10:07:06.6Z, with `Conversation maintenance complete.`); no `[WARN]`, `[ERROR]`, or `Error:` line; `020d047c` holds user and assistant, and the maintenance backfilled no Pi session, so `log-user` wrote it; no staging file was left behind |
| 2 — Claude Code | **pass** — every hook call answered `exit=0` in `front-door.log`, `hooks.log` stayed empty, and the follow-up was injected and marked (`runtime_sessions.hook_injected = 1`). That is the prompt that owes the injection, on which the logger and the inject hook open writable handles together — the shape that lost two injections in three on the first walk. The session opened with `/mm-mirror` rather than the runbook's `/mm:mirror`; Mirror Mode activated either way |
| 6 — read back, isolation | **pass** — `pi` (`9fa2a50b`) and `claude_code` (`130565e0`), each with user and assistant messages; the isolation query returned no rows. The Claude conversation starts at the follow-up: the slash command is not logged by design, and its answer predates the conversation, so the transcript backfill leaves it out — Python's rule, ported |
| 12 — clone guard | **pass** — refused, `exit=2` |
| verdict | one line, **not from Mirror** (below) |

The one spawn, `python3 - <- bash ~/.claude/hooks/herdr-agent-state.sh
session`, is Herdr's `SessionStart` hook, which ends in `python3 - <<'PY'`
under `set -eu`. The stub exits 66 with nothing on stderr, and that is the
`SessionStart:startup hook error` — *Failed with non-blocking status code: No
stderr output* — that Claude Code printed at launch. Mirror's own session
start answered `exit=0` at 09:47:40Z.

All three `mirror load --query` calls logged `reception outcome=empty`: the
live provider answered from inside the hooks and the parser accepted the
answer, whose result was empty. Not a failure, and not this story's.

Step 1's first attempt could not fail, so it was repeated rather than
counted: the walk is the Navigator's witness, beside the field evidence on the
real home ([F21](inventory.md#f21--concurrent-writers-race-on-the-fixed-pre-write-snapshot)). The repeat also showed that the runbook's check
could see only one of the two writers; it now reads the maintenance's outcome
too.

Navigator acceptance is recorded here with the date, the commit, and any
deviation.

**Accepted by the Navigator on 2026-09-25**, on the second walk: at
`ca6f9cba`, with step 1 repeated at `c440b4b6` — both documentation-only
after `118d4a67`, so the code walked is `118d4a67`'s. Deviations, each named:
step 3 skipped (Gemini CLI retired); step 12 run on a TypeScript-era
production clone, because the Python-era one is F20, an accepted known risk;
the Claude session opened with `/mm-mirror`; step 1's first attempt fell
outside the race window and was repeated; steps 4, 4b, 5, and 7–11 were not
repeated, by the Navigator's scope for the second walk, and stand on the
first. The Ariad checkpoint is [validation.md](validation.md).

## Validation Evidence

Pending implementation.

### Plateau 0 — closing parity record

**Taken 2026-09-23 at `2adf2951`** (tag `cv22-ts5-baseline`, tag object
`4e83c69e`). The last time these run as an oracle.

| Check | Result |
|---|---|
| Golden determinism (65 generators) | **64/65 byte-identical.** `task-import-sync.golden.json` differs by an embedded `mkdtemp` path — [F4](inventory.md#f4--task-import-syncgoldenjson-records-a-random-temp-path-and-nothing-gates-it), a fixture defect, not oracle drift. Regeneration reverted; tree left clean |
| Oracle-drift tripwire | clean — all ported Python oracles match the baseline |
| Retired surfaces (8 rows) | clean — journey-projections, web-console, compat-host, eval-harness, legacy-migration, journey-admin-verbs, conversation-metadata-backfill, sqlite-refinement-workbench all stayed retired |
| Skill command parity (Node) | clean — 25 skills agree, no copy invokes Python |
| **Python suite** | **2091 passed**, 308.74s |
| **TypeScript suite** | **2578 passed**, 34.3s, 0 failed |

The `cv22-last-python-bearing` tag is **not** taken here: it belongs at the
end of plateau 2, or recovery would discard the self-sufficiency work. See
[plan.md — Rollback](plan.md#rollback).

### Plateau 0 — the per-family capture

`tmp/ts5/capture-plateau0.tsv`, taken against a copy of the real database
(970 memories, 1068 conversations, 17 migrations, `PRAGMA integrity_check`
ok). The original was never opened by the capture.

- **29 families, 29 non-empty answers**, every one deterministic under
  `--selftest` (two runs, two fresh copies).
- File digest: `fc7fde5c6c2d7d8ef51c922726ef7072eca611f979e56572a2dfba3b4efdb799`
- Recorded per family: argv, exit code, stdout/stderr line counts, and
  `sha256` of each stream after normalization. **No output text.**

Two defects the self-test found in the instrument itself, both fixed before
the capture was taken:

1. the normalizer masked the repository root **before** the scratch work
   directory it contains, so the per-run tag survived into the hash and three
   families could not match themselves ten seconds apart;
2. stderr was discarded, so the two retired refusals and `build
   pull-candidates` hashed the empty string — blind to exactly the surfaces
   this story changes. Both streams are now hashed separately.

### Migration custody (fixtures)

**Plateau 1, `c8c74361`.** Both fixture-graded proofs pass with no Python
involved — the two the panel saved from deletion, and now the only structural
evidence that the sole custodian reproduces each migration step:

```text
node ts/parity/migration_structural_parity.ts   ->  334/334 checks passed
node ts/parity/bootstrap_custody_parity.ts      ->  BOOTSTRAP CUSTODY PARITY: PASS
```

Unit-level: migrate-on-open applies a Python-era migration it used to decline,
declines a file with no `_migrations` table, declines a database from a newer
core, and reports `nothing pending` untouched on a current one. `runtime
migrate` exits **1** on declined and **0** otherwise, end to end through the
real CLI, and the updater's migrate stage fails rather than passes.

**Still owed:** the real-shape pre-`015` database case (generate a demo
database at a pre-015 commit, migrate it forward, diff the schema). The
fixtures cover every transition structurally; this one covers a database whose
*schema* — not merely whose ledger — is old.

### Hook row-diffs (two families × five cases)

**Plateau 1, `bdd63e00`.** The cross-engine proof, possible only while both
engines exist:

```text
bash scripts/ts5/hook_rowdiff.sh --all "$PWD/tmp/ts5/pristine.db"

  claude   happy          identical      gemini   happy          identical
  claude   muted          identical      gemini   muted          identical
  claude   empty-prompt   identical      gemini   empty-prompt   identical
  claude   no-session-id  identical      gemini   no-session-id  identical
  claude   cp1252         identical      gemini   cp1252         identical

row diff: every family and case identical.
```

Two of the seven planned cases are not run and the reason is recorded rather
than left blank: `fast` (`session-start --fast`) and `rebackfill`
(`backfill-codex-session` twice) have no hook that carries them — the first is
a front-door flag with its own coverage, the second belongs to the Codex
wrapper, which is a wrapper rather than a stdin hook and is exercised by
`scripts/smoke_codex.sh`.

**The harness was wrong three times before it was right, and each time it made
the NEW code look guilty** — worth recording, because the failure mode of a
comparison is to indict the thing under test:

1. it ran Python without `PYTHONPATH`, so the oracle failed to import, wrote
   nothing, and the diff blamed Node for writing too much;
2. it masked ids with `\b`, which BSD sed does not support, so the ids it was
   meant to hide survived into the diff;
3. it omitted the **unconditional** `mirror load` the old Gemini script ran
   outside its logging guard.

Live verification on a real database copy, through the wrappers themselves:
`session-start` and `log-user-prompt` wrote the expected rows; `inject`
returned in 114 ms writing nothing on an ordinary turn; a payload with no
session id warned on stderr instead of silently no-op'ing.

### Capture replays so far

The baseline was re-taken at `cv22-ts5-baseline` through a git worktree after
the normalizer gained masks it was missing (commit, branch, clone role,
channel, and `pwd -P`). Digest
`0b7d2f2f77608a75edce765d220ff5e0307c17905a46966c23c4668188a8358c`.

| After | Result |
|---|---|
| `b2b16955` version/identity move | 29/29 identical |
| `c8c74361` migration custody | 29/29 identical |
| `bdd63e00` hook rewrite | 29/29 identical |

**What the first cross-commit replay taught, and `--selftest` cannot:**
`--selftest` runs twice seconds apart on the same commit, so anything varying
with TIME rather than with the run looks perfectly deterministic. `runtime
version` prints `Git commit:`. Only a replay across commits sees it.

### Flag-first pairwise (F5)

**Plateau 2, 2026-09-24**, on a generated demo home. 28 shapes: **26
identical** on exit code, stdout, stderr, and resulting rows — 18 reads
across seven families and 8 write invocations (`tasks add|done|doing|block|delete`,
`journey update`, `week save`, a not-found `done`), six of which changed
their copy identically on both engines while the other two wrote nothing on
either (no pending plan, no such task) — and **2 named deviations**, the
`tasks` argparse quirk ([F5](inventory.md#f5--valid-flag-first-invocations-reach-python-through-the-fallthroughs)).
**Interpreter spawns under the shadow: 0.**

**The harness reported a clean verdict twice before it was right**, both times
by comparing two things that had not happened — the failure mode of any
equality check, which is to be satisfied by two empty answers:

1. `MEMORY_ENV=test` selects `memory_test.db`, so both engines bootstrapped an
   empty database beside the copy and every row compared nothing. Now pinned to
   production on the scratch copies, and every row reports `read`/`wrote`.
2. Unsetting variables through `env` cannot exec the shell function that
   bounds each run, so both engines exited 127 and "agreed". 126/127 is now a
   `HARNESS` verdict that fails the run.

### Plateau 2 — the fallback is gone

**2026-09-24, at `52f295d5` and after.**

| Check | Result |
|---|---|
| Whole suite under the interpreter shadow | **2650 passed, 3 skipped, 0 spawn attempts** — the 3 are the opt-in extension-Python shim suite |
| Same, CI step | required since `52f295d5`; fails on a red suite **or** a non-empty stub log |
| `rg '"python"'` in `routing.ts`, `transport.ts`, `cli.ts` | nothing |
| Retired-surface guard (Node + Python) | clean, agreeing; the Node port also asks the router (F2) |
| Skill command parity; plugin builder | clean; byte-identical |
| Oracle drift | clean after three deliberate re-baselines (`runtime.py` for F7, `metadata_lifecycle.py` for D-023, `home_surface.py` for D-024), each one hash |
| Flag-first pairwise (F5) | 26/28 identical, 2 named deviations, 0 spawns — see above |
| Lifecycle smoke under the shadow | 164 checks pass; before F7 its only spawns were F7's probe |

**Per-family capture replay** (`tmp/ts5/capture-plateau2.tsv`, digest
`15a81d1c…`) against plateau 0: **27/29 identical.**

| Family | Result | Why |
|---|---|---|
| `unknown-command` | changed: 94 → 36 lines, exit 1 both | **D2 by design** — the TypeScript usage block replaces Python's |
| `build-pull-candidates` | changed: 258 → 251 lines | **the roadmap moved, not the engine** (below) |
| the other 27 | identical | — |

**The controlled comparison, and why the capture needs it.**
`build-pull-candidates` reads the journey's project — the real repository —
so its answer moves whenever the roadmap does, and TS5's own status changed
from "Planned" (a pull candidate) to "In Progress" (not one). The capture
cannot tell that from an engine change, so the arbiter is an experiment that
holds the documents still and varies only the engine: the plateau-0 engine
(a worktree at `cv22-ts5-baseline`, dependencies linked) and HEAD's, both
run by HEAD's capture script against the same `pristine.db` and today's docs.
**Byte-identical**, 253 lines each. The plateau-3 replay uses the same method
for every family that reads repository documents.

### Plateau 3 — the demo database, ported (slice G)

**2026-09-24, before any deletion.** `ts/smoke/generate_demo_memory_db.ts`
replaces the Python generator, pinned by `ts/test/smoke/demoMemoryDb.test.ts`
(9 tests, row by row). The cross-engine proof below could only be run while
Python existed, so it was run first:

```bash
uv run python ts/parity/generate_demo_memory_db.py --out tmp/ts5/demo-port/py.db
cp tmp/ts5/demo-port/py.db tmp/ts5/demo-port/pyhome/memory.db     # after a WAL checkpoint
MIRROR_HOME=$PWD/tmp/ts5/demo-port/pyhome node ts/src/frontDoor/cli.ts runtime migrate
node ts/smoke/generate_demo_memory_db.ts --out tmp/ts5/demo-port/ts.db
# then: PRAGMA table_info per table, sqlite_master indexes/triggers, a count
# per table, and every row of memories, memory_access_log, identity, tasks,
# consolidations, _migrations -- identity ids and write clocks masked
```

| Check | Result |
|---|---|
| Python database, migrated by TypeScript | `applied 1 migration(s)` — `017_journey_parent_column`, 16 → 17 |
| Structural schema (columns, indexes, triggers) | **identical** |
| Row count, every table, FTS shadow tables included | **identical**, 28 tables |
| Rows, ids and clocks masked | **identical**, 68 lines |
| `PRAGMA integrity_check` | `ok` on both |

The comparison is against the Python database **after** TypeScript's first
open, because that is the only state any consumer ever saw: the Python
generator stopped at the last migration Python knew. The TypeScript generator
is born current, and writes the `parent_journey` projection the backfill would
have written.

That difference had one consumer that cared. `smoke_runtime_update.sh`
promises "a real migration applying in a fresh process", which was true only
because the Python database was one migration behind. The smoke now regresses
`017` to the shape a Python-written database really had — index, column, and
ledger row, the schema and not only the ledger — and still observes it
applied: **34/34, ledger 16 → 17**, with `python`/`python3`/`uv` shadowed.

### Plateau 3 replay

**2026-09-24, at `a4459a67`** — F.1 through F.4 deleted, slice G landed; the
six fixture bodies and `pyproject.toml` still tracked (D10, D11).

```bash
bash scripts/ts5/capture_family_outputs.sh "$PWD/tmp/ts5/pristine.db" \
  > tmp/ts5/capture-plateau3.tsv
diff tmp/ts5/capture-plateau2.tsv tmp/ts5/capture-plateau3.tsv   # empty
```

| Against | Result |
|---|---|
| plateau 2 | **29/29 identical** — the two files have the same digest, `15a81d1c…` |
| plateau 0 | 27/29, the same two differences plateau 2 explained: `unknown-command` (D2) and `build-pull-candidates` (the roadmap moved) |

No controlled comparison was needed: `build-pull-candidates` reads the
repository's roadmap, and this plateau edited roadmap documents (the spike
links), but its bytes did not move against plateau 2.

### Plateau 3 — the rest of the pre-push set

| Check | Result |
|---|---|
| Suite under the interpreter shadow | **2627 passed, 3 skipped, 0 spawn attempts** |
| `tsc`, Biome | clean (the one warning and one info are pre-existing) |
| Retired surfaces (8 enforced rows), docs links, skill parity, plugin build | clean; in sync |
| Custody proofs (`ts/smoke/`) | `MIGRATION PARITY: PASS`, `BOOTSTRAP CUSTODY PARITY: PASS` |
| Migrate-on-open, demo copy | `RESULT: PASS` |
| Conversation, builder, extension-catalog lifecycle smokes | pass; the builder one 54/54 and fails on a flipped expectation |
| `smoke_runtime_update.sh` | **34/34**, ledger 16 → 17, interpreter shadowed |
| `smoke_codex.sh`, `smoke_gemini_cli.sh`, `smoke_mirror_mcp.sh`, `smoke_claude_plugin.sh`, `smoke_external_review_copy.sh`, `mcp_guard_probe.sh` (keyless) | pass, on the front door |

The Gemini smoke is the one that found [F11](inventory.md#f11--gemini-assistant-turns-were-dropped-since-plateau-1):
at `cv22-ts5-baseline` it passes with two messages, at
`cv22-last-python-bearing` it fails with one, and since `a9c7ddde` it passes
again.

The plateau-3 gate and its seeded regressions ran after D10–D12; see the next
section.

### Plateau 3 — decisions D10–D12, the gate, and the close

**2026-09-24, `9c6aad58` to `20fc4e73`**, after the Navigator took D10–D12 as
recommended.

**D10** (`9c6aad58`). Eight new tests pin the entrypoint contract: absent is
valid, an empty `entrypoint:` is absent, a declared one is validated exactly as
before (module path appended; missing module and missing file refused), and
the extension template, filled in as an author would, validates with no Python
in it. Two mutations of the template fail that test: a dashed `table_prefix`,
and an entrypoint declared without its file.

**D11** (`f3786782`). The updater smoke clones the committed tree, so it was
re-run after the commit: **34/34** with no `pyproject.toml` in the clone. The
Frame's `version-sync` and `root-resolve` tests pass, 8/8.

**D12** (`02b562fe`, `20fc4e73`). The replay's one moved family, compared on
the same database copy against the tree before the change:

```text
< uv run python -m memory build load <journey>
> mirror build load <journey>
```

**The gate:**

| Check | Result |
|---|---|
| `git ls-files '*.py'` | **0** |
| `pyproject.toml`, `uv.lock` | absent |
| workflows matching `setup-python`, `setup-uv`, `uv sync`, `uv run`, `pytest`, `ruff` | none |
| `checkRetiredSurfaces.ts` | clean, **`python-core` enforced** (nine rows); `python-core-mentions` staged until plateau 4 |
| docs links, skill parity, plugin build | clean; in sync |
| `tsc`, Biome | clean |
| suite under the interpreter shadow | **2642 passed, 0 skipped, 0 spawn attempts** |

**Seeded regressions, on the real tree** — staged, because the sweep reads the
git index; an unstaged seed is invisible to it and proves nothing:

| Seed | Result |
|---|---|
| `src/memory/__init__.py` | exit 1, named |
| `pyproject.toml` | exit 1, named |
| a `.py` fixture under `ts/test/fixtures/`, a path no list names | exit 1, named |
| `actions/setup-python` in `tests.yml` | exit 1, named with its line |
| `python3 -m memory backup --silent` appended to a plugin hook | the guard passes — mentions are staged until plateau 4 — and **the hook suite fails** (`none of them INVOKES an interpreter`), which covers that half until then |

**The closing replay** (`tmp/ts5/capture-plateau3-close.tsv`, digest
`00e015aa…`): against the plateau-3 start, **28/29 identical**, the one
difference D12's `build inspect-method` line above. Against plateau 0, the
same plus the two differences plateau 2 explained.

Smokes: custody proofs, migrate-on-open, the three lifecycle smokes, and every
runtime smoke pass; the updater 34/34.

### Plateau 4 — Recorded

**2026-09-24, `c7efc712` to the records commit.**

**The mentions half of the gate.** The sweep of `python-core-mentions` over
the tracked tree:

| When | Files reported |
|---|---:|
| end of plateau 3 (the row's own count, from the handoff) | 79 |
| start of plateau 4, measured | 63 |
| after the code, tests, and templates (`c7efc712`) | 27, all documentation |
| after the documentation (`b239ee5d`) | **0** |

Then the row went live (`98e95f54`). **Seeded regressions on the real tree,
staged:**

| Seed | Result |
|---|---|
| `python3 -m memory backup --silent` appended to `plugins/mirror-mind/hooks/session-start.sh` | exit 1, named: `session-start.sh:38`, the `python3 -m memory` pattern |
| an inline `uv run python -m memory seed` appended to `docs/getting-started.md` | exit 1, named with its line |
| `from memory.cli import main` in a new `ts/src/util/` file | exit 1, named with its line |
| each seed removed | clean, ten rows |

**The pre-push set.**

| Check | Result |
|---|---|
| Suite under the interpreter shadow | **2645 passed, 0 skipped, 0 spawn attempts** |
| `tsc`, Biome | clean (the one warning and one info are pre-existing) |
| Retired surfaces (ten enforced rows), docs links, skill parity, plugin build `--check` | clean; in sync |
| Custody proofs (`ts/smoke/`) | `MIGRATION PARITY: PASS`, `BOOTSTRAP CUSTODY PARITY: PASS` |
| Demo database, migrate-on-open, conversation, builder, and extension-catalog smokes | pass — the exact command list the development guide now publishes, each run once from the repository root |
| `smoke_codex.sh`, `smoke_gemini_cli.sh`, `smoke_mirror_mcp.sh`, `smoke_claude_plugin.sh`, `smoke_external_review_copy.sh` | pass |

**The replay** (`tmp/ts5/capture-plateau4.tsv`, digest `00e015aa…`):
**29/29 identical** to the plateau-3 close — the same digest. Plateau 4 changed
two product bytes on purpose, and neither is in a captured family: D13 is the
`build plan-item` scaffold, graded instead by the hand-edited
`builder-command` golden; the identity template is read only by `init`.

**Goldens.** One hand edit, recorded in `ts/test/goldens/README.md`:
`builder-command` loses the scaffold's `uv` line six times (D13).

**F19, after the Navigator chose (a).** Red first: with the fixtures' current
databases carrying 017 and the two goldens hand-edited, three status tests and
one diagnose test failed against the old grader; deleting `ORACLE_ERA_ONLY`
turned them green. Then:

```bash
mirror runtime status | grep "Core migrations"      # current (17/17) on a current home
# a missing database: attention needed (unknown/17 applied; database missing)
```

| Check | Result |
|---|---|
| Suite | **2646 passed** (one new test: the fixtures' current database is every known migration) |
| `runtime-status` golden | 26 scenarios hand-edited, one render line each; `python_current` two lines and its verdict; `ts_migrated` untouched |
| `runtime-diagnose` golden | two scenarios gain the 017 finding |
| `smoke_runtime_update.sh` | **34/34**, and it shows F19 working as designed. The smoke regresses 017 on purpose so the update has one real migration to apply. Before F19 its status gate called that database ready; now it reads `[✓] status gate: update-safe preflight drift (pending core migrations: 017_journey_parent_column)` — the narrow lane the updater keeps for exactly this case — and the ledger goes 16 → 17 |

### Navigator route

Pending.
