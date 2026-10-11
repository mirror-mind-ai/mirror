[< Exploration index](index.md)

# Provisional Roadmap: Journey Working Agreements

> **Not an approved roadmap or implementation plan.** Codes, dependencies, migration
> numbers, paths, and story boundaries are placeholders to be re-grounded when the
> capability becomes current work.

## Placement Hypothesis

Create a future product capability, provisionally **CV23 — Journey Working Agreements**,
rather than expanding CV22.DS7.US4. CV22 supplies enabling authority-transfer seams;
CV23 owns the new behavior.

## Enabling CV22 Work

### CV22.DS7.US4 — Existing Mirror Mode Orchestration Parity

Transfer existing journey/persona resolution, reception, context assembly, session
state, and extension composition to TS under replay-safe evidence. Do not add Journey
Context Contracts inside the parity story.

### CV22.DS8 — Live Provider Cutover

Provide the production TS model interface required by profile classification and
proposal generation. If this capability becomes a priority before DS7 completes, any
DS8 resequencing requires an explicit roadmap decision.

### CV22.DS10 — Web Process Convergence

Own the future TS web process and packaged assets required before a contract management
UI can become live authority.

## Provisional Delivery Sequence

### CV23.DS1 — Contract Authority And Persistence

1. **TS1 — Freeze Contract v1 decisions.** Language-neutral JSON schema, profile and
   source limits, explicit override semantics, revision behavior, confirmation
   attribution, and initial mode boundary.
2. **TS2 — Add TS-owned schema.** Revision/proposal tables, indexes, fresh schema,
   migration inventory, legacy rehearsal, Python-open compatibility, and journey-removal
   association updates in every remaining authority.
3. **US1 — Manage revision lifecycle.** Validate, create, inspect, disable, supersede,
   and restore append-only revisions transactionally.
4. **US2 — Expose explicit contract CLI.** Validate/create/show/history/disable/restore
   with stable human and JSON outputs; no routing change.

**Plateau:** contracts are safe durable truth but do not affect responses.

### CV23.DS2 — Deterministic Resolution And Explainability

1. **TS1 — Implement pure precedence.** Explicit profile/persona, mode boundary, unique
   keywords, same-journey sticky state, default profile, existing persona routing, ego.
2. **US1 — Bind session continuity.** Reuse only for the same journey, contract id,
   revision, enabled profile, and compatible mode.
3. **US2 — Resolve and explain.** Typed `ContextResolution`, stable reason codes,
   ambiguity behavior, human explanation, and JSON output.

**Plateau:** every deterministic decision is reproducible without a model.

### CV23.DS3 — Safe Context Sources And Assembly

1. **TS1 — Load safe project files.** Journey-relative roots, no absolute/traversal/
   symlink paths, strict UTF-8, allowlisted file types, regular files, race-aware reads,
   and per-source budgets.
2. **US1 — Assemble typed context.** Required/optional failure behavior, provenance,
   hashes, aggregate token budget, stable composition order, and untrusted-content
   framing below hard constraints.
3. **TS2 — Complete security matrix.** Path attacks, prompt injection, duplicate
   canonical files, size overflow, malformed contracts, and no silent truncation.

**Plateau:** selected profiles can assemble safe context outside live Mirror Mode.

### CV23.DS4 — Natural-Language Mirror Mode Resolution

1. **US1 — Apply deterministic profiles.** Integrate explicit/default/keyword profiles
   into the TS Mirror Mode seam while preserving exact no-contract behavior.
2. **US2 — Extend bounded reception.** Add active-journey profile classification to the
   existing one-call reception path; validate every returned id and ask rather than
   hiding real ambiguity.
3. **TS1 — Grade behavior and economics.** Multi-domain evals, cost/latency comparison,
   malformed output, provider failure, and cross-journey isolation.

**Plateau:** ordinary requests select the correct profile and references without learning
new rules.

### CV23.DS5 — Confirmed Conversational Learning

1. **TS1 — Generate strict pending proposals.** Distinguish transient from durable
   language; model output can create only validated pending data.
2. **US1 — Manage proposal lifecycle.** Edit, accept, reject, expire, supersede, stale-
   base refusal, and initial-contract proposals in one transactional authority.
3. **US2 — Bind confirmation.** Only an attributable user turn with one unambiguous
   pending proposal in the same session and journey can activate a revision.
4. **US3 — Render proposal surfaces.** Preview, scope, confirm/edit/reject, conflict,
   and restoration behavior.
5. **TS2 — Prove adversarial safety.** Quoted confirmation, prompt injection, concurrent
   acceptance, journey switch, stale revision, and mode-weakening attempts.

**Plateau:** a user can teach a durable rule without silent mutation.

### CV23.DS6 — Runtime Convergence And First Public Release

1. **US1 — Freeze one runtime DTO.** Resolution, assembled sections, warnings, blocked
   reason, and proposal state come only from the core.
2. **US2–US5 — Integrate Pi, Claude Code, Gemini CLI, and Codex.** Thin adapters; no
   contract parsing or duplicated policy.
3. **TS1 — Prove cross-runtime equivalence.** Same fixture, same core decision and
   context, with honest documentation of runtime-level limitations.
4. **TS2 — Provide explicit legacy import.** Dry-run/apply only after official behavior
   is proven; never infer or migrate unknown metadata automatically.
5. **US6 — Validate adoption and decommission prototype.** Backup, test representative
   journeys, remove local workaround only after replacement proof, and back up again.

**First public completion signal:** a non-technical user teaches and confirms a journey
rule, later uses a short request, receives the correct persona/context, inspects why,
and switches journeys without leakage across supported runtimes.

### CV23.DS7 — Web Management After CV22.DS10

1. **US1 — Read-only working agreement surface.** Revision, profiles, references,
   proposal history, and explanation.
2. **US2 — Confirmed management flows.** Edit, disable, restore, accept, and reject only
   through TS services.
3. **TS1 — Browser trust evidence.** Accessibility, narrow viewport, read-only purity,
   confirmation behavior, assets, screenshots, and browser smoke.

Web management is not required for the first conversational release.

## Dependency Graph

```text
CV22.DS7.US4 ───────────────┐
                            ├──► CV23.DS4 ─► DS5 ─► DS6
CV22.DS8 ───────────────────┘        ▲
                                     │
CV23.DS1 ─► DS2 ─► DS3 ─────────────┘

CV22.DS10 ─────────────────────► CV23.DS7
```

## First-Release Exclusions

Builder/Explorer/Soul profile selection, multiple active profiles, inheritance,
organization contracts, URLs, executable sources, repetition-based learning, automatic
file editing, web management, and contract-defined operational permission remain out.
