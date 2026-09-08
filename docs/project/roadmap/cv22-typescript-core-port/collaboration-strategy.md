[< CV22 TypeScript Core Port](index.md)

# CV22 Collaboration Strategy

**Purpose:** record how the TypeScript Core Port is operated, so the human
driving it and the Mirror loading the journey keep the same understanding of
ownership, cadence, review, and the rules that protect convergence.

**Operating model since 2026-09-07: single owner.** Vinícius is solely
responsible for the entire migration — the DS7 remainder, DS8, DS9, and DS10.
Alisson moved to a different aspect of Mirror and is not working on the Python
core on `main`. The two-person baton model that carried DS2–DS5 is closed; its
record is preserved below as history, because the handoff statements are the
evidence chain for those plateaus. Decision record:
[Decisions — CV22 becomes a single-owner migration](../../decisions.md).

---

## Context

CV22 ports Mirror Mind's Python core (`src/memory/`) to TypeScript through a
database-seam strangler. The work is part-time and long-running, and its
coordination risk has changed shape:

- With two people, the risk was too many small handoffs — repeated
  re-contextualization, unclear ownership, partial states that are hard to
  resume, pressure to explain every local decision.
- With one person working part-time, the same cost appears between sessions
  instead of between people — and there is no second human at any boundary.

The strategy therefore keeps the plateau discipline exactly as it was and moves
the review burden onto the structured persona panel.

---

## Strategy

### Work in plateaus, not tasks

Each block of work runs until a coherent, habitable state exists — a state that
a future session can resume without reconstructing intent from chat history. A
plateau closes with a handoff statement, now addressed to the next session and
to the Mirror that will load the journey next:

- what is now true;
- what remains intentionally undone;
- what the next plateau is;
- which validation evidence supports it.

Story packages (`index.md`, `plan.md`, `validation.md`, `review.md`,
`handoff.md`) and the
[burn-down ledger](cv22-ds7-command-burn-down/burn-down-ledger.md) are where
those statements live. A session should not end mid-slice when a plateau is
within reach; when it must, the story package says so explicitly.

### The persona panel is the standing second opinion

With no second human, the multi-persona technical review is not a supplement to
review — it is the review. Baseline panel: engineer, quality-assurance,
database-architect, devops-engineer, security-engineer; add ai-engineer when a
story touches model-in-the-loop behavior (DS8 especially).

Two checkpoints, unchanged from the two-person phase:

1. **Plan review, before implementation** — each persona reviews the planned
   slice, risks, validation route, and missing constraints, so the plan is
   enriched before code starts. Required for every story above a small slice.
   A small slice is one bounded command or subcommand family with an existing
   pattern to copy (for example, `backup` after the DS4 write pattern).
2. **Implementation/handoff review, after validation** — each persona reviews
   the delivered code, tests, safety posture, operational risks, and
   resumability. Findings are classified as blockers, non-blocking debt,
   questions for the next plateau, or accepted scope boundaries.

Skipping either checkpoint is a recorded decision in the story package, not a
default.

### Ownership is not split

The earlier lane split — mechanical seams, fixtures, and package mechanics on
one side; semantic coherence, Ariad alignment, and Python retirement decisions
on the other — is collapsed. Python retirement decisions (what DS10 removes,
what gets a documented cutoff, what `runtime`'s update path becomes under npm
distribution) are taken by the same person porting the seams, at plan time,
and recorded near the roadmap. Nobody confirms them; that is precisely why they
must be written down.

---

## Operating Rules

### Preserve the database-seam discipline

The shared SQLite database remains the seam. Read-only commands may be
validated live when safe. Writes must prove parity on database copies before
they are trusted against real user data; write parity is never proven against
the live production database.

### Python is product authority only where TS is not

Per the
[2026-08-13](../../decisions.md#typescript-strangler-tracks-a-moving-python-product-instead-of-freezing-it)
and
[2026-09-02](../../decisions.md#cv22-restarts-after-reconciliation-of-the-pause-window-python-behavior)
decisions there is no global Python freeze: Python remains product authority
for commands TS has not strangled, and each Python change creates named TS
parity scope in the owning CV22 story. Once a command is ported, new behavior
for it lands in TS and Python becomes compatibility-only there.

What changed on 2026-09-07 is exposure, not policy. The main source of Python
movement was CV20/CV21 Builder work on `main`, and its author is no longer
working on the Python core. Remaining movement is maintenance fixes and
parity-driven oracle fixes by the port owner, both caught by the oracle-drift
tripwire (`ts/parity/oracle-baseline.json`). DS7.US8's "moving oracle" risk is
reduced, not eliminated: re-baseline after every `main` merge, and treat any
drift as a build failure.

### Make validation portable

Every plateau leaves commands and expected observations that another session,
another Mirror, or a future collaborator can run without reconstructing intent.
The redacted real-DB-copy harness (`ts/parity/real_db_copy_parity.py`), the
portable demo database (`ts/parity/generate_demo_memory_db.py`), the CI
determinism gate, and each story's `test-guide.md` are the vehicles. Real
database artifacts are never committed.

### Record decisions near the roadmap

Stable collaboration or architecture decisions go in CV22 docs or
[`docs/project/decisions.md`](../../decisions.md), not only in conversation
memory. A single owner has no one to remind them of an unrecorded decision.

### Protect the bus factor

Single ownership raises the cost of an interrupted plateau. The mitigations
are the rules above, applied without exception: resumable plateaus, portable
validation, decisions in files, story packages that a stranger could pick up,
and green CI on every push.

---

## Remaining Sequence

```text
DS7 — command burn-down (10/14): US7 Explorer, US9 Workspace/web hierarchy
      rider, TS4 extension catalog and projection contract,
      US8 Builder/Ariad tree last
→ DS8 live-provider cutover
→ DS9 TS MCP server
→ DS10 Python retirement and npm distribution
```

The risk-first ordering from the DS7 package still applies: the Builder/Ariad
tree last, against the most stable oracle available. The deletion gate remains
DS6's schema custody transfer (done); DS10 cannot delete Python until every
command and non-command runtime surface carries explicit TS ownership.

---

## History — Two-Person Phase (closed 2026-09-07)

Between DS2 and DS5 the port was shared by Alisson and Vinícius and divided by
**baton blocks**: each person carried the work until a coherent plateau
existed, then passed it with a statement of what was true, what was undone,
what came next, and which evidence supported it. The batons below are kept as
written, as the evidence record for those plateaus.

### Baton 1: Alisson closes CV22.DS2.US1, `search` Command Parity

Alisson carried the first DS2 baton through `CV22.DS2.US1` and the follow-up cleanup story `CV22.DS2.TS3`.

Plateau reached:

- the real TS hybrid ranker has been promoted from spike logic into the durable `ts/` core at `ts/src/search/ranker.ts`;
- the golden corpus includes the ranker inputs needed to replay full search behavior (`use_count`, `relevance_score`, `access_count`, `last_accessed_at`, lexical/text surface, embeddings, frozen query vector, frozen `now`, weights, and MMR config);
- synthetic golden parity runs in the TS test suite;
- real-DB-copy parity was manually validated first during US1 and then promoted into a reusable harness in TS3;
- the reusable real-DB-copy parity harness lives at `ts/parity/real_db_copy_parity.py` and verifies through `ts/parity/real_db_copy_verify.ts`;
- the harness uses an explicit source DB, copies it into ignored local storage under `tmp/`, and emits redacted evidence by default (probe labels, counts, hashes, pass/fail), avoiding raw ids, content, titles, embeddings, and fixture JSON in normal output;
- the portable validation source for handoff is generated by `uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db`, avoiding dependence on Alisson's private filesystem;
- docs and story artifacts explain behavior, validation route, limits, and privacy posture.

Handoff statement to Vinícius:

> The TS core now has proven `search` parity and a reusable, privacy-conscious real-DB-copy validation route. The ranker pattern, golden schema, and redacted parity harness are stable enough to extend. Please carry the rest of DS2 to completion by applying the same standard to `detect-persona`, journeys, and memory listing: committed synthetic fixtures for CI, copied-demo/local DB validation for realism, and redacted evidence by default.

### Baton 2: Vinícius closes the rest of CV22.DS2

Vinícius carried the second DS2 baton through `CV22.DS2.US2` (`detect-persona`) and `CV22.DS2.US3` (journeys & memory listing), closing CV22.DS2.

Plateau reached:

- `detect-persona` parity is implemented and validated — the pure Python router is ported to `ts/src/persona/detectPersona.ts` with exact behavioral parity (persona keys, hit-count scores, match type) on a branch-covering committed golden;
- journeys parity is implemented and validated — `list_journey_options` + the hierarchical sort are ported to `ts/src/journey/journeyOptions.ts` (pure) with a committed golden;
- memory listing parity is implemented and validated — `list_recent_memory_summaries` + `count_memories_by_type` are ported to `ts/src/memory/listing.ts` as a query builder + row mapper over the DB seam, with the sort pushed down to SQLite and listing-order realism proven against a copied DB in the harness (option B: CI covers builder/mapper, the harness covers ordering);
- the golden generator/verifier pattern is hardened by use across four command families, and the reusable real-DB-copy harness now carries `search`, `detect-persona`, `journeys`, and `memory-listing` probe families, redacted by default;
- real-DB-copy validation remains redacted by default and never commits real database artifacts; the portable demo DB now also carries synthetic personas and journeys with diversified memory types/layers/journeys;
- the CI determinism gate regenerates all three synthetic goldens;
- DS2 is closed as the read-only deterministic foundation for the strangler.

Handoff statement to Alisson:

> The TS core can now read Mirror deterministically with validated parity across the full DS2 command set — `search`, `detect-persona`, journeys, and memory listing — on synthetic goldens in CI and on real-DB copies through the redacted harness. The pure logic (ranker, router, journey sort) lives in tested `ts/src/` modules; the memory listing read model already issues real SQL through the `node:sqlite` seam, which is exactly the shape DS3 will call. The foundation is ready to be put behind a runtime front door. Please carry `CV22.DS3` and route these ported read commands to the TS core behind Pi, falling back to the frozen Python engine for everything unported, dogfooded daily with no user-visible language switch.

### Baton 3: Alisson closes CV22.DS3, Pi TS Front Door

Alisson carried the first runtime-facing transition state through `CV22.DS3`.

Plateau reached:

- the TS core is reachable through a Pi-facing front door at `ts/src/frontDoor/cli.ts`;
- routing is explicit and conservative in `ts/src/frontDoor/routing.ts`;
- DS2-ported read routes now enter TS: `detect-persona`, `journeys`, and non-search `memories`;
- `memories --search` remains on Python fallback because fresh semantic embedding/search is DS5 scope;
- every unported or mutating command remains on Python fallback, including writes, Builder/Ariad, Soul, Explorer, extraction, consult, and runtime operations;
- Pi skill docs for `/mm-journeys` and `/mm-memories` now enter through the front door without exposing a user-visible Python/TS switch;
- DS3 was validated locally with TS typecheck/lint/tests, `.pi` TypeScript check, generated-demo-DB front-door smoke routes, and Navigator-run smoke commands;
- commit `061ff86` (`Add Pi TypeScript front door for read-only routes`) was pushed to `mirror-ts-core`, and GitHub Actions passed across TS plus Python 3.10/3.12.

Handoff statement to Vinícius:

> DS3 is closed and pushed. The TS core is now reachable through the runtime front door for the DS2 read allowlist, while `memories --search`, all writes, and all unported/mutating flows still fall back to Python. CI is green at `061ff86`. Please carry `CV22.DS4` by porting deterministic writes with backup-gated, copy-validated parity, keeping mutation safety explicit and never proving write parity against the live production database.

### Baton 4: Vinícius carries CV22.DS4, Deterministic Writes

Vinícius carried the write-command block.

Plateau reached:

- deterministic write commands are ported to TS;
- writes are validated against database copies, never directly against the live production database during parity proof;
- backup gates and mutation safety are explicit;
- schema compatibility remains intact.

### Baton 5: Alisson closes CV22.DS5, External-API Commands

Alisson carried DS5 through the external-API command plateau after Vinícius closed DS4.

Plateau reached:

- TS has a safe provider substrate for external calls: env/config-only secrets, redaction, deterministic replay fixtures, and committed tests that do not hit live APIs;
- fresh semantic search can run through TS with replayed embeddings, TS ranking, grouped access-count semantics, and backup-gated access logging;
- conversation extraction orchestration is ported behind replayed LLM/embedding providers, with DB-copy validation and no live-provider CI dependency;
- consult command parsing, model resolution, request construction, credits/cost handling, and rendering have TS parity behind replayed providers;
- the front door now routes only the validated external surfaces under explicit replay-safe gates: `memories --search`, `consult credits`, and consult ask;
- unsafe, unconfigured, unknown, extraction-lifecycle, and out-of-scope paths remain Python fallback;
- DS5 closure includes a post-implementation multi-persona handoff review. Plan-stage persona review was skipped only because the protocol was adopted after implementation.

Handoff statement to Vinícius:

> DS5 is closed at the replay-safe external-API plateau. The TS core can exercise external-provider-backed command families without live credentials in CI, and the front door routes only validated DS5 surfaces under explicit gates while preserving Python fallback everywhere else. Please treat this as replay/copy-safe parity, not live-provider cutover. The next work should either verify/push the DS5 closure and then move toward DS6 convergence/schema custody, or explicitly plan a live-provider cutover story with the new multi-persona Plan review protocol before implementation.

### After Baton 5

The remaining convergence work was divided, risk-first, into five Delivery
Stories — see
[Decisions — CV22.DS6 splits into a risk-ordered retirement chain](../../decisions.md):
**DS6** Schema Custody Transfer, **DS7** Command Burn-Down & Re-homed Feature
Work, **DS8** Live-Provider Cutover, **DS9** TS MCP Server, **DS10** Python
Retirement & npm Distribution. DS6 and the first seven DS7 stories were
delivered under that division; their records live in the DS6 and DS7 packages
and in the [worklog](../../../process/worklog.md). The "likely ownership
pattern" the division proposed (mechanical seams to Vinícius, semantic
coherence and retirement decisions to Alisson) never became fine-grained
slicing and is superseded by the single-owner model above.

### Closed sequence

```text
Alisson: CV22.DS2.US1 search parity + CV22.DS2.TS3 reusable redacted real-DB-copy parity harness
→ Vinícius: finish CV22.DS2 read-only deterministic parity
→ Alisson: CV22.DS3 Pi TS front door and dogfooding
→ Vinícius: CV22.DS4 deterministic writes
→ Alisson: CV22.DS5 replay-safe external-API commands and gated front-door routing
→ DS6 and DS7 US1–US5, US10, TS2 under the risk-ordered division
→ 2026-09-07: single owner (Vinícius) for the DS7 remainder, DS8, DS9, DS10
```

---

## Why This Shape

The two-person shape reduced handoffs while keeping the migration incremental:
the baton changed hands when the terrain changed nature. The single-owner shape
keeps what made that work — plateaus, portable validation, decisions in files —
and replaces the human at the boundary with the persona panel, because the
thing a second person actually provided was not labor but dissent at the right
moment. That is the rhythm CV22 still needs: fewer transfers, clearer
plateaus, stronger continuity, and a review that cannot be skipped by accident.
