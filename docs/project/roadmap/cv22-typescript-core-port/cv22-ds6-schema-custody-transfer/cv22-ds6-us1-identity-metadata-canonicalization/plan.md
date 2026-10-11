# Plan — CV22.DS6.US1

## Objective

Retire the transition-only `json.dumps` byte-mimicry for journey metadata by
serializing `identity.metadata` (for `layer=journey` rows) in one canonical JSON
form, under a read-tolerant policy for existing rows, and delete
`ts/src/util/pyJson.ts`. This is the CR023 canonicalization decision, resolved
now that DS6.TS1–TS4 have transferred schema custody to TS.

## Grounding (what the code actually does)

- `pyJsonDumps` has exactly one consumer: `ts/src/journey/journeyWrite.ts`.
  - `createJourney` → `pyJsonDumps(metadata, { sortKeys: true, ensureAscii: false })`.
  - `setProjectPath` → `pyJsonDumps(meta)` (defaults: `sortKeys=false, ensureAscii=true`).
- Journeys are `identity` rows (`layer=journey`); the two dialects differ only in
  key ordering and non-ASCII escaping — separators already match Python.
- Every reader parses: `setProjectPath` does `JSON.parse(row.metadata)` before
  mutating; `journeyOptions.parentJourney` does `JSON.parse(metadata)`. **No code
  byte-compares the column.** On-disk byte form is therefore semantically
  invisible — reads tolerate any valid JSON already.

## The decision (CR023 left an explicit fork)

**(a) Canonicalize + one-time normalization migration.** Pick canonical JSON,
then rewrite every existing journey-metadata row through the new TS migration
engine. Pro: uniform on-disk form immediately; dogfoods the migration engine
now. Con: a backup-gated data-rewrite over real user rows whose only effect is
byte changes **no read can observe**; must re-serialize every historical shape
(including unknown keys) without dropping data.

**(b) Canonical write + read-tolerant (recommended).** Switch new writes to
canonical `JSON.stringify`, delete `pyJson.ts`; existing rows keep their bytes
(they parse fine) and converge to canonical on their next write. Pro: zero
migration risk; byte-mimicry is deleted from the code immediately (CR023's actual
mandate); behaviorally identical. Con: on-disk form is mixed until rows are next
written.

**(c) Hybrid convergence (recommended companion to b).** Do (b) now; let **US2**'s
`parent_journey` migration — which already parses and rewrites every journey
metadata row to extract the column — normalize any residual old-dialect rows for
free when it runs. No dedicated US1 migration ever needed.

### Recommendation: (b) + (c)

Every metadata reader already `JSON.parse`s, so a data-rewrite migration (a)
would touch user data for a change no observer can see — poor risk/reward. CR023
says "byte-mimicry must not outlive the transition"; deleting `pyJsonDumps` from
the write path (b) satisfies that completely — the mimicry is gone from the code.
The migration engine's "first real schema authorship" proof is better earned by
**US2** (a genuine `ADD COLUMN` + index + backfill), and US2's migration mops up
any lingering old-dialect bytes (c). Reserve migration risk for where it buys
real integrity, not invisible byte uniformity.

**Navigator interpretation point:** DS6's Done Condition says the two decisions
are "resolved and applied through the TS engine." If that is read strictly as
"US1 must run a migration," choose (a); if read as "TS owns the canonical form
going forward," (b)+(c) satisfies it. My recommendation reads it the second way.

### Canonical form

Plain `JSON.stringify` (compact, insertion-order keys, raw UTF-8). `journeyMetadata`
already builds the object in a fixed key order, so output is deterministic;
`setProjectPath` parses → spreads → stringifies, preserving order. Key-sorting is
an optional extra-stability sub-decision; default is unsorted insertion order.

## Scope

- `journeyWrite.ts`: both `pyJsonDumps(...)` → `JSON.stringify(...)`.
- Delete `ts/src/util/pyJson.ts`, `ts/test/util/pyJson.test.ts`, and the two
  `ts/src/index.ts` re-export lines.
- Update write-parity fixtures/goldens (`ts/src/parity/writeParityFixture.ts`,
  `ts/parity/write_parity.py`, journey goldens/demo-db generators) that assert
  Python-byte journey metadata → assert the canonical form; stop byte-comparing
  this column against the Python oracle (recorded divergence).
- Tests: mixed-dialect read-tolerance; create→set→read round-trip.

## Non-Goals

- No data-rewrite migration (unless Navigator selects option a).
- No `parent_journey` column (US2); no other schema change.
- No change to non-journey identity metadata, or to any reader.

## Multi-Persona Plan Review (pre-implementation)

**Database architect (lead).** The column is opaque JSON consumed only via
`JSON.parse`; no index or constraint depends on its bytes, so canonicalization is
read-transparent. Recommend read-tolerant (b): don't spend a data-rewrite
migration on invisible byte changes; reserve the engine for US2's real schema
change. If uniformity is mandated (a), the migration must be a pure
parse→`JSON.stringify` re-serialize (never field-aware) so unknown keys survive,
backup-gated per DS4. `parent_journey` integrity stays in-JSON until US2.

**Engineer.** Deleting `pyJson.ts` + test + re-export removes ~90 lines of
transition scaffolding — a real simplification, not just a swap. The two call
sites already build/parse plain objects; `JSON.stringify` drops in. No reader
changes. Keep `journeyMetadata`'s fixed key order for deterministic output.

**QA.** Preserve the behavioral contract: journeys render, hierarchy resolves,
`project_path` round-trips. Add a **mixed-dialect** fixture (one old Python-byte
row + one new canonical row) proving both parse/render. Update write-parity
goldens to the canonical bytes and stop asserting Python-byte equality for this
column — the intentional divergence point. Round-trip: create→set-path→read.

**DevOps.** (b) = no migration, no backup-gate exercise, nothing to run on real
DBs — simplest ops posture. CI: regenerate the write-parity/determinism goldens
for the canonical form and keep the determinism gate green.

**Security.** Serialization-only; metadata content unchanged. Read-tolerance is
still `JSON.parse` (never eval) — no injection surface. Canonical form now stores
raw UTF-8 (vs escaped) — fine for SQLite TEXT, no trust-boundary change.

## Validation Route

- Automated (hermetic, CI): TS unit tests for `createJourney`/`setProjectPath`
  canonical output; mixed-dialect read-tolerance; round-trip; journey render
  goldens green; regenerated write-parity/determinism goldens; `pyJson.ts`
  deletion confirmed (no dangling import; typecheck clean).
- Navigator smoke (E2E): on a **copied** real DB, create a journey and
  `journey set-path`, then `journeys` — hierarchy and project_path render
  correctly, and inspecting the row shows the canonical form.
  - Expected: journeys list correctly; the new/updated row's metadata is
    `JSON.stringify` form; old rows still list.
  - Pass: identical rendered output to pre-change; `pyJson.ts` gone.
  - Fail: any journey read differs, or a row fails to parse.

E2E decision: **required, narrowed to a Navigator smoke on a copied DB** — no
migration touches real data under (b), and read-tolerance is proven hermetically
by the mixed-dialect fixture. Requires explicit Navigator acceptance.

## Implementation Contract

- TDD: write the canonical-output + mixed-dialect + round-trip tests first (red),
  then swap the serializer and delete `pyJson.ts` (green), then update goldens.
- Scoped to `CV22.DS6.US1`; no `git add .`; descriptive English commit explaining
  why. `uv run` for Python parity generators.

## Stop Conditions

- scope_change_detected (e.g. a data migration becomes necessary, or a byte-
  comparing reader is discovered)
- navigator_decision_needed (option a vs b; key-sorting sub-decision)
- failing_required_check_without_clear_fix

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
