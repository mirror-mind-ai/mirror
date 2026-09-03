# Plan — CV22.DS7.US10 Extraction Lifecycle: Session Composites & LLM-Tail Flips

**Status:** pending Navigator approval
**Item:** CV22.DS7.US10 (User Story, implementable)
**Continues:** [CV22.DS7.US5](../cv22-ds7-us5-extraction-lifecycle/index.md) —
inherits its plan discipline, panel amendments, and debt register.
**Oracle state:** `main` merged through v0.31.14; US5 closed at `90bb5f4`.

---

## Objective

Finish the extraction-lifecycle burn-down. Wire `end_conversation`'s LLM close
tail — extraction **plus** close-time metadata finalization — behind the DS5
replay transport, port the session composites, repair paths, and backfills that
compose over it, resolve the float-metadata blocker gating `conversations
append`, and flip the remaining eight `conversation-logger` subcommands (plus
the `append` route) one proven, revertible flip at a time. When this story
closes, the `conversation-logger` family reaches 15/15 and the extraction
lifecycle has zero deterministic Python subcommands.

## What Python owns today (the surface being ported)

- **The close tail** — `services/conversation.py` (987 lines, the relevant
  half): `end_conversation` sets `ended_at`, runs `_run_extraction`, and in a
  `finally` runs `finalize_metadata_on_close` →
  `apply_generated_metadata_lifecycle(profile="close_time")`. Finalization
  happens **even when extraction fails**; the orphan is closed regardless.
- **The metadata lifecycle engine** — `services/metadata_lifecycle.py`
  (352 lines: execution profiles, per-field apply/regenerate/skip decisions,
  manual locks) plus `suggest_title` / `suggest_summary` / `_suggest_tags`,
  `title_needs_improvement`, `maybe_generate_title`, and the
  `generate_conversation_title|tags|summary` LLM surfaces in
  `intelligence/extraction.py`. **TS has no counterpart today** — this engine
  is the dominant unknown of the story and the real content of the "slice C
  remainder".
- **Session composites** — `session_start [--fast]`, `session_maintenance`
  (four timed steps in fixed order: close stale orphans → backfill Pi sessions
  → retitle pending → extract pending; report grammar
  `Label: count (%.1fs)` plus quarantined / parse-failed / carried-over warning
  tails), `_reset_session_orientation`, `close_stale_orphans` (30-minute
  threshold, active-session exclusion, per-orphan close-tail call with
  failure tolerance).
- **Diagnose/repair** — `diagnose_journey_associations` (read-only findings),
  `repair-journeys --apply` (a **mutating repair**), and
  `_infer_journey_for_conversation` (alias matching plus a semantic path).
- **Backfills** — `backfill_pi_sessions` (source-dir resolution order:
  argument → module override → `PI_SESSIONS_DIR` → `~/.pi/agent/sessions`;
  JSONL parsing; ≥2-message gate; provisional title; runtime-session upsert
  with `closed_at`), `backfill_codex_session`, and the **session-less
  backfill-only path** in `hook_session_end` (empty `session_id`, transcript
  present → backfill still runs; US5's hook port deliberately left it out).

**Already on TS (reused, not re-ported):** the US5 deterministic logger core
(`ts/src/conversation/logger.ts`), the `append` port
(`ts/src/conversation/append.ts`, unrouted), the budgeted extraction driver
with its injected `runExtraction` seam
(`ts/src/conversation/extractionDriver.ts` — AI-05 budget and S7 isolation
pinned), and the DS5 orchestration `runConversationExtraction`
(`ts/src/conversation/extraction.ts` — extraction, summary, embeddings).

## Slices (risk-first; letters continue US5's lettering)

- **C′ — Close tail under replay (the slice C remainder).** ✅ Done
  2026-09-03 (`e132b6b`, `fb49d6f`, `80d2a9e`, and the close-tail commit).
  Scope grew by one Navigator-approved decision: TypeScript assembled no
  prompt bytes at all, so the DS5 surfaces (`extraction`, `task_extraction`,
  `curation`) were retrofitted with full assembly rather than leaving a live
  DS8 provider to ship the model a bare transcript.
  Port the metadata lifecycle engine (profiles, per-field decisions, manual
  locks) and the title/tags/summary suggestion surfaces behind the replay
  transport. Port `end_conversation` semantics exactly: `ended_at` first,
  extraction, `finally`-finalization. Wire the driver's injected
  `runExtraction` to `runConversationExtraction` under the same config gate as
  US3/US4 (replay in CI, Python fallback when unconfigured). Land the two
  blocking US5 panel amendments here: the **prompt-assembly parity golden**
  extended to every close-tail surface (extraction, title, tags, summary,
  tasks) **and to every assembly branch within a surface** (title only when
  `title_needs_improvement` passes; tags from the just-generated summary vs.
  from a fresh refinement summary — two distinct assembled inputs), and the
  **replay prompt-digest assertion** (fixtures gain a per-request
  assembled-prompt digest; `ReplayLlmProvider` fails loudly on mismatch,
  because role-only resolution would replay a drifted prompt silently).
  S13/S14 LLM-call ledger parity is graded as an **ordered per-scenario call
  sequence** — happy path, the conditional double-summary branch,
  extraction-failure-then-finalize, and the idempotent re-run asserting
  **zero calls** — because end-state equality alone cannot expose a diverged
  call graph (2026-09-03 panel, blocking).
- **B′ — Float-metadata resolution + `conversations append` flip.** ✅ Done
  2026-09-03. Revert control: `MIRROR_TS_CONVERSATION_APPEND=0` (the flip
  checklist required revertibility and `append` had no gate of its own; the
  logger kill switch does not cover it).
  Resolve the integer-valued-float divergence (`1.0` Python vs `1` TS;
  metadata bytes participate in the idempotency comparison) via the resolved
  fix-Python-first route below. The Python fix follows the project's own
  precedent: proven red-before-green on 3.10 **and** 3.12, and the published
  append contract text (v0.31.13, CV9.E2.S31) is updated in the same change
  to state value-semantics ("same JSON value", not "same bytes") for metadata
  idempotency. Then flip the `append` route through the seven-point
  checklist. The flip is **confirmed in-scope** for US10 (Navigator,
  2026-09-03).
- **D — Session composites.**
  `session-start [--fast]` and `session-maintenance`, composing slice A (US5)
  and slice C′ pieces in Python's exact step order. Report parity is
  string-exact in grammar and counts; elapsed-seconds values are wall-clock
  and cannot be byte-stable — parity strategy per resolved decision 2.
- **E — Diagnose/repair + backfills.**
  `diagnose-journeys` (read-only), `repair-journeys` (dry-run default;
  `--apply` proven on copies with before/after assertions, same discipline as
  every write), journey inference with its semantic path behind the replay
  gate if it touches embeddings, `backfill-pi-sessions`,
  `backfill-codex-session`, and the session-less `session-end` backfill path.
- **F — Routing flips + E2E.**
  Flip `switch`, `session-end-pi`, `session-end` (hook), `session-start`,
  `session-maintenance`, `diagnose-journeys`, `repair-journeys`, and
  `backfill-codex-session` — in explicit dependency order (2026-09-03 panel):
  `switch` / `session-end-pi` / `session-end` require slice C′ only;
  `diagnose-journeys` / `repair-journeys` / `backfill-codex-session` require
  slice E; `session-maintenance` and full `session-start` additionally
  require slice D plus slice E's `backfill-pi-sessions`. No flip may precede
  its dependency's proof. Each flip behind the seven-point flip readiness
  checklist,
  each independently revertible via `MIRROR_TS_CONVERSATION_LOGGER=0`, with
  the regression route over already-flipped families re-run per flip and the
  burn-down ledger updated per flip.

## Resolved decisions (Navigator, 2026-09-03)

1. **Float metadata (slice B′): fix Python first.** The Python canonical
   serializer collapses integer-valued floats to their JSON number form
   (`1.0` → `1`), matching JSON semantics and TS; then port at parity —
   consistent with the two US5 precedents. The idempotency comparison becomes
   numeric-aware so batches already stored with `1.0` bytes do not raise a
   spurious `idempotency_conflict`; the contract's semantics are recorded as
   "same JSON value", not "same bytes". The rejected alternative — a TS-side
   raw-preserving parse reproducing Python's bytes — would have imported a
   nonstandard JSON parser into the published append contract.
2. **Timed report values (slice D): injected test clock + normalized
   timings.** TS gains a test-only injectable clock; goldens and cross-core
   comparison grade the full report string with timing fields normalized —
   the normalizer **validates the token grammar before replacing it**
   (` (N.Ns)` — one digit after the decimal, parentheses, trailing `s`), so
   grammar drift still fails while the wall-clock value is ignored
   (2026-09-03 panel amendment). Every other byte stays exact.
3. **Hook-race coverage: decided during slice D, not silently.** Concurrent
   hook get-or-create under the composites is either proven on copies with
   the 8-process contention pattern or recorded as an accepted risk with
   rationale.

The `conversations append` flip is confirmed in-scope for US10.

## Non-goals

- **No live-provider cutover (DS8).** The live LLM/embedding call stays
  config-gated; CI is replay-only; unconfigured installs keep Python fallback.
- **No behavioral fence or prompt re-measurement.** Bytes are the spec;
  D-010/`DISTANCING_MARKERS` and the S29 summary residual stay protected;
  `eval --all` re-baselining over TS-assembled prompts remains the named DS8
  gate recorded in US5's done notes.
- **No re-port of the DS5 orchestration core** and no rewrite of US5's landed
  slices.
- **No product fix for the pre-existing malformed-metadata fragility** (one
  corrupt row fails the whole scan — both cores identical; US5 debt
  observation 2). Parity, not improvement.
- No MCP (DS9), no web-process/package work (DS10), no sibling DS7 stories
  (US6 Soul, US7 Explorer, US8 Builder/Ariad, US9 Workspace/web, TS1 ops
  tail).

## Acceptance behavior

```text
Given a disposable Mirror home and the replay transport configured
When a full session lifecycle runs through the TS front door
  (session-start → logging → session-end → budgeted extraction → maintenance)
Then conversations, messages, memories, embeddings, and the LLM-call ledger
  match the Python oracle on the same starting copy
And the maintenance report is string-identical with timing values normalized
And close-time metadata finalization runs even when extraction fails
And every remaining conversation-logger subcommand answers from TS
And conversations append routes to TS with the float divergence resolved
And unproven paths keep reaching Python fallback unchanged until their flip
```

## Validation route

Inherits US5's discipline wholesale (recipes in the US5
[test-guide](../cv22-ds7-us5-extraction-lifecycle/test-guide.md)); this story
adds:

- **Committed synthetic goldens per slice**, including stdout goldens for the
  maintenance report (normalized timings), diagnose findings, and backfill
  counts; generators follow the hardened env-pinning pattern (`MIRROR_USER`
  pinned, temp paths verified — US4 incident rule).
- **Metadata-lifecycle characterization goldens:** Python dry-run reports over
  a fixed conversation corpus (per-field decisions, profile actions, manual
  locks) reproduced field-identical by the TS engine — the port of the
  352-line decision engine is graded by its decisions, not by code reading.
- **Replay fixtures with prompt digests** for every LLM-touching path
  (extraction, title, tags, summary); digest mismatch is a loud deterministic
  CI failure.
- **Prompt-assembly parity golden** extended to all close-tail surfaces;
  byte-identical assembled prompts, transcript formatting included.
- **Real-DB-copy write probes:** close-tail end-state (extraction +
  finalization), composite end-state, and `repair-journeys --apply`
  before/after assertions — backup-gated, redacted, never against the live DB.
- **Oracle-drift registrations** in the same commit as the port:
  `services/conversation.py`, `services/metadata_lifecycle.py`, and any newly
  depended oracle file.
- **Hook-inclusive E2E (required):** the full-lifecycle smoke drives
  `user-prompt` and `session-end` through the runtime's env/stdin contract,
  including the session-less backfill-only path, copy-paste runnable before
  the first slice-F flip.
- **Edge-case corpus:** empty pending queue; muted session writes nothing;
  discarded conversation never extracted or finalized; idempotent
  `session-maintenance` re-run; stale-orphan threshold boundary; orphan whose
  extraction fails still closes and finalizes; quarantine / parse-failed /
  carried-over warning tails; backfill skips `<2`-message and already-tracked
  sessions; `session-end` with no session and no transcript exits silently.
- **RS005/CR026 redaction check** per newly-routed subcommand.
- **Regression route per flip:** front-door routing suite plus the smokes of
  every already-flipped family (US1–US4, TS2, US5 slice A).
- **Seven-point flip readiness checklist** per subcommand, ledger updated per
  flip.

E2E decision: **required** — the composite story exists to prove the lifecycle
end to end; fixture-level validation alone cannot carry a flip.

## Debt observations (for this story's Debt Review)

Recorded as found, not acted on — parity-preserving today.

1. **`close_stale_orphans` is an unbounded spender** (2026-09-03 panel,
   ai-engineer). AI-05 bounds `extract_pending`, but each stale orphan runs
   the full close tail — extraction plus up to three finalization calls —
   with no cap on orphan count. Parity means porting the unbounded behavior;
   the port must not "fix" it silently. Named here as a DS8 planning input:
   a live maintenance run can multiply spend by orphan count.
2. **The close tail pays for a summary it discards** (found while porting,
   slice C′). `_suggest_tags` declares a `generated_summary` parameter and
   never reads it. When the tags action is apply/regenerate, no summary was
   generated, and the summary decision is `refine_candidate`, Python calls
   `suggest_summary` a second time purely to pass the result into that unused
   parameter. Reproduced in `close-tail.golden.json`
   (`double_summary_when_generation_is_blank`): four calls, zero bytes
   changed. Ported for parity; a one-line fix in Python would remove a real
   per-close cost, but that is a behavior change and belongs to its own CR.
3. **Re-closing a finalized conversation is not free** (slice C′). A generated
   title plus six or more messages decides `refine_candidate`, which the
   `close_time` profile regenerates, so closing an already-finalized
   conversation costs three more calls. Relevant to `close_stale_orphans` and
   to any future retry path; recorded as DS8 cost input.
4. **Two stored-JSON byte divergences, fixed in slice C′ rather than
   deferred.** `JSON.stringify` matches neither Python serialization: it omits
   the `", "`/`": "` separators `json.dumps` always writes, and Mirror uses
   both `ensure_ascii` settings depending on call site (conversation
   metadata/tags raw, memory tags escaped). Three DS5 extraction sites were
   writing divergent bytes into columns both cores read. Fixed with a second
   helper and pinned against the oracle. Named here because the same class of
   defect is what slice B′'s float-metadata decision addresses — stored JSON
   bytes are a parity surface, not a formatting preference.

## Risks

- **The metadata-lifecycle engine is the dominant unknown:** a ~350-line
  decision engine with profiles and manual locks, invisible in US5's scope.
  Mitigated by characterization goldens from Python's own dry-run reports
  before the TS port begins.
- **The close tail is the hot path:** `session-end` fires at every Pi session
  end; `close_stale_orphans` calls the full close tail per orphan. The
  `finally`-finalization and failure-tolerance semantics must match exactly.
- **Float-metadata fix touches stored data semantics:** the idempotency
  comparison must tolerate legacy `1.0` bytes or replays of old batches break.
  Owned by resolved decision 1.
- **Timing nondeterminism in report strings** — owned by resolved decision 2.
- **Filesystem seams:** `PI_SESSIONS_DIR` resolution order and the
  `CLAUDE_PROJECT_DIR` transcript fallback must be pinned in every test.
- **Moving oracle:** CV20 keeps changing `main`; the drift tripwire plus
  same-commit baseline advances are the defense.
- **Coordination:** if Alisson's pause-preserved US5-era work surfaces
  mid-story, reconcile at a slice boundary, never mid-slice.

## Implementation contract

- TDD/characterization tests for every behavior change; Python's outputs are
  the characterization source.
- Keep changes scoped to `CV22.DS7.US10`; one module per concern under
  `ts/src/conversation/` — no god-module.
- Use `uv run` for Python commands and tests.
- No `git add .`; commit only story-scoped files; descriptive English commit
  messages explaining why.

## Stop conditions

- scope_change_detected (any close-tail surface not named here)
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed (the slice-D hook-race disposition; any new
  divergence found while porting)

## Approval gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.

## Persona plan review (2026-09-03)

Panel: ai-engineer, prompt-engineer, quality-assurance (Navigator-requested,
per the collaboration-strategy protocol). Findings absorbed above; summary:

- **ai-engineer — 1 blocking, 1 debt observation.** Blocking: end-state
  equality cannot expose a diverged call graph — the metadata-lifecycle
  engine decides *whether* and *how often* each LLM surface fires (including
  the conditional double-summary branch and failure-path finalization), so
  slice C′ grades the LLM-call ledger as an ordered per-scenario sequence,
  with the idempotent re-run asserting zero calls. Debt observation:
  `close_stale_orphans` unbounded spend, recorded for Debt Review and DS8.
- **prompt-engineer — no blockers, 1 constraint.** Assembly goldens are
  enumerated per *branch*, not only per surface: the tags prompt has two
  distinct assembled inputs (generated vs. refinement summary) and the title
  prompt assembles conditionally; a per-surface golden could go green while
  the second-summary branch drifts.
- **quality-assurance — no blockers, 3 constraints; approve-with-amendments.**
  Timing normalization validates the `(%.1fs)` token grammar before replacing
  the value; the eight flips carry an explicit dependency order in slice F;
  the slice B′ Python fix is proven red-before-green on 3.10 and 3.12 and
  updates the published append contract text to value-semantics in the same
  change.

## Approval question

Approve this five-slice plan (C′ → B′ → D → E → F, per-subcommand flips in
explicit dependency order, E2E required) as amended by the 2026-09-03 panel —
ordered call-sequence ledger goldens with a zero-call re-run assertion,
per-branch assembly goldens, grammar-validating timing normalization, the
red-before-green 3.10/3.12 contract-text discipline for slice B′, and the
unbounded-orphan-spend debt observation — with the three Navigator decisions
and the in-scope `append` flip recorded above?
