[< Parent](../index.md)

# CV22.DS7.TS1 — Ops/utility tail 1: DB safety tools

**Status:** 🟡 Planned
**Type:** Technical Story

---

## Technical Story

In order to reach zero deterministic Python commands without weakening the
backup gate every write port depends on,
As the TS core,
I want `backup` and `repair-encoding` answered by TypeScript with proven parity,
So that the dated-archive backup property exists in TS, the
`repair-journeys --apply` route can leave Python, and mojibake repair runs
backup-gated from the same engine as every other write.

## Outcome

`python -m memory backup` and `python -m memory repair-encoding` are routed to
TS ungated, and `conversation-logger repair-journeys --apply` follows on the
routing line US10 left waiting.

## Acceptance Behavior

```text
Given a mirror home with a real-shaped memory.db copy
When `backup` runs through the front door
Then a dated zip archive is produced at the same path, with the same name
  pattern and the same archive contents, as the Python oracle
And the archive verifies as a readable SQLite database

Given user text carrying reversible UTF-8/Windows mojibake
When `repair-encoding` runs dry-run, then `--apply`, through the front door
Then the dry-run report and the applied row set match the Python oracle
And the apply is refused without a backup and never touches the live
  production database during parity proof
```

## Scope

The first of three ops-tail technical stories (this one, then
[TS3](../index.md) daily-visible tail, then [TS4](../index.md) extension
catalog and projection contract). Reconciled 2026-09-07 against
`src/memory/__main__.py` dispatch and `ts/src/frontDoor/routing.ts`; the
[burn-down ledger](../burn-down-ledger.md) is the auditable denominator.

- `backup` (`src/memory/cli/backup.py`, ~200 lines) — dated zip archive of the
  memory database. Gives TS the dated-archive property it lacks
  (`ts/src/frontDoor/liveBackup.ts` is a fixed-name pre-write snapshot) and
  unblocks the `repair-journeys --apply` routing line US10 left on Python,
  because Python gates the mutating repair behind that archive. One routing
  line once it lands.
- `repair-encoding` (`src/memory/cli/repair_encoding.py`, ~200 lines) —
  dry-run/apply repair of reversible UTF-8/Windows mojibake in user text. A
  backup-gated write, proven on copies under the DS4 write-parity harness.
- The `repair-journeys --apply` routing flip, once `backup` is on TS.

## Out Of Scope

- `welcome` and the `runtime` read subcommands — CV22.DS7.TS3.
- `extensions`, `ext`, `journey-projection`, and the US1-deferred
  `list extensions|all` / `inspect extension|runtime-catalog|llm-calls|`
  `embedding-provenance` branches — CV22.DS7.TS4.
- `runtime update|pull|stable|backup|release-doctor|release-promote` — the
  git-based update/release workflow. DS10 redesigns it under npm distribution;
  it is not ported at parity. Python fallback serves it until then.
- `migrate-legacy` — retires unported in DS10 with a documented cutoff
  (Portuguese-era databases must be migrated with a pre-DS10 release).
- `memory-rehearse-migration` — retires unported in DS10; its 2026-04-17 open
  discussion is closed.
- `conversation-logger` mute/switch — flipped in US5.
- `transcript-export` — not a command; its live seam (the transcript backfill)
  was ported in US10, and `export_transcript`/`export_last_turn` have no
  production caller. DS10 deletion inventory.
- Sibling DS7 stories (US6–US9); live-provider cutover (DS8); MCP (DS9);
  Python deletion, rename, and npm (DS10).

## Decisions

Recorded 2026-09-07 in
[Decisions — CV22.DS7.TS1 ops tail](../../../decisions.md#cv22ds7ts1-ops-tail-runtime-splits-rehearsal-and-legacy-migration-retire-in-ds10):
`runtime` splits by mutation; `memory-rehearse-migration` and `migrate-legacy`
retire unported in DS10; the ledger denominator moves 32 → 30; the ops tail is
three technical stories (TS1, TS3, TS4) with TS1 and TS3 before US6.

## Validation

Navigator-visible validation route plus automated checks: committed goldens
for both commands, the redacted real-DB-copy write probe on the demo database
(`ts/parity/write_parity.py`), a front-door smoke on a disposable mirror home,
the redaction check on `front-door.log`, and the revert control exercised
before the flip. Details in `plan.md` and `test-guide.md` at Plan time.
