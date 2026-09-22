# Validation — CV22.DS10.TS2

## Status

Passed

## Automated Checks

- ts: npm test 2381 passed; tsc clean; biome clean (1 pre-existing routing.ts warning)
- python: pytest unit+integration -m 'not live' 2454 passed; ruff check+format clean in CI scope
- parity: 17/17 write probes match (incl. extension_install); real-DB-copy match; migration structural + bootstrap custody PASS
- smokes: extension catalog (10/12 cross-engine + 2 TS-owned, no log leak), conversation-logger lifecycle, Builder Ariad 334/334
- repo checks: retired-surfaces clean (journey-projections, web-console, compat-host), oracle-drift clean, doc links clean, skill parity clean
- interpreter-free: extension suites 41/41 with python3/python/uv shadowed by failing stubs

Checks status: passed

## E2E

Decision: required

Evidence: NAVIGATOR-RUN on the real home (~/.mirror-minds/vinicius-ts, backup memory_20260922_132556.zip taken first), 2026-09-22 13:25-13:30. Step 1: 'ext google-ads campaigns' refused with one stderr line, exit 1, empty stdout, no traceback. Step 2: 'ext google-ads' listed 4 subcommands, all flagged (no runtime declared). Step 3: 'ext google-workspace' listed 5 with zero flags, including docs and sheets - the two that were registered but undocumented and would have vanished under the manifest-only listing. Step 4: docs, sheets, mail, drive each printed usage, proving the TYPE_CHECKING + future-annotations change holds at runtime. Step 5: 'persona-export owner' returned the real owner name, 'session-export folder list' returned 7 journey folders, both listings clean. Step 6: 'mirror load --journey mirror-ts-core' exit 0 with every section intact. Step 7: 'mirror load --journey mirror-ts-core --persona media-buyer' exercised the only unmigrated binding (google-ads/campaign_status, persona-scoped) and emitted exactly 'warning: extension context no_provider_runtime; continuing.' at exit 0 - fail-soft and fail-explicit confirmed live.

## Navigator Validation

Route: Backup; then on the real home through the TS front door: retired-extension refusal; retired listing all-flagged; migrated listing unflagged; four google-workspace usage commands; two real-data reads plus two listings; mirror load; mirror load --persona media-buyer to exercise the unmigrated binding

Navigator accepted: yes

Expected observation: Retired extensions refuse with one stderr line naming the fix at exit 1; migrated extensions answer exactly as before; mirror load completes with every non-extension section plus a named warning for each unmigrated provider that is actually bound

Pass condition: Every migrated subcommand produces its pre-migration output, no uv/python -m memory process is spawned, and the load never aborts

Fail condition: Any traceback, hang, silent section loss, changed output from a migrated command, or a refusal from a command that declares a runtime

## Missing Evidence

- none
