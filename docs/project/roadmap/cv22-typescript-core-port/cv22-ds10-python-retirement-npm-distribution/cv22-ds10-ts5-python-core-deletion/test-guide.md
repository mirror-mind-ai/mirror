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
line naming the file:

```bash
mkdir -p src/memory && echo 'x = 1' > src/memory/__init__.py && node ts/scripts/checkRetiredSurfaces.ts; rm -rf src
echo 'python3 -m memory backup' >> plugins/mirror-mind/hooks/session-start.sh && node ts/scripts/checkRetiredSurfaces.ts; git checkout plugins/
echo 'version = "0.0.0"' > pyproject.toml && node ts/scripts/checkRetiredSurfaces.ts; rm pyproject.toml
```

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

Expected: exactly two files changed — `metadata-lifecycle.golden.json`
(D-023) and the extension-catalog fixture golden (F.5) — each with a header
comment naming this story and the reason.

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

Navigator acceptance is recorded here with the date, the commit, and any
deviation.

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

### Migration custody (fixtures, plus the pre-`015` case)

Pending.

### Hook row-diffs (four families × seven cases)

Pending.

### Plateau 3 replay

Pending — the `diff` of `capture-plateau0.tsv` against `capture-plateau3.tsv`.

### Navigator route

Pending.
