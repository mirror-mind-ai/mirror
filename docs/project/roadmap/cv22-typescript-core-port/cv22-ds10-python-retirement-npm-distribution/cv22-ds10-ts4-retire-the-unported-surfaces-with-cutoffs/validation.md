# Validation — CV22.DS10.TS4

## Status

Passed

## Automated Checks

- uv run pytest (2177 passed); npm test (2527 passed); npm run typecheck; npm run lint; uv run ruff check/format src tests; check_retired_surfaces; check_skill_command_parity; check_oracle_drift; check_doc_links — all clean; GitHub Actions Tests+Docs green on 1608517d

Checks status: passed

## E2E

Decision: not_required

Evidence: The Navigator's real-home 'build load mirror-ts-core' IS the end-to-end check and costs nothing: its output is byte-identical to the plateau-0 baseline captured before any change. The index-less case ran against a VACUUM INTO copy under MIRROR_HOME=/tmp/ts4-home, never the live database. No paid or separate E2E run applies: every route is deterministic and keyless.

## Navigator Validation

Route: 1) journey export-registry / journey mutate (piped JSON and closed stdin) / build change-request capture / migrate-legacy / conversations --metadata-backfill-preview -> one line naming the cutoff, exit 1, no stdin read, no argv echoed; 2) build load mirror-ts-core -> Refinement field diffs clean against baseline-build-load.txt; 3) MIRROR_HOME copy with an index-less project -> 'authority: project files (not started)' + 'create: docs/project/refinement/index.md'; 4) uv run python -m memory --help -> none of the five surfaces; memory-rehearse-migration does not resolve; 5) read-only sqlite3 -> 10 RS / 52 CR and 015/016 still in _migrations

Navigator accepted: yes

Expected observation: Retired surfaces refuse in one line with a resolvable cutoff anchor and exit 1; build load is unchanged for this project; an index-less project names the index to create; the 62 Workbench rows and migrations 015/016 are untouched

Pass condition: All five route steps observed as described, with build load byte-identical to the baseline and row counts 10/52 unchanged

Fail condition: Any refusal that exits 0, hangs on stdin, echoes an argument, or prints a dead anchor; any diff in the Refinement field on this project; any row count other than 10/52; any missing 015/016 ledger row

## Missing Evidence

- none
