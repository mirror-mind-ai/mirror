[< Story](index.md)

# Test Guide — CV22.DS7.US2 — Content & planning writes

## Automated Validation

Run in CI (no live provider dependency):

- **TS unit/golden** (`npm test` under `ts/`):
  - `journeyPathParse` — `parse_journey_path_tasks` / `parse_done_tasks` parity
    against committed fixtures, including legacy `Etapa` headings and
    `✅/🚧/⏸` markers and completed-stage skipping.
  - `tasks` store model — create/getById/`resolveTaskByIdOrPrefix`/updateStatus/
    complete/delete/listTasks(open|status|journey)/getTasksForWeek, builder +
    row-mapper against synthetic goldens generated with a frozen `now` and
    frozen `newId`/`_now()` id/timestamp generators (`ts/src/util/
    pyGenerators.ts`), so row comparison is byte-identical, not incidentally
    close.
  - prefix-match branches — full-id hit, unique-prefix, not-found (exact
    message), **and the ambiguous-match asymmetry**: `done/doing/block` report
    "Ambiguous ID '<id>'. Matches: ..." while `delete` reports the same
    "not found" message as zero matches — both reproduced from the shared
    resolver, not unified.
  - `week view` day-grouping/render — string-exact golden computed against a
    frozen clock (today/window/overdue/scheduled-at filters), so the test
    cannot flake across a real day boundary.
  - `import`/`sync` — assert each created/completed row is written with its own
    call (no single wrapping transaction), matching Python's per-call commit
    boundary.
- **Determinism gate** regenerates the synthetic goldens with no diff.
- **Oracle-drift checker** (`ts/parity/oracle-baseline.json`) passes with new
  entries for `TaskService.add_task/complete_task/update_task`, `store` task
  writes, the two markdown parsers, the shared prefix resolver, and the
  week-view render.
- **Redaction test** — front-door log for each new command records
  command/subcommand/journey/counts and **never** task titles, `--content`-class
  payloads, or the `sync-config`/`sync` reference-file path (home dir/username
  are PII-adjacent even though the path is neither a title nor a payload).

## Real-DB-Copy Parity (redacted)

- `ts/parity/real_db_copy_*` extended with a `tasks`/`week` probe family; run
  against a copied demo DB. Evidence is redacted by default (labels, counts,
  hashes, pass/fail) — no ids, titles, or payloads; no real DB artifact
  committed.

## E2E Decision

**Required.** Per-family end-to-end smoke through the front door before the
routing flip (DS7 discipline). Runs in the deterministic suite (no live call).

## Navigator Validation

Run on a copied DB (`--mirror-home` pointed at the copy):

**Expected observation** — for each command below, the TS front-door output and
the resulting DB rows match the Python oracle exactly, and `journal` /
`week plan` still print their Python output:

```text
tasks add "Write US2 plan" --journey mirror-ts-core --due 2025-01-01
tasks add "Write US2 plan follow-up" --journey mirror-ts-core   # shares a prefix with the task above
tasks list
tasks doing <shared-prefix>     # expect "Ambiguous ID ... Matches: ..."
tasks delete <shared-prefix>    # expect "not found" (Python's own asymmetry, not unified)
tasks done  <unique-id-prefix>
tasks delete <unique-id-prefix>
tasks import mirror-ts-core
tasks sync-config mirror-ts-core /path/to/ref.md
tasks sync mirror-ts-core
week view
journal "still on python"          # unchanged fallback
week plan "still on python"        # unchanged fallback
```

**Pass condition** — rendered stdout and affected rows are identical to Python
for every deterministic command, including the ambiguous-vs-not-found asymmetry
above; the three gated commands are byte-identical to their current Python
behavior; the front-door log shows no titles, payloads, or the sync-file path.

**Fail condition** — any rendered-output or row divergence from the Python
oracle; the ambiguous-prefix case converging to one message instead of
reproducing Python's asymmetry; any gated command changing behavior; any title,
payload, or filesystem path appearing in the front-door log; any write touching
a non-copied database during proof.

## Validation Evidence

Pending implementation and validation.
