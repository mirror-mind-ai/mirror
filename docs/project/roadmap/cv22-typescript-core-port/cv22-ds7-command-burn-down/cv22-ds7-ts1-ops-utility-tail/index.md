[< Parent](../index.md)

# CV22.DS7.TS1 — Ops/utility tail

**Status:** 🟡 Planned
**Type:** Technical Story

---

## Technical Story

In order to support the delivery capability,
As an engineering team/system component,
I want to Ops/utility tail,
So that the expected technical outcome is available.

## Outcome

Navigator can validate Ops/utility tail as an observable behavior.

## Acceptance Behavior

```text
Given the system is ready for Ops/utility tail
When the planned technical change is applied
Then the expected technical outcome is observable
And unrelated Delivery Story scope remains untouched
```

## Scope

Reconciled 2026-09-07 against `src/memory/__main__.py` dispatch and
`ts/src/frontDoor/routing.ts`; the [burn-down ledger](../burn-down-ledger.md)
is the auditable denominator.

Six top-level commands (0/6) plus branch residuals, delivered as three slices
in this order. Each slice is its own pull, plan, and flip; slices 1 and 2 are
pulled before DS7.US6.

### Slice 1 — DB safety tools: `backup`, `repair-encoding`

- `backup` — dated zip archive of the memory database. Gives TS the
  dated-archive property it lacks (`ts/src/frontDoor/liveBackup.ts` is a
  fixed-name pre-write snapshot) and unblocks the `repair-journeys --apply`
  routing line US10 left on Python (Python gates the mutating repair behind
  that archive). One routing line once it lands.
- `repair-encoding` — dry-run/apply repair of reversible UTF-8/Windows mojibake
  in user text. A backup-gated write, proven on copies.

### Slice 2 — Daily-visible tail: `welcome`, `runtime` reads

- `welcome` — rendered at every Pi session start by
  `.pi/extensions/mirror-logger.ts` (`--status-line` and full card). Imports
  `inspect_git_update_plan`, `check_runtime_update_availability`,
  `package_version` from `runtime`, so the reads below come with it.
- `runtime status|version|diagnose|latest|pending|release-notes` — the read
  half. Allowlist each subcommand explicitly in `routing.ts` (the
  `list`/`inspect`/`descriptor` pattern) so the mutating half can never inherit
  the route. `diagnose` is also a live fix: Python's version flags the
  TS-authored `017_journey_parent_column` as `core_migration_unknown`.

### Slice 3 — Extension catalog and projection contract

- `extensions` (list, validate, sync, install, uninstall, expose-claude,
  clean-claude) and `ext` (dispatch into a command-skill extension's CLI).
  Install/uninstall/expose/clean mutate skill directories on disk — not low
  risk; this slice earns the multi-persona Plan review.
- The branches US1 deferred here: `list extensions|all`,
  `inspect extension|runtime-catalog|llm-calls|embedding-provenance`.
- `journey-projection` — CLI transport for the Journey Projection Contract
  consumed by the extension API (`memory/extensions/api.py`, `loader.py`);
  coupled to TS2's `mirror-context-v1`.

## Out Of Scope

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
retire unported in DS10; the ledger denominator moves 32 → 30; TS1 is sliced
as above with slices 1–2 before US6.

## Validation

Navigator-visible validation route plus automated checks.
