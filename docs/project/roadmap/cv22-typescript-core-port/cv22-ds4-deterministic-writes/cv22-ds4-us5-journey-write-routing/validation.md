# Validation — CV22.DS4.US5

## Status

Passed

## Automated Checks

- ts: npm run typecheck + biome check (exit 0) + node:test 128 pass, incl. journey set-path spawn E2E and normalizeProjectPath symlink tests

Checks status: passed

## E2E

Decision: required

Evidence: Automated spawn E2E (test/frontDoor/journeyWriteCli.test.ts): node cli.ts journey set-path vs a DB copy — writes the normalized project_path; missing journey -> exit 1. Live confirmation on a generated demo DB: journey set-path demo-root-active -> metadata {project_path: .../ts}, matching Python's cmd_set_path output; missing journey -> Error + exit 1. Never production.

## Navigator Validation

Route: Take a backup, then: node ts/src/frontDoor/cli.ts journey set-path <existing-slug> <dir> --db-path <dev-copy>; verify resolved path on stdout + project_path metadata; missing slug -> error + exit 1; confirm journey update still routes to Python

Navigator accepted: yes

Expected observation: journey set-path writes the normalized (expanduser+resolve) project_path via TS; resolved path on stdout, 'project_path set for' line on stderr; missing journey exits 1; other journey commands stay on Python

Pass condition: project_path written exactly as Python normalizes it (symlinks resolved), other metadata preserved, updated_at stamped, backup taken; fallback intact

Fail condition: divergent normalized path, wrong/missing metadata, no backup, wrong exit code, or an unported journey command wrongly routed to TS

## Missing Evidence

- none
