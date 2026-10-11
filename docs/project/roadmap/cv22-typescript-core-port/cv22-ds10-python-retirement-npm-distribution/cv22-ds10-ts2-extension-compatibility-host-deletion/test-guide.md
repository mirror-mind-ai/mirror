[< Story](index.md)

# Test Guide — CV22.DS10.TS2

## Automated Validation

- `cd ts && npm test` — extension suites (`catalog`, `catalogWrites`, `contextRuntime`,
  `dispatch`) run with a scrubbed `PATH` in at least one case, proving no interpreter is
  needed; new assertions cover the refusal line, the `no_provider_runtime` diagnostic,
  the manifest-rendered listing, and the install warning.
- `uv run pytest tests/unit/memory/extensions` — green with `test_compat_host.py` gone.
- **Shim tests** (panel findings S-1, D-1): a handler write outside `ext_<id>_*` is
  rejected as `api.execute` rejects it today; the shim's connection reports
  `busy_timeout=30000` and `foreign_keys=ON`; no raw-connection attribute is reachable
  from the shim's API object.
- `uv run python scripts/check_retired_surfaces.py` — the `compat-host` row reports absent
  files and zero residue outside history paths.
- The pre-push set the workflow lists: 57 generators, 17 write-parity probes (the install
  probe without its register step), 3 smokes, both suites, four checks.

## E2E Decision

**Required.** The story exists, under option 3, to keep three extensions working on the
Navigator's real home the day the bridge is deleted. A fixture cannot stand in for that.
Take `backup` first.

## Navigator Validation

Run on `~/.mirror-minds/vinicius-ts` after the `automation` migration is installed:

| # | Route | Expected observation | Pass | Fail |
|---|---|---|---|---|
| 1 | `ext google-ads campaigns` | one stderr line naming extension, subcommand, and the fix | exit 1, no traceback | traceback, hang, or a `uv` process appears |
| 2 | `mirror load` (campaign_status bindings intact) | load completes; one `no_provider_runtime` diagnostic per bound provider | every non-extension section present | load aborts, or the provider vanishes silently |
| 3 | the seven daily-use subcommands: `google-workspace` `filter`/`mail`/`drive`, `session-export` `export`/`folder`, `persona-export` `export`/`owner` | output identical to pre-migration for the same arguments | identical, and `ps` shows no `uv`/`python -m memory` | any refusal, missing table, or changed output |
| 4 | `ext session-export` | listing rendered from the manifest, no `(no runtime declared)` flags | matches the manifest's two entries | a flag appears or the host is spawned |
| 5 | `ext google-ads` | listing with every entry flagged `(no runtime declared)` | four flagged entries | unflagged entries or a spawn |
| 6 | a partially migrated extension (one subcommand declared, one not) | declared runs, undeclared refuses, listing flags only the second | all three hold in one manifest | the listing flags both or neither |
| 7 | **before** the core deletion commit: the three migrated extensions against the host still present | identical output | migration is forward-compatible, so the ordered revert is safe | any refusal — rollback story is invalid, stop |

## Validation Evidence

Pending implementation and validation.
