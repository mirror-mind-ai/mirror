[< CV22 TypeScript Core Port](../index.md)

# CV22.DS7 — Command Burn-Down & Re-homed Feature Work

**Delivery Story:** Port the remaining **deterministic** command surface from the Python core to the TypeScript core — the Builder/Ariad tree (re-homing CV20/CV21 in-flight work), Soul, Explorer, mirror-mode orchestration, memory cultivation, the extraction lifecycle, remaining identity/journey reads and writes, and the content/ops tail — behind the DS5 replay-safe `LlmTransport` seam and the DS6 TS-owned database, until the deterministic Python command surface is empty and only the live-provider transport (DS8) and the MCP server (DS9) remain as separate, later cutovers.
**Status:** 🟡 Planned — authored as a full package ahead of pull (same convention as DS6); child stories are created on pull/expand.
**Type:** Delivery Story
**Depends on:** [CV22.DS3 Pi TS Front Door](../cv22-ds3-pi-ts-front-door/index.md) (done) for the routing table this story flips entries in; [CV22.DS4 Deterministic Writes](../cv22-ds4-deterministic-writes/index.md) (done) for backup-gated, copy-validated write discipline; [CV22.DS5 External-API Commands](../cv22-ds5-external-api-commands/index.md) (done) for the replay-safe `LlmTransport` provider boundary that orchestration ports behind; [CV22.DS6 Schema Custody Transfer](../cv22-ds6-schema-custody-transfer/index.md) (done) so every write/migration a ported command needs is answered by the TS-owned database.

---

## What This Is

Through DS6 the strangler owns the **database** and a validated slice of
**commands** — the DS2 reads (`detect-persona`, `journeys`, memory listing), the
DS4 deterministic writes (`identity set`, `journey set-path`), and the DS5
external surfaces under replay (`memories --search`, `consult`). Read against the
front-door routing table (`ts/src/frontDoor/routing.ts`), *everything else still
falls back to Python* — and "everything else" is most of what the product does:
the Builder/Ariad delivery lifecycle, Soul Mode, Explorer Mode, mirror-mode
orchestration, memory cultivation (consolidate/shadow), the extraction pipeline,
the remaining identity/journey reads and writes, and a long content/ops tail
(`journal`, `tasks`, `week`, `backup`, `extensions`, …).

DS7 is the **command burn-down**: it drains that Python fallback one command
family at a time, flipping each family's routing entry to TS only after parity is
proven, until the *deterministic* Python command surface is empty. Unlike DS2's
pure functions (a ranker, a router), these families are **stateful, branching,
and side-effecting** — multi-step Ariad state machines, ritual surfaces that emit
`transport=verbatim` box-drawing, extraction that inserts memories and
embeddings, cultivation that mutates identity layers. Parity here grades rendered
surfaces and database transitions, not just a returned list.

Two things make DS7 different from every prior DS and set its whole shape:

1. **It ports a *moving* target.** The Builder/Ariad tree is not frozen — CV20
   (Builder Mode Evolution) is actively growing new Python behavior on `main`
   (release/push policies, debt ledger, method preferences, refinement-lifecycle
   DSL governance). "Re-homed feature work" means DS7 must both **port what
   exists** and **carry in-flight CV20/CV21 work**, then honor the strangler rule
   that *new feature work lands in TS* — so the Python Builder tree stops growing
   the moment TS takes custody of it. This is the dominant risk of the story.

2. **It brushes against DS8's live-provider seam without crossing it.** Several
   families (extraction, `consult`, live `memories --search`, `eval`) orchestrate
   an LLM/embedding call. DS7 ports the **orchestration and the deterministic
   database work** behind the DS5 replay-safe `LlmTransport`; the **live call**
   stays on Python fallback until DS8 implements `live` mode. The seam between
   "port the command" (DS7) and "flip the live call" (DS8) must be named per
   family or the two stories collide.

---

## The Burn-Down Inventory (grounded in the routing table)

The denominator is the top-level `python -m memory <command>` surface. Already on
TS: `detect-persona`, `journeys`, `memories` (listing + replay search),
`consult` (replay), `identity set`, `journey set-path`. The DS7 targets, grouped
into the families that will become child stories:

- **Remaining identity/journey reads & writes** — `identity list|get|edit`,
  `journey status|update`, `seed`, `init`, `descriptor generate|list`, `list`,
  `inspect`, `conversations`, `recall`. (`identity edit` spawns `$EDITOR` — an
  interactive seam that needs an explicit decision, not a silent port.)
- **Content & planning writes** — `journal`, `tasks`, `week`.
- **Memory cultivation** — `consolidate scan|apply|reject|list`,
  `shadow scan|apply|reject|list|show`. Identity-layer writes behind an
  allowlist and prompt-injection fences (security-critical).
- **mirror-mode orchestration** — `mirror load|deactivate|log|journeys`,
  `mode activate|deactivate|status`. The Mirror-mode turn (reception routing →
  answer → record) behind the replay transport.
- **Extraction lifecycle** — `conversation-logger` and the extraction pipeline
  it drives (memory + embedding inserts, idempotency, fences). The largest write
  orchestration; its live embedding call is the DS8 seam.
- **Soul Mode** — `soul load|listen|rite|close|review|propose|apply|fruit|`
  `harvest|prompt`. Large ritual surface: `transport=verbatim` rendering plus
  identity-writes (`soul apply`).
- **Explorer Mode** — `explore load|…`. Exploratory-story surfaces.
- **Builder/Ariad tree** — `build …` (the full Delivery lifecycle: load, pull,
  prepare, plan, approve, validate, review, done; Refinement Workbench; cadence;
  flow-unit; inspect/adopt/prepare-templates/sync-cursor). The largest,
  highest-churn, `transport=verbatim` surface, re-homing in-flight CV20/CV21
  work. Ported last or in tight lockstep with a frozen oracle snapshot.
- **Ops/utility tail** — `backup`, `repair-encoding`, `extensions`, `ext`,
  `welcome`, `migrate-legacy`, `migration-rehearsal`, `transcript-export`,
  `conversation-logger` (mute/switch), `inspect llm-calls`. Cleanup to reach the
  zero-deterministic-command line.

Progress is the visible burn-down the strangler promised: *deterministic
commands-on-TS / total*, tracked per family, so "done = zero" is measurable.

---

## Validation Approach

DS7 inherits, and does not relax, the discipline the earlier stories established:

- **Parity per command family, not per top-level command.** A single `build` or
  `soul` command fans out into dozens of subcommands and branches; each branch
  that ports needs coverage. Committed synthetic goldens run in CI; the reusable
  redacted real-DB-copy harness carries new probe families for realism.
- **Rendered-surface parity is string-exact.** Ariad/Soul/welcome surfaces are
  `transport=verbatim` — the golden captures the *rendered* box-drawing output,
  not just the underlying data, so a re-indent or rewrap is a failure.
- **Writes proven on copies, backup-gated, never live during proof.** Extraction,
  cultivation, and the content writes follow the DS4/DS6 rule: prove on a copy of
  `memory.db`, back up first, redact evidence by default, commit no real database
  artifact.
- **Replay, not live.** Orchestration is validated behind the DS5 replay
  `LlmTransport`; CI never makes a live provider call. `eval` (which hits real
  LLMs) stays out of CI gating and depends on DS8 to run for real.
- **Oracle-drift tripwire coverage grows with each family.** Every ported Python
  oracle is registered in `ts/parity/oracle-baseline.json`; because DS7 ports a
  *moving* Builder/Ariad tree, this tripwire is the primary defense against
  silent drift while CV20 keeps changing `main`.
- **Per-family E2E smoke before the routing flip.** Because both authors dogfood
  Pi daily, each family's cutover is exercised end to end (a full Mirror turn, a
  full Ariad Delivery lifecycle, a Soul ritual, a conversation extraction) before
  its `routing.ts` entry flips — and the flip must produce **no user-visible
  change**.

---

## Critical Seam Boundaries

Named explicitly so no child-story plan can claim they were ambiguous:

- **DS7 ↔ DS8 (live provider).** DS7 ports command orchestration behind the
  *replay* transport and leaves the *live* call on Python fallback. DS8 flips the
  transport's `live` mode. A family that needs a live call is "done for DS7" when
  its deterministic orchestration + DB work run on TS under replay; it is not
  waiting on DS8 to count as burned down.
- **DS7 ↔ DS9 (MCP).** DS7 ports the CLI command surface only. The MCP server
  (`python -m memory mcp`) and its threat model are DS9.
- **DS7 ↔ DS10 (deletion).** DS7 empties the deterministic command surface;
  it does **not** delete the Python core, resolve the `memory → mirror` rename,
  or ship npm. Those are DS10, gated on DS7+DS8+DS9 leaving zero commands.

---

## Candidate Stories

Codes and titles below are the planned expansion; child folders and links are
created on pull/expand. Risk-first: extend the proven read/write patterns on the
low-churn deterministic tail first, port the security-sensitive cultivation and
extraction writes in the middle behind the replay seam, and take the
highest-churn `transport=verbatim` Builder/Ariad tree last (or in tight lockstep
with a frozen oracle snapshot), so the moving target is ported against the most
stable possible oracle.

| Family | Scope | Type | Risk |
|--------|-------|------|------|
| Remaining identity/journey reads & writes | `identity list/get`, `journey status/update`, `seed`, `init`, `descriptor`, `list`, `inspect`, `conversations`, `recall`; carries the DS6.US3 atomic `parent_journey` dual-write and the `kebab_slug` port | User/Technical | Low–Med |
| Content & planning writes | `journal`, `tasks`, `week` | User Story | Low |
| Memory cultivation | `consolidate`, `shadow` — identity-layer writes behind the allowlist + ported injection fences | User Story | Med (security) |
| mirror-mode orchestration | `mirror`, `mode` — the Mirror turn behind the replay transport | User Story | Med |
| Extraction lifecycle | `conversation-logger` + extraction pipeline; deterministic DB writes behind replay, live embedding is the DS8 seam | User/Technical | High (writes) |
| Soul Mode | `soul` full surface — `transport=verbatim` rendering + `soul apply` identity-writes | User Story | Med–High |
| Explorer Mode | `explore` exploratory-story surfaces | User Story | Med |
| Builder/Ariad tree | `build` full Delivery + Refinement lifecycle; re-homes in-flight CV20/CV21 work; `transport=verbatim` | User/Technical (multiple) | Highest (churn) |
| Ops/utility tail | `backup`, `repair-encoding`, `extensions`, `ext`, `welcome`, `migrate-legacy`, `transcript-export`, `inspect llm-calls` | Technical | Low–Med |

`identity edit` (spawns `$EDITOR`) and other interactive seams are called out for
an explicit port-or-keep decision at plan time rather than a silent port.

---

## Multi-Persona Plan Review (DS-level)

Run per the [collaboration strategy](../collaboration-strategy.md) baton-boundary
protocol — the Plan-review checkpoint, before implementation — to shape the DS7
package. Panel: engineer, QA, database architect, devops, security. These are
**plan inputs**, recorded so no future child-story checkpoint can claim they were
unknown; each child story runs its own Plan review when pulled.

**◇ engineer — blocking constraints**
- The Builder/Ariad tree is a *moving oracle*. Port it **last** or in tight
  lockstep with a frozen oracle snapshot, and treat `oracle-baseline.json` as the
  gate: every ported oracle registered, every drift a build failure. Non-blocking:
  re-homed CV20/CV21 features that have no Python counterpart yet should be
  authored directly in TS (the strangler's "new feature work lands in TS" rule),
  not back-ported to Python first.
- Enforce module cohesion: one directory per family (`ts/src/builder/`,
  `ts/src/soul/`, `ts/src/explore/`, `ts/src/extraction/`, `ts/src/cultivation/`)
  — no god-module. `kebab_slug` ships as **one** shared function used by both the
  path writer and the path locator (the original Python bug was writer/locator
  drift).

**◇ quality-assurance — blocking constraints**
- The burn-down denominator must be an explicit, tracked artifact
  (*deterministic commands-on-TS / total*, per family) so "done = zero" is
  auditable, not asserted. Coverage is **per subcommand/branch**, not per
  top-level command.
- Each family gets an E2E smoke of its critical journey **before** its routing
  flip, and the flip must be invisible to the runtime. No family is "done" on
  unit goldens alone.

**◇ database-architect — blocking constraints**
- Extraction, cultivation, and content writes are the highest-integrity writes in
  the port: prove on copies, backup-gated, preserve transactional boundaries and
  extraction idempotency. The **DS6.US3 atomic `parent_journey` dual-write** lands
  here and must be all-or-nothing in one transaction (today it is JSON-first
  dual-read with a non-authoritative shadow column).
- Cultivation/soul writes touch identity layers — the CV9.E2.S23 **identity-write
  allowlist** must be enforced in the TS port, not silently dropped.

**◇ devops-engineer — blocking constraints**
- Each family's routing flip must be **independently revertible** to Python
  fallback with no data migration — the seam already supports this; keep it that
  way. Watch CI wall-clock as golden + real-DB-copy suites multiply; keep
  live-provider work out of CI (replay only).
- **RS005/OPS CR026 redaction** extends to every newly-routed command: the
  front-door log records command names, routing, layers/keys, errors — **never
  argument payloads** (`--content` carries identity text; stdin can carry whole
  soul documents). A redaction test is acceptance criteria for each family.
- DS7 ports a moving target: mandate **regular `main` merges + oracle
  re-baselining** so CV20's ongoing Python changes don't accumulate as drift.

**◇ security-engineer — blocking constraints**
- The prompt-injection fences hardened across CV9.E2 (scene S21, shadow S22,
  consolidate S23, title/tags S25, summary S29) live in Python today. Porting
  extraction/cultivation/soul **must port the fences with them**, at parity,
  including the CI-enforced behavioral guards — porting orchestration without the
  fence reintroduces closed AI-findings.
- Identity-mutating commands (`identity set/edit`, `seed`, `consolidate apply`,
  `shadow apply`, `soul apply`) are the tightest gate: their content feeds future
  system prompts. Enforce the identity-write allowlist and secure-default posture
  (secrets env/config-only, never argv, never logged, redacted from errors).

**Consolidated recommendation.** Proceed. DS7 is coherent as a Delivery Story but
too large to expand flat — pull it, expand risk-first into the families above,
and run a per-child Plan review at each pull. The two structural risks — a moving
Builder/Ariad oracle and the DS7/DS8 live-provider seam — are managed by
sequencing the churny tree last against a frozen snapshot, growing oracle-drift
coverage as families land, and drawing the replay-vs-live line per family. No
blockers to authoring; the blocking constraints above are child-story plan inputs.

---

## Carried Debt & Riders

- **DS6.US3 deferred atomic dual-write** (`parent_journey`): activate the column
  as a co-authoritative write (JSON + column in one transaction), retiring the
  DS6 JSON-first-shadow posture. Belongs to the identity/journey family.
- **DS7 slug parity (`kebab_slug`), from the v0.31.2 merge (`1c4e55a`):** port
  `src/memory/utils.py:kebab_slug` (strip accents → kebab → hard 80-char cap;
  empty result → bare code folder) as one shared writer/locator function, and
  register it in `ts/parity/oracle-baseline.json` with a golden fixture. Related:
  **D-012** (candidate-table *code* cell still unsanitized) and **D-013**
  (`transcript_export.slugify` is a separate capped-kebab sibling).
- **RS005 front-door observability (OPS CR026):** redaction test per newly-routed
  command (never log argument payloads).
- **RS005 identity-mutating gate + CV9.E2.S23 identity-write allowlist:** enforce
  in the TS port of every identity-writing command.
- **Injection-fence parity (CV9.E2 S21/S22/S23/S25/S29):** fence parity is part of
  each cultivation/extraction/soul family's done condition.

---

## Done Condition

CV22.DS7 is done when:

- Every **deterministic** command in the inventory is answered by the TS core
  with proven ordered/behavioral parity against the Python oracle — Builder/Ariad,
  Soul, Explorer, mirror-mode, cultivation, extraction orchestration, the
  remaining identity/journey reads and writes, and the content/ops tail.
- The only Python fallback that remains is the **live-provider transport (DS8)**
  and the **MCP server (DS9)** — each an explicit, separately-owned cutover, not
  an unported deterministic command.
- Every routing flip produced **no user-visible change**; each family remained
  independently revertible to Python fallback with no data migration.
- Writes were proven on copies, backup-gated, redacted by default; no real
  database artifact was committed.
- Ported injection fences, the identity-write allowlist, and front-door redaction
  hold at parity; `oracle-baseline.json` covers every ported oracle.
- The DS6.US3 atomic `parent_journey` dual-write and the `kebab_slug` contract are
  landed and registered.
- The burn-down ledger reads zero remaining deterministic Python commands —
  clearing the way for DS8 (live cutover), DS9 (MCP), and DS10 (deletion + npm).

---

## Non-Goals

- **No live-provider cutover.** The `live` mode of the TS `LlmTransport` is DS8;
  DS7 orchestrates behind the replay seam only.
- **No MCP server.** `python -m memory mcp` and its threat model are DS9.
- **No Python deletion, package rename, or npm distribution.** That is DS10.
- **No behavior change.** This is parity, not redesign — the Builder lifecycle,
  Soul ritual, extraction, and cultivation semantics are reproduced, not improved.
  Re-homed CV20/CV21 work is carried faithfully, not re-specced.
- **No new Python features.** Once TS takes custody of a family, new feature work
  in that family lands in TS; Python stops growing there.

---

## See also

- [CV22 index](../index.md)
- [CV22 Collaboration Strategy](../collaboration-strategy.md)
- [Decisions — CV22.DS6 splits into a risk-ordered retirement chain (DS6–DS10)](../../../decisions.md)
- [CV22.DS5 External-API Commands](../cv22-ds5-external-api-commands/index.md) — the replay `LlmTransport` seam
- [CV22.DS6 Schema Custody Transfer](../cv22-ds6-schema-custody-transfer/index.md) — the TS-owned database
- Front-door routing table: `ts/src/frontDoor/routing.ts`
- [Worklog](../../../../process/worklog.md)
