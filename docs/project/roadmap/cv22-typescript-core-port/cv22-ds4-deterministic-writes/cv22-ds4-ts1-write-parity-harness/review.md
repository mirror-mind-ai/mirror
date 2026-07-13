# Review — CV22.DS4.TS1

## Status

Reviewed

## Debt Findings

- verifyWriteFixture re-copies seed->ts_copy per probe with copyFileSync but does not clear stale -wal/-shm sidecars; harmless at TS1's single probe, but a lingering -wal from a prior probe could corrupt the next copy once multiple probes run in one invocation. Minor notes: sha256File reads the whole backup via readFileSync (stream for large real memory.db); cross-language e2e is not wired into CI (consistent with DS2's local-gate posture).

## Debt Decision

defer

## Defer Reason

TS1's acceptance is fully met with a single probe; the WAL/multi-probe hazard is not exercised by TS1 and is naturally owned by US1, the first story to register a real or second probe.

## Revisit Trigger

When US1 registers the real log_access probe, or any harness run applies more than one probe in a single invocation.

## Missing Decision

- none
