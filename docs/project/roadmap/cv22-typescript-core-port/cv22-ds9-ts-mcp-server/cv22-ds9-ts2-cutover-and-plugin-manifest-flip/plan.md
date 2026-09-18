# Plan — CV22.DS9.TS2

## Objective

Make the TypeScript MCP server the one the plugin manifest launches, with a revert the
user can perform without editing an installed plugin — and, before the flip, settle how
that server opens its database, because US2's read-only decision (D12) left two parity
gaps that would go live with the manifest: the server does not migrate on open, and an
agent-initiated search records no `llm_calls` row. TS1's wallet guard counts from that
row. This story closes both gaps or records, in writing, why one stays open.

---

## Terrain (facts read from code and measured, not from the index)

1. **Python opens writable, ungated, and migrates on open.** `serve()` constructs
   `MemoryClient()`, whose `get_connection` takes the bootstrap lock, switches to WAL if
   needed, runs migrations and the schema DDL, and hands back a writable connection with
   no backup. The TS server (`ts/src/mcp/main.ts`) opens **read-only** and calls neither
   `bootstrapDatabaseIfMissing` nor `ensureMigratedOnOpen`. A TS-authored migration that
   is pending when a client spawns the server would surface as a tool error on the first
   read that touches the new shape — Python would have applied it. **Gap one.**
2. **Python records the agent's search as spend; TS does not.** `_search_memories` →
   `client.search` → `MemoryService.search` builds `build_llm_logger(role="embedding")`
   and writes one `llm_calls` row per query search (bodies withheld in `metadata` mode,
   fail-soft, `commit=True`). TS passes `recordEmbeddingLedger: false` because its handle
   cannot write. **Gap two** — the one TS1 is blocked on.
3. **The DS4 backup gate assumes a short-lived process.** `ensureBackup` replaces a
   fixed-name snapshot and `openDatabaseForWrite` verifies that record **once, at open**.
   Every existing TS live write is a CLI invocation: snapshot → write → exit, so the
   snapshot is the state immediately before the write and the file is "a last-write undo,
   not an archive" (`liveBackup.ts`). An MCP server lives for the whole client session.
   A snapshot taken at launch is not the state before a ledger row written forty minutes
   later, and nothing re-verifies it. So option (a) from D12 — backup-gated writable at
   launch — is not only **399 ms and 49.3 MB per launch** (US2's measurement); it applies
   the gate's undo semantics where they do not hold. The gate is not the wrong price
   here. It is the wrong shape.
4. **The only write this server would ever perform is one append-only INSERT.**
   `logLlmCall` runs a single parameterized `INSERT INTO llm_calls`, inside a
   `try/catch` that swallows failure. `logAccess` is `false` for `search_memories`
   (AI-12), and `mirror_context` writes zero `memory_access_log` rows (US2 D6, measured).
   No tool path reaches an UPDATE, DELETE, or DDL.
5. **The manifest is generated, not hand-edited.** `plugins/mirror-mind/.claude-plugin/
   plugin.json` is materialized by `src/memory/plugins/claude.py::build_manifest()`, and
   `tests/unit/memory/plugins/test_claude.py` is a CI drift guard. The flip is an edit to
   the generator plus a regeneration — an edit to `plugin.json` alone fails CI.
   `plugins/claude.py` is not an oracle-baseline file; no re-baseline is involved.
6. **The plugin contract has no TS analog of "installed" until DS10.** CV21's hooks are
   `${CLAUDE_PLUGIN_ROOT}/hooks/*.sh` bash scripts with no repo-cwd assumption, resolving
   `python3 -m memory` as an installed package. The TS core is reachable only from the
   repository checkout, and the plugin directory lives inside that checkout
   (`plugins/mirror-mind`, loaded with `claude --plugin-dir`). Python's own portability
   trick is instructive: `config.py` finds `.env` by walking **upward from its own file**,
   not from cwd. A launcher that resolves the repository from its own location is
   cwd-independent in exactly the same way, and it is the one file DS10 rewrites for npm.
7. **The client's environment is not the skill's environment.** Every skill invokes the
   front door with `node --env-file=.env` from the repo cwd. An MCP client spawns the
   server with the client's environment: no `.env`, no `NODE_OPTIONS`, whatever cwd the
   session has. Python survives this through fact 6's walk-up with `setdefault`
   semantics. Node 24+ has `--env-file-if-exists`, and its documented precedence is the
   same — a variable already in the environment wins over the file.
8. **`initialize` would report a different version.** Python's `serverInfo.version` is
   `importlib.metadata.version("mirror")` = `0.31.14` (measured under `uv run` and under
   bare `python3` with `src` on `PYTHONPATH`). TS reports `MIRROR_MCP_VERSION ?? "0.0.0"`
   — the two-engine diff passes only because the script exports the Python value into
   the TS process. Nothing sets it for a client. `ts/src/runtime/git.ts` already carries
   `versionFromPyproject(start)`, the port of Python's `_version_from_pyproject`.
9. **Nothing consumes the manifest today, measured.** `~/.claude/plugins/installed_plugins.
   json` lists no `mirror-mind`; `~/.claude.json` has no `mcpServers`. The DS9 index's
   "Claude is the only production consumer" is the upper bound; the Navigator's actual
   exposure is zero sessions. The flip changes what a future `--plugin-dir` load launches.
   That makes the scripted diff the only evidence that will ever exist unless a session is
   opened on purpose — which the DS9 validation approach already says.
10. **Two connections make the read-oracle posture physical, not typed.** `Database` and
    `WritableDatabase` are structural types; a writable handle passed where `Database` is
    expected still answers `asWritable()`'s runtime check (`typeof db.exec ===
    "function"`) and would write. The US2 guarantee — "it cannot write even if a tool
    tried" — holds today because the driver was opened `readOnly: true`. Keeping that
    handle for the tools and opening a **second** connection for the ledger keeps the
    guarantee at the driver level rather than demoting it to a type annotation.
11. **The revert gates all live in `routing.ts`**, parsed as `"0"` → Python, `"1"` or
    unset → TS (`gateEnabled`). The MCP server is not a front-door route; nothing in
    `routing.ts` will read `MIRROR_TS_MCP`. The launcher is the only reader, and its parse
    must match that convention so the DS7 revert reflex transfers unchanged.
12. **The revert restores a contract this machine does not meet.** From `/tmp`, bare
    `python3 -c "import memory"` fails with `ModuleNotFoundError` on the Navigator's
    machine (measured; `python3` is mise's 3.14). CV21's plugin contract — `memory`
    installed and importable — is unmet here, so the manifest's *current* entry,
    `python3 -m memory mcp`, does not start for the Navigator today. The launcher's
    Python branch restores exactly that entry; its precondition is CV21's, not this
    story's. The TS branch, resolving the repository from its own location, needs no
    installed package — which means the flip is the first time a plugin load of this
    server would work on this machine at all.
13. **The scripted smoke largely exists.** `scripts/mcp_two_engine_diff.sh` feeds one
    transcript to both engines over the golden's fixture; `scripts/mcp_real_copy_probe.sh`
    runs twelve deterministic tool variants through both engines on a `VACUUM INTO` copy
    of a real database and compares hashes, then asserts neither engine wrote. Both spawn
    `node ts/src/mcp/main.ts` directly. Neither exercises the thing the manifest will
    actually run. TS2's smoke is those two harnesses pointed at **the launcher**, plus the
    revert branch, plus the ledger assertion that US2's probe deliberately proved absent.

---

## Decisions Taken At Plan Time

**D1 — The database-open decision (inherited from US2 D12): two connections.**
*Decided 2026-09-18: option (C), two connections — the Navigator accepted the
recommendation. Plan approved the same turn.*

- **(RO) Stay read-only, uncounted.** Rejected: it is a permanent parity regression
  against fact 2, and the DS9 index already ruled that guard state lives in the
  cross-process `llm_calls` ledger, so TS1 stays blind for good.
- **(A) Backup-gated writable at launch.** Rejected by fact 3: the price is real and the
  semantics are wrong for a session-long process.
- **(A′) Backup-gated writable per write** — snapshot immediately before each ledger
  insert. Honest with the gate, and 399 ms plus a 49.3 MB snapshot on the response path
  of every agent search, each one overwriting the front door's last-write undo with a
  snapshot whose "last write" is an observability row. Rejected.
- **(C) Two connections, one of them narrow. Recommended.** The tools keep the
  driver-level read-only handle exactly as US2 left it. The embedding-ledger hook gets
  its own connection, opened lazily on the first query search and held for the process
  lifetime, through a new seam function whose returned handle **can only run
  `INSERT INTO llm_calls`** — `prepare` refuses any other statement text and `exec` is
  not exposed. The DS4 gate protects live writes that can destroy user data; an
  append-only insert into an observability table, executed through a connection that
  cannot form any other statement, is a different risk class, and saying so in
  `database.ts` and in `decisions.md` is the "narrowing written down" that US2 asked for.
  It also restores parity with fact 2: Python records the row; so will TS.

  Two properties are pinned by tests, not comments: the tools' handle still refuses a
  write at the driver level (US2's test stays), and the ledger handle refuses everything
  except the ledger insert (a new test tries a `DELETE`, an `UPDATE`, a second table, a
  `DROP`, and a `BEGIN` through it and expects each to throw before the driver is
  reached — transaction control is a write the allowlist must refuse too).

  **The handle never leaves `main.ts`.** The tool receives a *function* —
  `embeddingLedgerHook(ledgerDb)` — through `ToolRuntime`, whose type carries no
  `WritableDatabase`. A future tool cannot reach the connection to write an
  agent-influenced value into `llm_calls`; it can only cause the one row the hook
  writes, with bodies withheld unless `MEMORY_LOG_LLM_CALLS=full` (same policy as Python).

  **The row is written at parity, unattributed.** Python's MCP row has
  `conversation_id NULL, session_id NULL` — indistinguishable from a front-door
  `memories --search` row or an extraction row. TS writes the same. That means the ledger
  TS1 reads cannot tell MCP spend from other embedding spend; if TS1 needs attribution
  (a `session_id` marker, say), that is TS1's divergence to decide and record, not one
  this story absorbs while restoring parity. Named here because the row TS2 writes is the
  row TS1 counts.

  The ledger connection inherits the seam's 30 s `busy_timeout` and `logLlmCall`'s
  fail-soft posture, both matching Python. A ledger insert blocked by a concurrent writer
  therefore waits as Python's does, on the agent's response path; the panel weighed a
  shorter timeout and left it as a TS1 input rather than a divergence absorbed here.

**D2 — Migrate on open, as the front door and Python both do.** `main.ts` calls
`bootstrapDatabaseIfMissing` and `ensureMigratedOnOpen` before opening the read-only
handle — the same pair `cli.ts::ensureDatabaseReady` composes. The pure composition
(bootstrap, then migrate, returning the `MigrateOnOpenResult`) is extracted beside
`migrateOnOpen.ts`; each caller owns its own note — the CLI keeps writing the front-door
log, the MCP entry writes stderr — so nothing is parameterized on a logger. Steady-state
cost is one read of `_migrations`; a pending migration takes its backup under the
bootstrap lock, which is the DS6 contract and happens once per migration, not per
launch. When a migration is applied at MCP launch, one metadata-only line goes to stderr
(`migrate_on_open applied=<ids> backup=<basename>`), the same text the front-door log
records. stderr is otherwise unchanged and the harness keeps asserting it empty in
steady state.

**D3 — The launcher is a bash script inside the plugin, and it `exec`s.** D5 chose a
launcher-level bridge over a documented manifest edit; it sized that bridge as "one
`spawnSync`". Implementing it as `plugins/mirror-mind/mcp/launch.sh` is smaller and
strictly better on the property D5 was protecting — a revert that works under pressure:

- `exec` replaces the launcher with the server, so there is no intermediary process to
  orphan, no signal to forward, and the PID the client holds is the server's;
- it lives beside `hooks/*.sh`, which are already hand-authored bash plugin source under
  the same `${CLAUDE_PLUGIN_ROOT}` convention (fact 5–6), so it is not a new kind of file;
- it resolves the repository from its own location (`$(dirname "$0")/../../..`) — the
  Python-`config.py` trick, cwd-independent — and that self-relative path is the single
  line DS10 replaces with the npm bin. The manifest itself carries no repository path,
  which is what the DS9 ↔ DS10 seam boundary forbids.

The gate reads exactly as `routing.ts` does: `MIRROR_TS_MCP=0` → `exec python3 -m memory
mcp`; anything else → `exec node --env-file-if-exists="<repo>/.env"
"<repo>/ts/src/mcp/main.ts"`. `NODE_OPTIONS` is not set — `main.ts` already suppresses
the `node:sqlite` warning in-process for precisely this reason.

**The gate is honored from `.env` too, with environment precedence.** Every other
`MIRROR_TS_*` gate works from `.env` because `node --env-file` loads the file before
`routing.ts` reads it; the DS8 validation holdback was literally commented gates in
`.env`. The launcher decides *before* node exists, so without this the one gate the user
reaches for under pressure would be the one that ignores the file. The launcher reads
the single key with `grep`/`sed` — it never `source`s `.env`, which would execute
arbitrary shell — and the process environment wins when both are set, matching Node's
and Python's `setdefault` precedence.

**What the revert restores is CV21's contract, unmet on this machine (fact 12).** The
Python branch is `exec python3 -m memory mcp`, byte-identical to today's manifest entry.
For the Navigator it currently fails with `ModuleNotFoundError`; that is the status quo
the revert returns to, and the smoke runs that branch under the same stand-in
`scripts/smoke_claude_plugin.sh` uses (venv bin on `PATH`, `src` on `PYTHONPATH`), stated
as such. Fixing the contract is CV21's, recorded as debt below.

**Failure is clear, not silent.** `node` missing from the client's `PATH` → `node:
command not found` on stderr and a non-zero exit the client reports; Node below 22.9 →
`bad option: --env-file-if-exists`, exit 9; no `.env` and nothing in the environment →
`main.ts` exits 2 with `Mirror home is not configured`. Each lands in the client's MCP
log. The prerequisites (`node` ≥ 24 on `PATH`, `.env` or environment configured) go in
`docs/reference/configuration.md` beside the gate.

The manifest entry becomes `"command": "${CLAUDE_PLUGIN_ROOT}/mcp/launch.sh"` with no
`args`, edited in `build_manifest()` and regenerated. `claude plugin validate` must
accept the variable in `mcpServers.command`; if it does not, that is a stop condition,
not something to work around with a repository path.

**D4 — `serverInfo.version` falls back to `pyproject.toml`, not `0.0.0`.** When
`MIRROR_MCP_VERSION` is unset, `resolveServerVersion` uses `versionFromPyproject`
walking up from `main.ts`'s own directory — which is what Python's metadata lookup
resolves to in every environment measured (fact 8). No new mechanism; DS10 re-points it
at `package.json` when npm owns the version. The two-engine diff stops exporting
`MIRROR_MCP_VERSION` so the diff proves the fallback rather than masking it.
`versionFromPyproject` moves out of `runtime/git.ts` into a `runtime/version.ts` of its
own (re-exported from `git.ts` so nothing else moves): the MCP server should not import
the git module to learn a version.

**D5 — Blast radius is recorded as measured, and the session proves which engine ran.**
Zero installed consumers (fact 9). The "one real Claude session" is therefore opened on
purpose with `claude --plugin-dir plugins/mirror-mind` against a database copy, and the
story records that the manifest's first real launch after the flip *is* that session.
D4 makes the two engines **indistinguishable at `initialize` by design** — right for
parity, useless as evidence. So the session's proof is process-level: while it is open,
`ps` shows `node … ts/src/mcp/main.ts` as the child of the client (and, in a second
control session with `MIRROR_TS_MCP=0`, `python3 -m memory mcp` instead — or the
revert's `ModuleNotFoundError` in the client's MCP log, which is fact 12 observed live).
Both observations are written into `validation.md`.

**D7 — The threat model is amended, not left stale.** US1's `plan.md` says this server
cannot write. After D1 it can append one row. The artifact gains a paragraph: the single
sanctioned write, its statement-level allowlist, that the connection never leaves the
entry point and the tools receive only a function, and the body-withholding policy. DS9's
Done condition cites that artifact as reviewed by the security and AI lenses; a
decision that changes it must land in it.

**D6 — Nothing in Python changes.** No oracle file moves; `plugins/claude.py` is
generator code, not an oracle. `scripts/smoke_mirror_mcp.sh` keeps driving
`python3 -m memory mcp` directly — it is CV21's proof that the Python server works, and
that server stays until DS10.

---

## Scope

Four plateaus. The first two are the database-open decision made real; the last two are
the flip and its evidence.

**Plateau 1 — The narrow ledger connection.** In `ts/src/db/database.ts`, a seam
function that opens a live database writable *without* the backup gate and returns a
handle that can prepare only `INSERT INTO llm_calls` statements — name and doc comment
state the single sanctioned caller and why the gate does not apply. In
`ts/src/search/memorySearch.ts`, `recordEmbeddingLedger?: boolean` widens to
`boolean | ((info: EmbeddingAttemptInfo) => void)`: `true`/unset narrows `db` as today,
`false` records nowhere, a function is the sink — no rename, no new concept, every
existing caller unchanged. `main.ts` builds `embeddingLedgerHook(ledgerDb)` and
`searchMemoriesTool` passes it from `ToolRuntime`, so the search module never learns a
second handle exists. Tests: the narrow handle refuses every non-ledger statement
(including `BEGIN`); a query search under a replay provider **that reports non-null
usage** writes exactly one `llm_calls` row with `role=embedding`, Python's embedding
model string, empty bodies, `cost_usd` **numerically equal** to what the single cost
authority computes for that usage (a null-usage replay would pass "cost computed"
vacuously), and null conversation/session — and the tools' read-only handle still
throws on a write. Mutation: a handle that lets a `DELETE` through must fail the test;
a row with `cost_usd` null must fail it.

**Plateau 2 — `main.ts` opens like Python.** Extract `ensureDatabaseReady` from `cli.ts`
into `ts/src/db/` (or beside `migrateOnOpen.ts`), parameterized on where the
migration note goes, so the CLI keeps writing the front-door log and the MCP entry
writes stderr. `main.ts` calls it, opens read-only for the tools, and builds the
ledger sink lazily. `resolveServerVersion` gains the D4 fallback. Tests: a fixture with
a pending TS-authored migration, spawned through `main.ts`, applies it (row in
`_migrations`, one stderr line, `initialize` answered); a current fixture leaves stderr
empty; `initialize` reports the pyproject version with `MIRROR_MCP_VERSION` unset.

**Plateau 3 — The launcher and the flip.** `plugins/mirror-mind/mcp/launch.sh` (D3);
`build_manifest()` and its drift-guard test updated; manifest regenerated;
`claude plugin validate` run. `docs/reference/configuration.md` gains the `MIRROR_TS_MCP`
row in the same table as the other revert gates, plus the prerequisites; REFERENCE.md's
runtime notes and CV21.E2's package get the inbound note D2-of-DS9 asked for; US1's
threat model gets D7's paragraph. Tests — a Node test that spawns the script from a cwd
that is **not** the repository, with a controlled environment:
- default → the TS server answers (graded by *which process* answered, e.g. a
  `MIRROR_MCP_VERSION` marker that only the TS branch can see — not by `serverInfo`,
  which D4 makes identical);
- `MIRROR_TS_MCP=0` in the environment → the Python branch is taken (graded against a
  stub `python3` on `PATH` that records its argv, so the test needs no installed
  `memory`);
- `MIRROR_TS_MCP=0` in `.env` only → the Python branch is taken;
- `MIRROR_TS_MCP=0` in `.env` and `MIRROR_TS_MCP=1` in the environment → TS (environment
  wins);
- a variable set in both `.env` and the environment reaches `main.ts` with the
  environment's value (`--env-file-if-exists` precedence, asserted, not assumed).

**Plateau 4 — The scripted smoke, then one session.** `scripts/mcp_two_engine_diff.sh`
and `scripts/mcp_real_copy_probe.sh` gain a mode that spawns **the launcher** instead of
`main.ts`, and the diff runs three ways: launcher default (TS), launcher with
`MIRROR_TS_MCP=0` (Python), and the recorded Python baseline. The real-copy probe adds
one query call through the launcher on TS and asserts **exactly one** `llm_calls` row
appeared and nothing else changed — the inverse of US2's "neither engine wrote", and the
proof that the D1 narrowing writes only what it claims. Then the D5 session, observations
written into `validation.md`.

---

## Non-Goals

- Argument validation, limit caps, rate or budget guards, refusal wording (TS1).
- Any change to `src/memory/mcp/`, to the Python server's open, or to the oracle baseline.
- Plugin structure, versioning, marketplace, propagation to Codex/Antigravity/Grok (CV21).
- Deleting `src/memory/mcp/`, the npm entry point, `package.json` versioning (DS10).
- A general-purpose ungated writable open. The narrow handle admits one statement shape.
- Making the plugin's *skills* cwd-independent (they call `ts/src/frontDoor/cli.ts`
  relative to cwd — a CV21 portability gap this story observes and records, not fixes).

---

## Acceptance Behavior

```text
Given the plugin manifest as CV21 generates it and a database copy
When  an MCP client spawns the manifest's command from any cwd
Then  the TypeScript server answers, initialize reports the pyproject version,
      and every response on the recorded transcript is byte-identical to the
      Python baseline (within US2 D10's score tolerance)
And   with MIRROR_TS_MCP=0 the same command answers from the Python server
And   a query search through TS writes exactly one llm_calls row and no other
      row, while the tools' handle still cannot write at all
And   a pending TS-authored migration is applied at launch, once, with a
      backup, and a current database launches with empty stderr
And   src/memory/mcp/, the oracle baseline, and every sibling story are untouched
```

---

## Validation Route

**Automated (CI):** `npm run typecheck && npm run lint && npm test` in `ts/`;
`uv run pytest tests/unit/memory/plugins`; determinism gate unchanged (no golden changes);
oracle drift green with no re-baseline.

**Navigator-visible route** (`test-guide.md` carries it as commands):

1. `scripts/mcp_two_engine_diff.sh --launcher` — the launcher, both branches, against
   the golden transcript. Expect two empty diffs and `initialize` carrying `0.31.x`.
2. `scripts/mcp_real_copy_probe.sh --launcher` on a copy of the Navigator's `memory.db`
   — twelve deterministic variants identical across engines, then one query search on
   TS: expect `llm_calls +1, everything else +0`, hashes only, no content.
3. From `/tmp` (not the repo): the default launcher fed `initialize` answers with
   `0.31.x` and `ps` shows `node … main.ts`; `MIRROR_TS_MCP=0 <plugin>/mcp/launch.sh`
   under the plugin-contract stand-in answers from Python; the same without the stand-in
   shows fact 12's `ModuleNotFoundError` — the revert's real precondition, observed.
4. One Claude session: `DB_PATH=<copy> claude --plugin-dir plugins/mirror-mind`;
   `tools/list` compared with the baseline, one call per tool, one malformed call, and
   `ps` during the session showing the node process as the client's child. A second,
   short control session with `MIRROR_TS_MCP=0` showing the Python process (or the
   contract failure in the client's MCP log). The guarded call the DS9 index lists is
   TS1's and is recorded as not yet applicable.

Expected observation: empty diffs, the single ledger row, the right engine on each
branch proven at process level, a working session. Pass: all four. Fail: any byte
difference outside the D10 score field, any row other than the one `llm_calls` insert,
any write through the tools' handle, the wrong engine on either branch, a `.env`-only
gate that is ignored, or a validator that rejects the manifest.

**E2E decision: required — step 4 is it.** This is the story that makes the surface
live, and it is the first CV22 surface with no dogfooding path; the scripted diff is
necessary and the session is the end-to-end.

---

## Implementation Contract

- Files: `ts/src/db/database.ts`, `ts/src/db/` (extracted ready-on-open composition),
  `ts/src/search/memorySearch.ts`, `ts/src/mcp/main.ts`, `ts/src/mcp/serve.ts`,
  `ts/src/mcp/tools/providerCrossing.ts`, `ts/src/runtime/version.ts` (moved from
  `git.ts`, re-exported), `ts/test/mcp/`, `ts/test/db/`,
  `plugins/mirror-mind/mcp/launch.sh`, `src/memory/plugins/claude.py`,
  `plugins/mirror-mind/.claude-plugin/plugin.json` (regenerated),
  `tests/unit/memory/plugins/test_claude.py`, `scripts/mcp_two_engine_diff.sh`,
  `scripts/mcp_real_copy_probe.sh`, `docs/reference/configuration.md`, `REFERENCE.md`,
  `docs/project/decisions.md`, CV21.E2's index (inbound note), US1's `plan.md` (threat
  model amendment, D7), this package.
- `uv run` for Python; Node 24 `node --test` for TS; `claude plugin validate` where
  `claude` is present.
- No `git add .`; one commit per plateau; descriptive English messages explaining why.
- Real database copies are never committed and the probe prints no content.

---

## Stop Conditions

- `claude plugin validate` rejects `${CLAUDE_PLUGIN_ROOT}` in `mcpServers.command`.
- The Navigator chooses (RO) or (A) in D1 — plateaus 1–2 change shape.
- The narrow handle cannot be made physical (driver refuses two connections in some
  mode, or `logLlmCall` needs a statement outside the allowlist).
- Any pull toward validating arguments, capping limits, or changing Python.
- plan_rule_conflict, failing_required_check_without_clear_fix,
  navigator_decision_needed.

---

## Debt / CRs To Capture At Debt Review (candidates)

- **CV21's installed-`memory` contract is unmet on the Navigator's machine** (fact 12):
  the plugin's hooks and its Python MCP entry are non-functional from any cwd but the
  repo. Made visible, not caused, by this story; CV21's to fix, and DS10's npm makes the
  TS side moot.
- The plugin skills reference `ts/src/frontDoor/cli.ts` relative to cwd, against CV21's
  own no-repo-cwd contract — the same gap, on the skill side.
- The ledger row's 30 s `busy_timeout` sits on the agent's response path (parity with
  Python; a shorter timeout is a divergence to decide, not absorb) — TS1 input.
- The MCP ledger row is unattributed (D1); if TS1 needs to count MCP spend separately
  from front-door and extraction spend, it needs a marker Python never wrote — TS1 input.
- Between this flip and TS1, agent-initiated spend is visible but unbounded — exactly
  Python's posture, at zero installed consumers. Accepted interim; TS1 must land before
  the plugin is distributed to anyone but the Navigator.
- `journey_status` with no slug remains the widest read (US2 debt, TS1 input).

---

## Persona Review (plan stage)

Run 2026-09-18 on the first draft — the collaboration strategy's baseline five plus
ai-engineer, because the row this story writes is the row AI-19's guard reads. All six
dissented; each changed the plan above before it was presented.

- **engineer** — three coupling calls. The tri-state `"db" | "none" | fn` option was a
  new concept where widening the existing boolean to `boolean | fn` does the same job
  with no rename and no caller touched. Extracting `ensureDatabaseReady` "parameterized
  on a logger" was more abstraction than the twelve lines it replaced; extract the pure
  composition and let each caller write its own note. And `versionFromPyproject` lives in
  `git.ts` for historical reasons only — importing the git module into the MCP server to
  read a version is the wrong dependency direction; move the function, re-export, done.
- **quality-assurance** — the plan's own D4 makes the two engines byte-identical at
  `initialize`, so "graded by `serverInfo`" proves nothing about which engine ran; the
  real session and the launcher test both need process-level evidence (`ps`, a marker
  only one branch can see, a stub `python3` that records argv). Second: bare `python3`
  cannot import `memory` on this machine — so the revert branch restores an entry that
  fails today, and the plan had not said so. State what the revert restores, run the
  Python branch under the stand-in, and observe the failure once for the record. Third,
  environment-over-file precedence is the whole reason the launcher can be trusted from
  a client; assert it, do not assume Node's documentation.
- **database-architect** — the row TS2 writes is the row TS1 reads, and as drafted it was
  indistinguishable from every other embedding row (`conversation_id NULL, session_id
  NULL`). That is Python's shape, so parity says write it — but a wallet guard that
  cannot tell MCP spend from extraction spend is a global embedding budget, which may be
  what TS1 wants and must be decided by TS1 in writing rather than discovered. Also: a
  statement allowlist that stops `DELETE` but not `BEGIN` still hands the holder
  transaction control; put `BEGIN` in the mutation list.
- **devops-engineer** — `MIRROR_TS_MCP=0` in `.env` would have done nothing: the launcher
  decides before node loads the file, while every other gate is honored from `.env` and
  the DS8 holdback was literally commented gates there. The one gate the user reaches for
  under pressure would be the one that ignores the file. Read the key in the launcher
  with environment precedence. And name the failure modes the client will see — `node`
  missing, Node too old, no configuration — so a broken launch is diagnosable from the
  MCP log, not from memory.
- **security-engineer** — two controls and one artifact. Never `source .env` in the
  launcher; parse the one key. Pin by type that `ToolRuntime` carries a function and
  never the writable handle, so no future tool can write an agent-influenced value into
  `llm_calls`. And the threat model in US1's package says this server cannot write; after
  D1 that sentence is false, and DS9's Done condition cites that artifact as reviewed —
  amend it in the same story that changes the fact (D7). The `full`-mode persistence of
  an agent-authored query into `llm_calls.prompt` is theoretical (opt-in, nothing reads
  it back into context, Python identical) and ranked accordingly.
- **ai-engineer** — "a computed cost" is not an assertion: a replay provider reporting
  null usage yields `cost_usd NULL` and the test passes vacuously. Grade the row
  numerically against the single cost authority with non-null usage, and make a null cost
  a failing mutation. Second, name the interim honestly: after the flip and before TS1,
  the live server spends unbounded, as Python did; acceptable at zero installed consumers,
  and a distribution gate for TS1.

---

## Approval Gate

- active checkpoint: `after_plan`
- **approved 2026-09-18** with D1 = (C) two connections.
- Implementation proceeds under this contract; Navigator Validation remains the next
  hard stop.
