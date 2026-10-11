# Plan — CV22.DS7.US2 — Content & planning writes

## Objective

Route the **deterministic** content & planning command surface to the TS core:
the full `tasks` command tree and the `week view` read. Every ported subcommand
must produce ordered/behavioral parity against the Python oracle, with writes
proven on database copies (backup-gated, redacted evidence), and the routing
flip must be user-invisible and independently revertible to Python fallback.

## Grounding: the real surface (from inspection)

The three families named in the roadmap split into two distinct risk classes:

**Deterministic — in scope for US2 (copy-provable, no provider call):**

- `tasks add` — `TaskService.add_task` → `store.create_task`
- `tasks done|doing|block` — status change via `store.get_task` /
  prefix-match fallback → `complete_task` / `update_task`
- `tasks delete` — `store.delete_task` (prefix-match fallback)
- `tasks import [journey]` — `parse_journey_path_tasks` over the journey-path
  markdown → dedupe by title → `add_task`
- `tasks sync [journey]` / `sync-config` — `parse_journey_path_tasks` +
  `parse_done_tasks` over a reference file → create/complete; `sync-config`
  writes the sync-file pointer
- `tasks list` — read over `list_tasks` (co-ported for family coherence and to
  observe the writes)
- `week view` — read over `store.get_tasks_for_week` + the day-grouping render

**LLM/embedding-gated — DEFERRED to US5 (extraction lifecycle):**

- `journal` — the CLI surface **always** calls `classify_journal_entry` (LLM)
  **and** `add_memory` generates an embedding inline (`generate_embedding`).
  There is no deterministic CLI path. Its orchestration lives in
  `intelligence/extraction.py` + the embedding provider — the exact seam US5
  owns.
- `week plan <text>` — always calls `extract_week_plan` (LLM), writes the
  `mm_week_pending.json` handshake file.
- `week save` — trivial deterministic write, but its only producer is
  `week plan`. Kept with its producer on Python to avoid a cross-engine
  temp-file JSON contract during the transition; it moves when `week plan`
  moves (US5).

### Scope correction (flagged for the panel)

The roadmap outcome reads "`journal`, `tasks`, `week` writes answered by TS with
parity proven on copies (low risk)." Inspection shows `journal` (double-gated:
classify + embed) and `week plan`/`save` (LLM + cross-engine handshake) are not
deterministic and not low-risk. This plan narrows US2 to the genuinely
deterministic surface (the `tasks` tree + `week view`) and reassigns the gated
paths to **US5**, mirroring the DS7.US1 precedent that left `descriptor generate`
(LLM) on Python. This preserves US2's "low risk, proven on copies" intent instead
of importing extraction-replay work into it.

## Scope

- New TS module `ts/src/tasks/` — a task read/write model over the `node:sqlite`
  seam: `create`, `getById`, a single shared `resolveTaskByIdOrPrefix` (full-id
  hit → unique-prefix → ambiguous/none), `updateStatus`, `complete`, `delete`,
  `listTasks` (open/status/journey filters), `getTasksForWeek`. `updateStatus`,
  `complete`, and `delete` all call the one resolver; the resolver takes an
  explicit caller-supplied ambiguous-handling mode so Python's own asymmetry
  (`status_change` reports "Ambiguous ID"; `delete` folds `>1` match into
  "not found") is reproduced, not silently unified.
- New TS module `ts/src/tasks/journeyPathParse.ts` — a parity port of
  `parse_journey_path_tasks` / `parse_done_tasks` (including the legacy `Etapa`
  and `✅/🚧/⏸` handling) as **one shared** parser used by both `import` and
  `sync`.
- Sub-command routing for `tasks` and `week` in `ts/src/frontDoor/routing.ts`
  (write-vs-read granularity, following the `identity set` / `consult credits`
  precedent).
- Front-door handlers + renderers: `tasks` writes go through the backup-gated
  write path (`ensureBackup` / `applyBackupGate`, as `identityWrite.ts` /
  `journeyWriteRoute.ts` do); `tasks list` and `week view` reuse the read-render
  pattern (`render/*.ts`), string-exact to the Python output.
- Determinism inputs pinned in every golden: `now` (via
  `ts/src/util/pyGenerators.ts`) for `week view`'s today/window/overdue/
  scheduled-at filters, and `newId`/`_now()` for every written row (`tasks
  add/import/sync`, status changes) — without freezing both, real-DB-copy row
  comparison cannot be byte-identical.
- Oracle-drift registration in `ts/parity/oracle-baseline.json` for every ported
  Python oracle (`TaskService` write methods, the two markdown parsers, the
  shared prefix resolver, the week view render).
- Front-door redaction: log command/subcommand/journey/counts, **never** task
  titles, `--content`-class payloads, or the `sync-config`/`sync` reference-file
  path (home dir/username are PII-adjacent even though a path is neither a
  title nor a payload) (RS005 / OPS CR026).

## Non-Goals

- **No `journal` port** — double LLM/embedding-gated; moves to US5.
- **No `week plan` / `week save` port** — LLM + cross-engine handshake; moves to
  US5 with the extraction/embedding replay seam.
- No live provider or embedding call in TS (DS8 seam untouched).
- No new behavior — parity only; the Python task/week semantics are reproduced,
  not improved.
- No sibling DS7 families (cultivation, mirror-mode, extraction, Soul, Explorer,
  Builder/Ariad tree, ops tail).
- No transactional consolidation of `import`/`sync` writes — Python commits each
  `create_task`/`complete_task` call independently; the TS port reproduces that
  per-call commit boundary exactly rather than wrapping the loop in one
  transaction (a transaction would be an unrequested behavior improvement, not
  parity).

## Acceptance Behavior

```text
Given a copied memory.db exercised through the front door
When the Navigator runs each deterministic tasks/week command below via TS
Then the rendered output and the resulting DB rows are byte/row-identical to Python

  tasks add "T" --journey j --due D --stage S   → task row created; created line
  tasks list [--journey|--status|--all]         → grouped listing identical
  tasks done|doing|block <id-or-prefix>         → status transition + line
  tasks delete <id-or-prefix>                   → row removed + line
  tasks import [journey]                         → markdown checkboxes → tasks (deduped)
  tasks sync-config <journey> <file>             → sync-file pointer written
  tasks sync [journey]                           → file parse → create/complete counts
  week view                                      → day-grouped week render identical

And `tasks done|doing|block` on an ambiguous prefix reports "Ambiguous ID"
  (matching Python) while `tasks delete` on the same ambiguous prefix reports
  "not found" (matching Python's own asymmetry, reproduced not unified)
And week view's today/window/overdue/scheduled-at filter logic runs against a
  frozen clock in tests, matching the golden's frozen `now`
And every created/updated row's id and timestamps match the golden exactly,
  generated through the same frozen `newId`/`_now()` contract as other TS writes
And journal, week plan, week save remain on Python fallback (unchanged)
And every write is backup-gated and leaves no real DB artifact in evidence
And the front-door log never contains task titles, `--content` payloads, or the
  `sync-config`/`sync` reference-file path
And the routing flip is user-invisible and revertible with no data migration
```

## Architecture / Approach

1. **TDD, parity-first.** For each subcommand: capture the Python oracle output
   (rendered stdout + resulting rows) on a copied DB as a committed synthetic
   golden, then drive the TS implementation to match.
2. **Pure logic isolated.** The two markdown parsers and the week-view grouping
   are pure functions with committed goldens in CI (the DS2 ranker/router
   pattern). The store methods are a query-builder + row-mapper over the seam
   (the DS2 memory-listing pattern).
3. **Writes on copies, backup-gated.** Reuse `liveBackup.ts` / `backupGate.ts`;
   real-DB-copy parity runs through the existing redacted harness
   (`ts/parity/real_db_copy_*`), extended with a `tasks`/`week` probe family.
4. **Sub-command routing.** `routing.ts` gains `tasks`/`week` entries that split
   by `argv[1]`; unknown/`plan`/`save`/`journal` fall through to Python.
5. **ID prefix-match parity via one shared resolver.** A single
   `resolveTaskByIdOrPrefix(id)` backs `done/doing/block/delete`: full-id hit →
   unique-prefix hit → ambiguous → none. Python itself is asymmetric on the
   ambiguous branch — `cmd_status_change` prints an explicit "Ambiguous ID
   '<id>'. Matches: ..." message; `cmd_delete` folds `>1` match into the same
   "not found" message as zero matches. The resolver takes an explicit
   caller-supplied ambiguous-handling mode so both call sites reproduce their
   own Python behavior rather than converging on a unified one.
6. **Frozen determinism inputs.** Goldens pin `now` (for `week view`'s
   today/window/overdue/scheduled-at filters) and `newId`/`_now()` (for every
   write row) through the same generators already established for the frozen-
   `now` contract (`ts/src/util/pyGenerators.ts`), so real-DB-copy row
   comparison is byte-identical rather than incidentally close.
7. **`import`/`sync` commit boundary preserved.** Python issues one
   `create_task`/`complete_task` call per loop iteration with no wrapping
   transaction. The TS port reproduces that per-call boundary exactly — no
   single-transaction rewrite — so partial-failure/crash-recovery behavior
   stays parity, not an unrequested improvement.

## Validation Route

- **Automated (CI):** `npm test` (TS) covering the parsers, store
  query-builder/mapper, status/prefix-match branches (including the
  status-change-vs-delete ambiguous asymmetry), and week-view grouping against
  committed synthetic goldens generated with a frozen `now` and frozen
  `newId`/`_now()` id/timestamp generators; the CI determinism gate regenerates
  the goldens; the oracle-drift checker passes with the new baseline entries.
- **Real-DB-copy (redacted):** the parity harness runs the `tasks`/`week` probe
  family against a copied demo DB, emitting redacted evidence (labels, counts,
  hashes, pass/fail) — no titles, ids, payloads, or filesystem paths.
- **Redaction test:** front-door log for every new command asserts no task
  titles, no `--content`-class payloads, and no `sync-config`/`sync`
  reference-file path appear — paths are PII-adjacent (home dir/username) even
  though a path is neither a title nor a payload.
- **E2E smoke before the flip:** a full add→list→doing→done→delete cycle and an
  import/sync cycle and a `week view`, run end-to-end through the front door on a
  copied DB, producing output identical to Python; confirm `journal`/`week plan`
  still fall back to Python.

E2E decision: **required** (per-family smoke before routing flip is a DS7
discipline); no live-provider dependency, so it runs in the deterministic suite.

## Named Risks & Seams

- **Markdown parser drift** — `import`/`sync` depend on regex parity incl. legacy
  `Etapa`; a single shared parser (writer/locator lesson from `kebab_slug`) with
  a golden fixture guards it.
- **Prefix-match ambiguity asymmetry** — `status_change` reports "Ambiguous ID";
  `delete` folds ambiguous into "not found". The shared resolver must reproduce
  both branches, not converge them into one behavior.
- **Determinism inputs** — `week view`'s time-relative logic and every write's
  id/timestamps must be frozen in goldens (`now`, `newId`, `_now()`), or
  real-DB-copy comparison is unreliable and can flake.
- **Import/sync commit boundary** — do not wrap the loop in a single
  transaction; Python commits per call, and that partial-failure behavior is
  part of parity.
- **Redaction** — a redaction test (never log titles, payloads, or the
  sync-file path) is acceptance criteria for the flip.
- **`week` split** — `week view` (TS) vs `week plan/save` (Python) share no state;
  the temp-file handshake stays entirely within Python, so no cross-engine
  contract is introduced.

## Handoff Note for US5 (recorded per collaboration-strategy)

Recorded now so US5's Plan doesn't rediscover it from scratch
(collaboration-strategy: "record decisions near the roadmap"):

- **Ledger traceability.** `journal`, `week plan`, and `week save` are not
  dropped from DS7 — they are reassigned from US2 to US5. The DS7 burn-down
  ledger (deterministic-commands-on-TS / total) should reflect this
  reassignment when the DS7 parent package is next updated; that update is a
  DS-level coherence/Done concern, out of this Plan's authorized scope for a
  single User Story.
- **Seam decomposition input (ai-engineer).** For both `journal` and
  `week plan`, only `send_to_model`/`generate_embedding` are the
  non-deterministic edge. Prompt assembly, JSON-response parsing,
  `VALID_MEMORY_LAYERS` coercion (AI-24), `ExtractedWeekItem` validation, the
  title-similarity check, and the resulting `add_task`/`add_memory` calls are a
  deterministic shell US5 can extract and test independently of the live call,
  behind the DS5 replay `LlmTransport` — the same edge-vs-orchestration split
  DS5 already used for `consult`.

## Implementation Contract

- TDD/characterization tests for every ported branch; goldens committed.
- Keep changes scoped to `CV22.DS7.US2`; one directory per family
  (`ts/src/tasks/`) — no god-module.
- Use `uv run` for Python oracle/tests; `npm` for TS.
- Do not `git add .`; commit only story-scoped files.
- Descriptive English commit messages explaining why.

## Stop Conditions

- scope_change_detected (e.g. pressure to pull `journal`/`week plan` back in)
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
