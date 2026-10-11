[< Story](index.md)

# Test Guide — CV22.DS10.TS4

## Automated Validation

Every plateau: `cd ts && npm run typecheck && npm run lint && npm test`,
`uv run pytest`, and the pre-push set. After plateau 6:
`python scripts/check_retired_surfaces.py` (five new `CV22.DS10.TS4` rows) and
`scripts/check_skill_command_parity.py`.

Tests added or flipped, by plateau:

0. Baseline captured: `build load mirror-ts-core` stdout to
   `baseline-build-load.txt` in this package; read-only copy of `memory.db`
   under `/tmp/ts4-home/`.
1. `ts/test/frontDoor/routing.test.ts` — the `retired` decision shape; six
   predicates refuse by name; the refusal reads no stdin, echoes no argv or
   stdin, prints a static anchor; the `journey` family covers `set-path`,
   `update`, no argument, an existing slug, an unknown slug (still the status
   read — CR095 is not taken here), and the two retired verbs refused before
   the status-read fallthrough. `buildRouting.test.ts:56` and
   `routing.test.ts:180,878` flip from `engine: python` to `engine: retired`.
2. `tests/unit/memory/test_main.py` help assertion updated; the two migration
   test files deleted with their modules.
3. `test_journey.py` loses the admin-verb cases; `test_journey_admin.py`
   deleted; `ts/test/goldens/journey-update.golden.json` unchanged (or
   regenerated with the reason recorded).
4. Backfill cases removed from `test_conversations.py` /
   `test_conversation.py`; the lifecycle suites stay green untouched.
5. In order: Python `test_resume_state.py` / `test_build.py` expect the single
   state → `builder-resume-state`, `builder-orientation`, `builder-load`
   goldens regenerated from Python (`generate_builder_resume_state_golden.py`
   drops its `get_workbench_snapshot` import; diff confined to the refinement
   field) → `ts/test/builder/{load,loadSurfaces,resumeState,orientation}.test.ts`
   green against them → `test_workbench.py` deleted with the module.

## E2E Decision

Not required as a paid or separate run. Every route is deterministic and
keyless; the Navigator's real-home `build load` after plateau 5 is the
end-to-end check and is part of the Navigator route.

## Navigator Validation

**After plateau 1 — the refusal shape.**

```bash
node --env-file=.env ts/src/frontDoor/cli.ts journey export-registry; echo "exit=$?"
echo '{"slug":"x"}' | node --env-file=.env ts/src/frontDoor/cli.ts journey mutate; echo "exit=$?"
node --env-file=.env ts/src/frontDoor/cli.ts journey mutate < /dev/null; echo "exit=$?"
node --env-file=.env ts/src/frontDoor/cli.ts build change-request capture --journey x --title t --body b; echo "exit=$?"
node --env-file=.env ts/src/frontDoor/cli.ts migrate-legacy validate --source /tmp/a --target-home /tmp/b; echo "exit=$?"
node --env-file=.env ts/src/frontDoor/cli.ts journey mirror-ts-core | head -3
```

- *Expected:* the first five each print one line naming the surface and its
  `pending-cutoffs.md` anchor and `exit=1`, at once — the two `mutate` forms
  neither hang nor print the JSON, and `migrate-legacy` does not print the
  paths. The sixth prints the normal `=== journey: mirror-ts-core ===` status,
  unchanged.
- *Pass:* five one-line refusals, five `exit=1`, one unchanged status.
- *Fail:* an empty `=== journey: export-registry ===` block, `exit=0`, a
  Python usage block, a traceback, a hang on `mutate`, or any argv/stdin
  content echoed back.

**After plateau 5 — the Refinement field.**

```bash
node --env-file=.env ts/src/frontDoor/cli.ts build load mirror-ts-core > /tmp/ts4-after.txt
diff <(rg -A3 "Refinement field" baseline-build-load.txt) <(rg -A3 "Refinement field" /tmp/ts4-after.txt) && echo "field unchanged"
MIRROR_HOME=/tmp/ts4-home node ts/src/frontDoor/cli.ts build load <journey-with-no-refinement-index>
```

- *Expected:* `field unchanged`; then, on the read-only copy under
  `/tmp/ts4-home/` (never the real home), the field renders the single
  file-first state and names `docs/project/refinement/index.md` as the file to
  create.
- *Pass:* both renders; no SQLite error on either; no write to
  `~/.mirror-minds/vinicius-ts/`.
- *Fail:* any diff in the field, any `storage_state` other than project
  files, a reference to Workbench rows or counts, or a raised error on the
  index-less project.

**After plateau 6 — the surface is gone, the data is not.**

```bash
uv run python -m memory --help | grep -E "migrate-legacy|refinement-story|change-request|export-registry|mutate|metadata-backfill"; echo "matches=$?"
uv run memory-rehearse-migration --help; echo "exit=$?"
sqlite3 "file:$HOME/.mirror-minds/vinicius-ts/memory.db?mode=ro&immutable=1" \
  "select 'rs', count(*) from builder_refinement_stories union all select 'cr', count(*) from builder_change_requests;"
python scripts/check_retired_surfaces.py; echo "exit=$?"
```

- *Expected:* `matches=1` (grep found nothing); the console script does not
  resolve (nonzero — `uv run` re-syncs the editable install, so the shim is
  gone); `rs|10` and `cr|52`; the retired-surface check `exit=0`. Then the
  same read-only `sqlite3` with `select id from _migrations where id like
  '015%' or id like '016%'` → `015_create_builder_workbench` and
  `016_builder_workbench_display_codes`; `ts/test/db/schemaState.test.ts`
  green.
- *Fail:* any help match, a resolving console script, a row count other than
  10/52, the check naming residue, a missing `015`/`016` ledger row, or a red
  `schemaState.test.ts`.

## Validation Evidence

Pending implementation and validation.
