# Plan — CV22.DS7.US1 — Remaining identity/journey reads & writes

## Objective

Burn down the remaining **deterministic** identity/journey command surface from the
Python fallback to the TS core, extending the proven DS2 read pattern
(`ts/src/memory/listing.ts` query-builder + row-mapper) and the DS4 write pattern
(pure port module + front-door handler + backup-gate/copy-guard). Land the two
carried riders — the `kebab_slug` writer/locator port and the DS6.US3 atomic
`parent_journey` dual-write — against the most stable oracle, before the
security-sensitive cultivation/extraction writes (US3/US5) and the highest-churn
Builder/Ariad tree (US8).

This is parity, not redesign. Every routing flip must produce **no user-visible
change** and remain independently revertible to Python fallback with no data
migration.

## Grounded Surface Map (what "conversations", "list", etc. actually are)

The flat DS7 inventory hides real seams found during Prepare/grounding. This plan
draws the lines explicitly so no downstream checkpoint can call them ambiguous:

| Command (subcommand) | Nature | US1 disposition |
|---|---|---|
| `identity list`, `identity get` | read (identity rows) | **In** — Slice A |
| `identity edit` | interactive `$EDITOR` subprocess | **Keep on Python** (named seam) |
| `journey status` | read (status render) | **In** — Slice A |
| `journey update` | write (`set_journey_path` content) | **In** — Slice B |
| `list personas\|journeys` | read | **In** — Slice A |
| `list extensions\|all` | reads extension catalog | **Bound out** → TS1 ops tail |
| `inspect persona\|extension\|runtime-catalog` | read | **In** — Slice A |
| `inspect llm-calls\|embedding-provenance` | read (llm_calls / vectors) | **Bound out** → TS1 (`llmCalls.ts` already exists) |
| `descriptor list` | read | **In** — Slice A |
| `descriptor generate` | LLM-backed (`generate_descriptor`) | **Keep on Python** → DS7↔DS8 live seam |
| `recall` | read (messages by conv prefix) | **In** — Slice A |
| `conversations` (`list_recent`) | read | **In** — Slice A |
| `conversations --metadata-lifecycle-*` / backfill apply/preview | stateful **writes** (ES-001) | **Bound out** → own slice/story (see Non-Goals) |
| `seed` | bulk YAML→DB identity upsert | **In** — Slice B |
| `init` | filesystem bootstrap (no DB write) | **In** — Slice B |
| `kebab_slug` (rider) | shared slug util | **In** — Slice C |
| `parent_journey` atomic dual-write (rider, DS6.US3) | write + read-flip | **In** — Slice C |

## Scope

### Slice A — Deterministic reads (extends DS2 read pattern)
- Port `identity list` / `identity get`, `journey status`, `list personas|journeys`,
  `inspect persona|extension|runtime-catalog`, `descriptor list`, `recall`, and
  `conversations` (`list_recent`) as read models over the `node:sqlite` seam.
- Pure logic (row mapping, grouping, preview truncation, render) in cohesive
  `ts/src/` modules; the render surfaces are string-exact goldens (plain-text
  surfaces here, not `transport=verbatim`, but still byte-for-byte).
- One directory per family; no god-module. Reuse the existing
  `ts/src/frontDoor/render/*` pattern for the CLI-facing render.

### Slice B — Deterministic writes (extends DS4 write pattern, backup-gated)
- Port `journey update` (`set_journey_path`), `seed` (bulk identity upsert from
  YAML — new: a YAML parse dependency + exact persona/journey metadata-JSON
  assembly matching Python `json.dumps` key order; the DB write primitive
  `setIdentity` is already ported), and `init` (filesystem copytree +
  `{{user_name}}` substitution; parity = directory tree + token substitution).
- Writes proven on copies, backup-gated (`backupGate.ts` + `copyGuard.ts`), never
  live during proof; redacted evidence by default; no real DB artifact committed.
- Front-door write routing added per subcommand, each independently revertible.

### Slice C — Carried riders
- **`kebab_slug`**: port `src/memory/utils.py:kebab_slug` (strip accents → kebab →
  hard 80-char cap; empty → bare code) as **one shared** function used by both the
  path writer and the path locator (the original Python bug was writer/locator
  drift). Golden fixture + register in `ts/parity/oracle-baseline.json`.
- **DS6.US3 atomic `parent_journey` dual-write**: make the journey write path write
  JSON metadata **and** the `identity.parent_journey` column in **one transaction**
  (all-or-nothing), retiring the JSON-first-shadow posture; flip
  `resolveParentJourney` (single call site) from JSON-first to column-first. Parity
  + an atomicity/rollback test (a mid-write failure leaves neither side updated).

## Non-Goals

- **`identity edit`** — interactive `$EDITOR`; stays on Python (explicit keep, not a
  silent port).
- **`descriptor generate`** — LLM-backed; stays on Python as the named DS7↔DS8 live
  seam. US1 ports `descriptor list` only.
- **Conversation Metadata Lifecycle writes** (`conversations` backfill/lifecycle
  preview & apply, ES-001) — stateful write feature with dry-run/preview semantics;
  bounded out of US1 and recommended as its own copy-validated slice. US1 ports
  `conversations` listing (read) only.
- **`list extensions|all`, `inspect llm-calls|embedding-provenance`** — extension
  catalog / ops-tail; belong to CV22.DS7.TS1.
- No live-provider cutover (DS8), no MCP (DS9), no Python deletion / rename / npm
  (DS10). No behavior change — parity only.
- Sibling DS7 stories US2–US8/TS1 are out of scope.

## Acceptance Behavior

```text
Given a copy of a real memory.db and committed synthetic goldens
When the Navigator runs each ported identity/journey read/write through the front door
Then the TS core answers with byte-exact rendered-surface and DB-state parity to Python
And identity edit / descriptor generate / conversation-lifecycle writes still fall back to Python
And every routing flip is invisible to the runtime and revertible with no data migration
And the parent_journey column is co-authoritative (atomic JSON+column) and read column-first
```

## Validation Route

- **CI (fixture-level):** committed synthetic goldens for each read family + the
  `kebab_slug` golden; write parity via the DS4 copy harness for `journey update`,
  `seed`, `init`; an atomicity/rollback test for the `parent_journey` dual-write.
  The determinism gate regenerates all new goldens. Oracle-drift tripwire extended
  to every newly-ported Python oracle.
- **Real-DB-copy harness (realism):** new probe families for the reads + writes,
  redacted by default, run against a copied demo/local DB (never live).
- **Per-family E2E smoke before each routing flip:** a real front-door invocation
  (e.g. `identity list`, `journey status`, `seed --force` on a copy) dogfooded to
  confirm no user-visible change, then flip `routing.ts`.

**E2E decision:** required as a per-family front-door smoke before each routing
flip (dogfood), with fixture-level goldens gating CI. Navigator may accept a
narrower fixture-only route for the pure reads.

## Execution Sequence (within US1)

Slice A (reads) → Slice B (writes, backup-gated) → Slice C (riders). Each slice is
an independently-committed, independently-revertible plateau with its own goldens
and routing flips. Rationale for order: reads are lowest risk and re-home the DS2
pattern; writes add the backup gate; the riders (atomic dual-write, shared slug)
are the highest-integrity changes and land last against the now-warm pattern.

## Implementation Contract

- TDD/characterization tests for behavior; port pure logic first, then wire the
  front door. One directory per family; `kebab_slug` is one shared function.
- Redaction: the front-door log records command/routing/layers/keys/errors —
  **never argument payloads** (`--content` carries identity text; stdin carries
  whole documents). A redaction test is acceptance for each newly-routed command.
- Identity-write allowlist (CV9.E2.S23) enforced for `seed` (writes identity
  layers); secrets env/config-only, never argv, never logged.
- Use `uv run` for Python oracle/tests. No `git add .`; commit only story-scoped
  files. Descriptive English commit messages explaining why.

## Multi-Persona Plan Review (US1)

Per the collaboration-strategy baton-boundary protocol; panel: engineer, QA,
database architect, devops, security. Full findings summarized in the session; the
blocking constraints folded into this plan are:

- **engineer** — one directory per family, no god-module; `kebab_slug` single
  source; port pure logic before wiring the front door.
- **quality-assurance** — coverage is per subcommand/branch; `seed` needs
  skip/force/error-path goldens; each family gets an E2E smoke before its flip;
  the burn-down denominator is tracked per family.
- **database-architect** — `seed` metadata-JSON assembly must match Python key
  order byte-for-byte; the `parent_journey` dual-write must be all-or-nothing in
  one transaction with a rollback test; writes proven on copies, backup-gated.
- **devops-engineer** — each flip independently revertible with no data migration;
  redaction test per newly-routed command; watch CI wall-clock as goldens
  multiply; keep the moving oracle re-baselined.
- **security-engineer** — `seed` is identity-mutating: enforce the identity-write
  allowlist and secure-default posture; never log `--content`/stdin payloads;
  bounding out `descriptor generate` avoids an unfenced LLM path in US1.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
