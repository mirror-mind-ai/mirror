# Validation — CV22.DS7.TS1

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npm run lint && npm test (1240 green); uv run python scripts/check_oracle_drift.py (clean); generate_repair_encoding_golden.py + generate_backup_golden.py regenerate as a no-op on 3.10 and 3.12; write_parity.py --probe repair_encoding and --probe journey_repair_apply on the demo copy (overall_match: true); conversation_lifecycle_smoke.ts 87 checks incl. Python zipfile reading the TS archive; .pi tsc clean

Checks status: passed

## E2E

Decision: required

Evidence: All four route items on the Navigator's real home. 1: repair-encoding dry run byte-identical across engines (0 hits, read-only). 2: backup through the front door created memory_20260907_233154.zip (memory.db + -wal + -shm), unzip -t clean, no .partial, front-door.log 'backup ts exit=0' with no path. 3 (Navigator): a NEW Pi session quit at 09:50 local produced memory_20260908_095020.zip (48 MB db + 210 KB wal + shm), front-door.log 'backup ts exit=0' at 07:50:22Z, mirror-logger.log shows runFrontDoor at shutdown, unzip -t clean -- the first hot-path extension call to enter the front door. 4: apply on two seeded copies identical across engines, live DB confirmed untouched.

## Navigator Validation

Route: Start a NEW Pi session (the running one loaded the old extension), then quit it. Expected: a new memory_<ts>.zip in ~/.mirror-minds/vinicius-ts/backups and a 'backup / ts / exit=0' line in ~/.mirror-minds/vinicius-ts/front-door.log.

Navigator accepted: yes

Expected observation: New dated zip archive after the shutdown AND a backup/ts line in front-door.log (the extension now enters the front door)

Pass condition: Both the archive and the front-door log line appear; unzip -t reports no errors

Fail condition: No new archive, or an archive without a front-door log line (extension still calling Python directly), or unzip -t errors

## Missing Evidence

- none
