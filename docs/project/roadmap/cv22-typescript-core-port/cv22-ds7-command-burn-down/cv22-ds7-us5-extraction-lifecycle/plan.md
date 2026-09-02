# Plan — CV22.DS7.US5 Extraction Lifecycle

**Status:** pending Navigator approval
**Item:** CV22.DS7.US5 (User Story, implementable)
**Oracle state:** merged `main` through v0.31.14 (`1b8f164`) — freshest possible
extraction oracle, including the v0.31.13 explicit append boundary.

---

## Objective

Transfer the `conversation-logger` command family and the extraction pipeline it
drives from Python to the TS core — the largest write orchestration in the
burn-down — with deterministic writes proven on copies, injection-fence parity,
and the live embedding/LLM call left on the DS8 seam behind the DS5 replay
`LlmTransport`. Flip routing per subcommand only after that subcommand's parity
is proven; every flip independently revertible.

## What Python owns today (the surface being ported)

`src/memory/cli/conversation_logger.py` (1,118 lines) — subcommands:
`user-prompt`, `session-end` (hooks), `mute`/`unmute`/`status`, `switch`,
`log-user`/`log-assistant`, `session-start [--fast]`, `session-maintenance`,
`discard-current`, `session-end-pi`, `diagnose-journeys`/`repair-journeys`,
`backfill-codex-session`; internal drivers `extract_pending` (AI-05 budget,
S7 failure isolation), `retitle_pending_conversations`, `close_stale_orphans`,
`backfill_pi_sessions`, journey inference.

`src/memory/intelligence/extraction.py` (516 lines) — extraction prompt +
fence family (AI-16/AI-22/AI-25: fence + post-fence sandwich for
title/tags/summary), task extraction, memory + embedding inserts, idempotency
(CV9.E2.S9).

`src/memory/services/conversation_append.py` (253 lines, v0.31.13) — atomic,
idempotent, exact-destination `conversations append` boundary; carries the
D-016 WAL read-only recovery context.

**Already on TS (DS5, reused not rewritten):** `ts/src/conversation/extraction.ts`
(`runConversationExtraction` orchestration behind replay) and
`ts/src/extraction/{conversation,fencing,json}.ts`. US5 wires the *lifecycle*
around this core; it does not re-port the DS5 orchestration.

## Slices (risk-first)

- **A — Deterministic session/conversation writes (no LLM).**
  `mute`/`unmute`/`status`, `switch`, `log-user`/`log-assistant`,
  `discard-current`, `session-end-pi`, and the `user-prompt`/`session-end`
  hooks' deterministic paths. Pure DB seam writes: conversation
  get-or-create, message insert, session binding, discard marker. Port to
  `ts/src/conversation/logger.ts` (one module per concern, no god-module).
- **B — `conversations append` boundary (v0.31.13 parity).**
  Port `conversation_append.py` semantics: atomic batch append, idempotency
  by request identity, exact-destination refusal semantics. Explicit decision
  in-slice for the D-016 WAL read-only fallback TS counterpart (restart-backlog
  owner: this slice) — port it or record a scoped deferral with revisit trigger.
- **C — Extraction driver behind replay.**
  `extract_pending`: oldest-ended-first, `MEMORY_MAINTENANCE_MAX_EXTRACTIONS`
  budget, per-conversation failure isolation, idempotent re-entry, quarantine /
  parse-failed / carried-over counters. Calls the DS5 TS orchestration; fresh
  embedding + live LLM stay config-gated exactly like US3/US4 (replay in CI,
  Python fallback when unconfigured). The S13/S14 LLM-call ledger rows are
  part of this slice's parity contract (ai-engineer review) — `inspect
  llm-calls` (TS1) must not inherit a divergence.
- **D — Session lifecycle composites.**
  `session-start` (fast + full), `session-maintenance` (timed steps: extraction
  budgeted, retitle pending, close stale orphans, report). String-exact report
  parity; composite reuses A + C.
- **E — Diagnose/repair + backfills.**
  `diagnose-journeys`/`repair-journeys` (dry-run default, `--apply` gate),
  `backfill-pi-sessions` (`PI_SESSIONS_DIR` jsonl parsing),
  `backfill-codex-session`. Journey inference's semantic path gets the same
  replay gate if it touches embeddings. `repair-journeys --apply` is a
  **mutating repair** (QA review): dry-run parity and apply parity are both
  proven on copies with before/after assertions, same discipline as every
  other write — not "deterministic file/DB work".
- **F — Per-subcommand routing flips + E2E smoke.**
  Each subcommand's `routing.ts` entry flips only after its slice proves
  parity; unproven subcommands stay on Python fallback. No user-visible change.

## Non-goals

- No live-provider cutover (DS8): live embedding/LLM calls remain gated; CI is
  replay-only.
- No MCP (DS9), no web-process/package work (DS10), no sibling DS7 stories.
- No behavior change: prompts, fences, budgets, orderings, and report strings
  are reproduced, not improved. Explicitly protected residuals:
  `DISTANCING_MARKERS`/D-010 and the S29 summary 9/10 residual — the port must
  not "clean up" prompt text, whitespace, or fence lines; bytes are the spec.
- No behavioral fence re-measurement in this story: string/assembly parity
  only. Re-baselining TS-assembled prompts through `eval --all` is a named
  **DS8 gate**, recorded in this story's done notes so it cannot be lost.
- No re-port of the DS5 extraction orchestration core.
- `journey_projections` + Extension API 1.1 and `journey_admin` restart-backlog
  items are **not** absorbed here — proposed owners recorded below.

## Restart-backlog ownership (decision 2026-09-02, clause 3)

- **D-016 WAL read-only fallback** → owned here, slice B (port or scoped defer).
- **`journey_admin` surface** → proposed rider on CV22.DS7.US9 (it feeds the
  Workspace/web endpoints US9 owns) — confirmed at US9 pull, not now.
- **`journey_projections` / Extension API 1.1** → proposed for DS10 planning
  input (projection consumers are runtime-convergence scope) — confirmed at
  DS10 pull, not now.

## Acceptance behavior

```text
Given a disposable Mirror home with a real-shaped database copy
When a full conversation lifecycle runs through the TS front door
  (session-start → log-user/log-assistant → session-end → budgeted extraction
   under replay → retitle/orphan maintenance)
Then conversations, messages, memories, and embeddings land byte/order-identical
  to the Python oracle on the same starting copy
And mute/switch/discard/append behave string- and state-identically
And every unproven subcommand still reaches Python fallback unchanged
And no fence, budget, idempotency guard, or failure-isolation behavior is lost
```

## Validation route

- **Committed synthetic goldens** per slice (CI): logger state transitions,
  append boundary outcomes, extraction driver ordering/budget/isolation —
  including a backlog-exceeds-budget case (AI-05 property: oldest-first, at
  most `limit`, visible carried-over count) and a poison-pill transcript case
  (S7 property: failure recorded, batch continues, quarantine counters match) —
  and maintenance report strings. Generators follow the hardened env-pinning
  pattern (`MIRROR_USER` pinned, temp-path verified — US4 incident rule).
- **Replay fixtures** for every LLM/embedding-touching path; no live calls in CI.
- **Real-DB-copy harness**: new probe families for logger writes and extraction
  end-state; backup-gated, redacted by default, never against the live DB.
- **Oracle-drift baseline**: `cli/conversation_logger.py`, `prompts.py`, and
  `extraction.py` are already registered; add `services/conversation_append.py`
  and any newly-depended oracle files in the same commit as the port.
- **Prompt-assembly parity golden (prompt-engineer review):** a Python
  generator emits the fully-assembled prompt per surface (extraction, title,
  tags, summary, tasks) over a fixed transcript; TS must reproduce each
  byte-identical. Component goldens cannot stand in for the assembled whole;
  transcript formatting (role labels, `user_name`, truncation) is part of it.
- **Replay prompt-digest assertion (ai-engineer review, blocking):** the
  `ReplayLlmProvider` currently resolves by `request.role` only, so a drifted
  TS prompt would replay silently. Extraction fixtures gain an
  assembled-prompt digest per request and the provider fails loudly on
  mismatch — prompt drift becomes a deterministic CI failure.
- **RS005/CR026 redaction test** per newly-routed subcommand: command names and
  routing logged, never argument payloads (message content is identity text).
- **E2E (required):** disposable-home front-door smoke of the full lifecycle,
  Navigator-runnable, before any routing flip commits. The smoke must invoke
  the `user-prompt` and `session-end` **hook entries exactly as the runtime
  does** (env/stdin contract, session-resolution bridge), not only the direct
  subcommands — the hook path is the hot path (QA review, blocking). The
  test-guide must be copy-paste runnable before the first flip.
- **Regression route per flip (QA review, blocking):** every US5 routing flip
  re-runs the front-door routing suite plus the existing smokes of the
  already-flipped families (US1–US4, TS2) — shared seams
  (`runtime_sessions`, `conversations`, routing table) must not reopen closed
  stories.
- **Edge-case golden corpus (QA review):** muted session writes nothing
  end-to-end; discarded conversation is never extracted; repeated
  `session-maintenance` is an idempotent no-op; empty pending queue;
  zero-message conversation; no-active-session output; stale-orphan threshold
  boundary. Concurrent hook get-or-create is either proven on copies (reuse
  the 8-process contention pattern) or recorded here as an accepted risk with
  rationale — decided during slice A, not deferred silently.
- **Per-subcommand stdout goldens:** the strangler unit is
  `command + args → stdout`; every routed subcommand's output strings are
  golden-graded (`status`, `switch`, `discard-current`, maintenance reports),
  not only DB end-states.
- **Flip readiness checklist (QA review):** a subcommand flips only when all
  seven are green — goldens · copy-probe · hook-inclusive E2E · regression
  pass · redaction · revertibility exercised · burn-down ledger updated.

## Risks

- **Blast radius:** conversation writes are the highest-volume writes in the
  product; a silent divergence corrupts the primary data stream. Mitigated by
  per-slice flips + copy-proof + revertibility.
- **Hooks run in runtime hot path** (`user-prompt`, `session-end`): regressions
  hit every Pi session. E2E smoke covers the hook entry specifically.
- **Fence parity is security-critical** (AI-16/22/25 family): fences port with
  the pipeline; the shared `fence_untrusted` contract already exists in
  `ts/src/extraction/fencing.ts` — extend coverage, do not fork it.
- **Coordination:** Alisson's pause-preserved uncommitted US5 work — if it
  surfaces mid-story, reconcile at the slice boundary rather than merging blind.

## Persona plan review (2026-09-02)

Panel: ai-engineer, prompt-engineer, quality-assurance (Navigator-requested).
Findings absorbed above; summary:

- **ai-engineer — 1 blocking, 3 constraints.** Blocking: replay resolves by
  `request.role` only, so prompt-assembly drift replays silently → fixtures
  gain per-request assembled-prompt digests with loud mismatch failure.
  Constraints: AI-05 budget and S7 poison-pill properties enter the golden
  corpus; S13/S14 LLM-call ledger rows join slice C's parity contract;
  behavioral fence re-measurement (`eval --all` over TS-assembled prompts) is
  a named DS8 gate recorded in done notes.
- **prompt-engineer — no blockers, 2 constraints.** Prompts port as bytes,
  never re-typed/normalized (D-010 and the S29 summary residual explicitly
  protected); a fully-assembled-prompt-per-surface parity golden is required
  because component goldens cannot prove the assembled whole. Endorses the
  replay-digest mechanism as the enforcement point of the byte contract.
- **quality-assurance — 2 blocking, 4 constraints.** Blocking: the E2E must
  exercise the `user-prompt`/`session-end` hook entries via the runtime's
  env/stdin contract (the hot path), and every flip needs a named regression
  route over the already-flipped US1–US4/TS2 families. Constraints:
  behavior-defining edge cases enter the golden corpus (mute, discard,
  idempotent re-run, empty queue, no-active-session, orphan threshold;
  hook-race decided explicitly); `repair-journeys --apply` is proven on copies
  as a mutating write; per-subcommand stdout goldens; the seven-point flip
  readiness checklist with a copy-paste-runnable test guide before first flip.
  Verdict: approve-with-amendments.

## Resolved decision — `conversations append` timestamps were version-dependent (2026-09-02)

**Navigator chose option 3: fix Python first, then port at parity** — the same
route taken for the `--mirror-home` finding, and the only option that makes the
published contract true on every supported runtime.

Landed: `_normalize_timestamp` now pads/truncates the fractional second itself
instead of delegating to `datetime.fromisoformat`, whose accepted widths change
across supported Pythons. Every RFC 3339 fraction width normalizes identically
on 3.10 and 3.14; precision finer than a microsecond truncates rather than
rejects. Proven red-before-green **on 3.10 specifically**: without the fix,
exactly the non-3/6-digit cases fail there while passing on 3.14 — the reason
the defect survived its own test suite.

The TS port then matched at parity, and both
`services/conversation_append.py` and `storage/messages.py` are now registered
oracles.

**Known divergence, registered for Debt Review:** caller metadata containing an
integer-valued float (`1.0`) serializes as `1.0` in Python and `1` in TS,
because `JSON.parse` collapses the distinction before either core sees it.
Non-integer floats agree. Metadata bytes participate in the idempotency
comparison, so a batch written by one core and replayed through the other with
such metadata would raise `idempotency_conflict`. Not reachable today (the TS
route is not wired), but it must be resolved before `append` flips.

### Original finding

`_normalize_timestamp` validates `createdAt` with
`(?:\.\d+)?` — advertising RFC 3339's "any number of fractional digits" — and
then calls `datetime.fromisoformat`, which on **Python 3.10 accepts only 3 or 6
fractional digits**. The project supports `>=3.10` and CI tests 3.10 and 3.12,
so the same request is accepted or rejected depending on which Python the
user's Mirror runs:

| `createdAt` | Python 3.10 | Python 3.11+ |
|---|---|---|
| `2026-09-02T12:00:00Z` | accepted | accepted |
| `2026-09-02T12:00:00.5Z` | **`malformed_request`** | `.500000Z` |
| `2026-09-02T12:00:00.12Z` | **`malformed_request`** | `.120000Z` |
| `2026-09-02T12:00:00.123456Z` | accepted | accepted |
| `2026-09-02T12:00:00.1234567Z` | **`malformed_request`** | truncated `.123456Z` |

This matters more than an internal inconsistency would: `conversations append`
is the **published contract for external shells** (CV9.E2.S31, v0.31.13). Its
spec says "timezone-aware RFC 3339 input, normalized to UTC
`YYYY-MM-DDTHH:mm:ss.ffffffZ`", and RFC 3339 permits any number of fractional
digits. A third-party integration sending `.5Z` therefore works against one
install and fails against another, with a bounded rejection that does not
explain why. The documented example uses `.000Z` (three digits), which happens
to work on both, so the gap is invisible in the docs' own sample.

Options:

1. **TS matches 3.10** (strictest): accept only 3 or 6 fractional digits.
   Consistent everywhere, but rejects requests that currently succeed for most
   users, and contradicts the spec's RFC 3339 claim.
2. **TS matches 3.11+**: accept any digit count, truncate to microseconds.
   Matches the spec and most installs, but diverges from 3.10 installs.
3. **Fix Python first** (the CV22 precedent from the `--mirror-home` finding):
   normalize the fraction explicitly instead of delegating to
   `fromisoformat`'s version-dependent parser — pad/truncate to 6 digits — so
   behavior is identical on every supported Python. Then port at parity.

Driver recommendation: **option 3**, consistent with the previous decision and
with the fact that Python still owns this entry point. It is also the only
option that makes the published contract true on every supported runtime.

Slice B's characterization tests were parked during the decision and are now
active at `ts/test/conversation/append.test.ts`.

## Resolved decision — hooks ignore `--mirror-home` in Python (2026-09-02)

**Navigator chose option 3: fix Python first, then port at parity.** Python
still owns this entry point under the moving-target rule, so the defect was
corrected in the authority rather than diverged around in the port.

Landed: `hook_user_prompt` and `hook_session_end` now accept `mirror_home` and
thread it into `is_muted`, `log_user_message`, `end_session`, and
`backfill_assistant_messages`; `main()` passes the parsed value. Passing `None`
preserves the ambient module-level resolution the runtime hooks rely on, so
installed runtimes are unaffected. Three Python tests pin the new behavior
(explicit home honored for writes, mute state read from the explicit home,
session-end targeting), and one existing test that asserted the old positional
call signature was updated deliberately.

Because TS already honored `--mirror-home`, the port needed no behavior change
— the two cores converged on Python's side. The oracle-drift tripwire fired on
`conversation_logger.py` as designed; the goldens regenerated unchanged, TS
gained two tests covering `--mirror-home` targeting, and the baseline was
advanced in the same commit.

The original finding is preserved below for provenance.

### Original finding

Python's `main()` extracts `--mirror-home`, but `hook_user_prompt()` and
`hook_session_end()` take no arguments and never receive it: they call
`is_muted()` and `log_user_message(session_id, prompt)` against the ambient
module-level home. So `conversation-logger user-prompt --mirror-home X` accepts
the option and writes somewhere else.

Found by running the slice-A revertibility check, which wrote one session, one
conversation, and one message into `~/.mirror-minds/vinicius-ts/memory_test.db`
(the **test** database in the real home, never production). Work stopped, a
snapshot was taken, exactly those three rows were removed, and the database
returned to empty; nothing pre-existing was modified.

The TS port currently threads `--mirror-home` through to the hooks, which is
safer and hermetically testable but is a **behavior change**, and this story's
non-goals forbid silent improvement. Options:

1. **Match Python exactly** — hooks ignore `--mirror-home`. Strict parity;
   preserves a defect that makes hermetic runs impossible and can write to an
   unintended database.
2. **Keep the TS behavior** — hooks honor `--mirror-home`. Safer and testable,
   but a named divergence that must be recorded as an intentional deviation and
   most likely fixed in Python too, so the two cores reconverge.
3. **Fix Python first** (it still owns this entry point under the moving-target
   rule), then port the fixed behavior at parity.

Navigator decision required before the slice-A routing flip; this is a scope
question, not a Driver call. Until it is decided the route stays gated.

Validation-route correction from the same run: on the Python side the E2E must
export `MIRROR_HOME` (module-level resolution honors it) rather than relying on
`--mirror-home`, or the fallback writes outside the disposable home.

## Approval question

Approve this six-slice plan (A→F, per-subcommand flips, E2E required,
D-016 owned in slice B, other backlog owners proposed-not-bound), including
all panel amendments: replay prompt-digest assertion, assembled-prompt parity
golden, budget/poison-pill golden cases, ledger parity in slice C, the named
DS8 behavioral re-baselining gate, hook-inclusive E2E, per-flip regression
route over already-flipped families, the QA edge-case corpus with an explicit
hook-race decision, apply-mode repair proof on copies, per-subcommand stdout
goldens, and the seven-point flip readiness checklist?
