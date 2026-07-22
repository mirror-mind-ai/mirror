# Plan — CV22.DS6.US2

> **Scope split during implementation (Navigator-approved).** This plan targeted
> column + migration + dual-read/write + integrity. Grounding revealed that
> *activating* the column requires migrate-on-open for existing databases — a
> high-blast-radius runtime-seam change. US2 was split: it delivers the
> schema-authorship core (below, through the contract renegotiation); activation
> + adoption moved to **CV22.DS6.US3**. The multi-persona review, decision forks,
> and the migration/contract design below all still apply to the delivered core.

## Objective

Graduate `parent_journey` from `identity.metadata` JSON to a first-class indexed
`identity` column via a **new TS-authored forward migration (017)**, proven over
real legacy database copies — the first time the TS engine authors schema instead
of replaying Python's history. Dual-source with JSON during the transition so the
still-present Python surfaces keep working.

## Grounding (verified)

- Journeys are `identity` rows (`layer=journey`); `parent_journey` lives in
  `identity.metadata` JSON. `identity` is `id`-keyed with `UNIQUE(layer,key)`.
- Readers: TS `journeyOptions.parentJourney` (parses JSON) + many Python surfaces
  (`cli/journeys.py`, `services/journey.py`, `surfaces/workspace.py`, `web/`).
- Writers: TS `journeyWrite.ts` (createJourney/setProjectPath, JSON) + Python
  `journey.py`.
- The `identity` table is created by `createSchema` (schema.ts), **after**
  `runMigrations` in `bootstrap.ts`; migrations that touch identity are guarded
  no-ops on a fresh DB. So the column must be added in **both** `createSchema`
  (fresh) and migration 017 (legacy), 017 guarded on table-exists + column-absent.
- Two seam contracts currently assert **TS == Python** schema:
  `tests/unit/test_ts_schema_contract.py` (`ts_ids == python_ids`) and the TS1
  structural-parity snapshot. US2 is the first intentional TS ⊋ Python divergence.

## Recommended scope (and the fork)

**Recommendation: one coherent story, "TS authors the column, dual-sourced."**
Add the column (schema.ts + migration 017 + index + backfill), renegotiate the
two seam contracts to **TS ⊇ Python**, dual-write (column + JSON) and dual-read
(column, fallback JSON), and port app-level integrity. **Defer** dropping the
JSON copy and any hard FK to DS7 (re-home Python readers) / DS10 (delete Python),
because Python still reads `parent_journey` from JSON everywhere today.

Why not full graduation now: the JSON copy cannot be removed while Python reads
it; a self-referential FK is not cleanly expressible against `UNIQUE(layer,key)`.
Forcing either now would either break Python surfaces or over-engineer the schema.

**Alternative (if you prefer cleaner review boundaries): split US2** into a
Technical Story (migration engine forward-authoring + contract renegotiation +
column/backfill, optionally folding the TS2 migration-016 fixture debt) and a
User Story (column adoption in read/write + integrity). The work is coherent
enough to stay one story; I lean single-story but will split on request.

**Migration-016 debt:** US2 builds exactly the legacy-fixture machinery that
debt needs. It **can** be resolved in the same motion (clearing both remaining
DS6 blockers together) — offered as an option, not baked into this scope.

## Multi-Persona Plan Review (pre-implementation)

**Database architect (lead).** The column is the right shape: nullable
`parent_journey TEXT` on `identity`, meaningful only for `layer=journey` rows,
with a **partial index** `WHERE parent_journey IS NOT NULL` (keeps it small).
Migration 017 must mirror the 016 pattern but also guard **table existence**
(identity is created by createSchema, which runs after migrations on a fresh DB),
else a fresh-DB ALTER throws. Backfill must be a pure JSON parse → column copy
for `layer=journey`. No hard FK: `UNIQUE(layer,key)` can't back a single-column
self-ref FK; integrity stays app-level. The JSON copy stays authoritative-for-
Python; the column is authoritative-for-TS — name this dual-source explicitly and
give it a DS10 collapse trigger.

**Engineer.** Dual-write in `journeyWrite.ts` is small (set the column next to the
JSON). Read path: `journeyOptions` should prefer the column and fall back to JSON
parsing (read-tolerant, covering Python-written and un-backfilled rows). Port
`_validate_parent_journey` (parent-exists, no-self, single-level nesting) into a
pure TS function reused by create/update. Keep migration 017 idempotent like 016.

**QA.** The headline proof is migration-over-real-legacy-copies: same end schema,
`_migrations` rows, and backfilled column values as the Python-equivalent seed.
Add: fresh-DB guarded-no-op; dual-write sets both; read-tolerance across
column-only, JSON-only, and both; integrity rejections; and a regression that
journey listing output is byte-identical to today. Renegotiated contract tests
must fail loudly if TS drops below Python, not just when it exceeds.

**DevOps.** This changes the schema-seam contracts — the highest-blast-radius
change since DS2. Sequence it so CI proves both directions: `test_ts_schema_
contract.py` (TS ⊇ Python) and the TS1 structural snapshot regeneration must be
green, and the migration must run cleanly on the committed legacy fixtures. No
data rewrite on live DBs — copies only, backup-gated, redacted.

**Security.** Backfill reads existing JSON (already `JSON.parse`d elsewhere) — no
new trust surface. Dual-write must not widen what a journey write accepts;
integrity validation is a *tightening*. The partial index leaks nothing. Confirm
the migration cannot be tricked into writing outside `layer=journey`.

## Non-Goals

- No JSON removal, no hard FK, no Python reader re-homing (DS7/DS10).
- No change to journey listing *output* or any other command's behavior.
- Migration-016 debt only if the Navigator opts to fold it in.

## Validation Route

- Automated (hermetic + committed legacy fixtures, CI): migration 017 forward
  over legacy copies (schema + ledger + backfilled values vs Python-equivalent
  seed); fresh-DB guarded no-op; dual-write; read-tolerance (column/JSON/both);
  integrity rejections; journey-listing regression byte-identical; renegotiated
  `test_ts_schema_contract.py` and TS1 structural snapshot green in both
  directions; full `ts/` suite + Python suite green; typecheck/lint/mypy/ruff.
- Navigator smoke (E2E): on a **copied** real DB, run the TS migration path, then
  create/set a journey parent through the front door and list — hierarchy renders
  identically, the column is populated, JSON still carries the value for Python.
  - Expected: column present + indexed + backfilled; listing unchanged; JSON
    still mirrors parent_journey.
  - Pass: legacy copy migrates to the fresh-schema shape; listing identical;
    dual-source intact.
  - Fail: schema/ledger mismatch vs Python-equivalent, listing differs, a Python
    surface loses parent_journey, or a contract test passes when it should fail.

E2E decision: **required** — this is a real migration touching schema custody;
prove it over real legacy copies (not just fixtures). Copies only, backup-gated.

## Implementation Contract

- TDD: fixtures + failing migration/contract tests first, then schema.ts +
  migration 017 + contract renegotiation, then dual-write/read + integrity.
- `uv run` for Python contract test + legacy-fixture generation. Scoped to
  CV22.DS6.US2; no `git add .`; descriptive English commit explaining why.

## Stop Conditions

- scope_change_detected (JSON-drop, hard FK, or Python re-homing creeps in;
  migration-016 fold requested mid-flight)
- navigator_decision_needed (single-story vs split; fold migration-016 debt;
  contract-renegotiation shape)
- failing_required_check_without_clear_fix (esp. a Python surface losing data)

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
