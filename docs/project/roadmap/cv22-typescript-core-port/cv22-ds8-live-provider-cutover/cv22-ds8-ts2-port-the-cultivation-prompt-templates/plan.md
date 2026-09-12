[< Story](index.md)

# Plan — CV22.DS8.TS2

**Authored:** 2026-09-13 · **Plan review:** 2026-09-13, four lenses (ai-engineer,
prompt-engineer, security-engineer, quality-assurance), findings folded in —
see [Plan review](#plan-review-2026-09-13) · **Status:** pending Navigator approval

## Objective

Make `consolidate scan` and `shadow scan` send Python's real prompts from
TypeScript — byte-identical to the oracle and digest-pinned — so the last two
replay-gated leaves can flip live and DS8's burn-down table empties.

## Why this is its own story

US3 assumed every leaf it flipped already assembled Python's prompt in TS and
merely lacked a digest. That was false for these two:
`ts/src/cultivation/propose.ts` sends a fenced Markdown dump of the memories
(121 and 209 bytes against Python's 2,247 and 1,598) with no task statement,
no untrusted-input guard, and no JSON output contract. Replay never reads the
prompt, so it survived to DS8. Live, the model would receive a memory dump with
no instruction, return prose, fail `parseJsonResponse`, and every scan would
report "no proposals" while the ledger showed paid calls. See
[Why TS2 exists](../index.md#why-ts2-exists-2026-09-11).

## Oracle

| Surface | Template | Assembly | Inputs and where Python gets them |
|---|---|---|---|
| `consolidation` | `CONSOLIDATION_PROMPT` (`src/memory/intelligence/prompts.py`) | `consolidate.py:141-145` — `.format(user_name, identity_context, cluster_text)`; `cluster_text = fence_untrusted("cluster", _format_cluster(cluster))` | `user_name` ← `consolidate_cmd._user_name`; `identity_context` ← `consolidate_cmd._identity_context` (ego/behavior, ego/identity, self/soul; each `content[:600]`; joined by blank line; fallback `(no identity context loaded)`) |
| `shadow_scan` | `SHADOW_SCAN_PROMPT` (same file) | `shadow.py:85-92` — `.format(user_name, shadow_structure, shadow_memories)`; only `shadow_memories` is fenced (`shadow_memories`); `shadow_structure` is system-side and unfenced by design | `user_name` ← `shadow_cmd._user_name`; `shadow_entries` ← `get_identity_by_layer("shadow")` |

Both templates embed a JSON example with doubled braces for `str.format`, so
assembly goes through `pyFormat` (`ts/src/util/pythonText.ts`), never
`String.replace` — the exact hazard the US11 prompt-assembly golden caught.

## Scope

1. **Templates.** Add `CONSOLIDATION_PROMPT` and `SHADOW_SCAN_PROMPT` to
   `ts/src/extraction/prompts.ts` — the one module that mirrors `prompts.py`
   — generated from the Python source, never re-typed.
2. **Assembly.** `buildConsolidationPrompt(cluster, userName, identityContext)`
   and `buildShadowScanPrompt(memories, shadowEntries, userName)` in
   `propose.ts`, reusing the already-ported `formatCluster`,
   `formatShadowMemories`, `formatShadowStructure`, and `fenceUntrusted`.
   `proposeConsolidation` / `proposeShadowObservations` send the built prompt;
   `userName` and `identityContext` become required options at that layer.
3. **Context resolvers.** New `ts/src/cultivation/promptContext.ts`:
   `cultivationUserName(db)` and `consolidationIdentityContext(db)`, resolved
   inside `scan.ts` (where Python's `cmd_scan` resolves them), so neither the
   front door nor the live smoke needs an edit.
   - `content[:600]` → `sliceCodePoints(content, 600)` (code points, not UTF-16 units).
   - `speaking with (\w+)` → `/speaking with ([\p{L}\p{N}_]+)/u`. Python's `\w`
     is Unicode; JS's is ASCII, and the seeded identity says "speaking with
     Vinícius" — a plain `\w+` would yield `Vin`.
4. **Oracle golden.** Extend `ts/parity/generate_prompt_assembly_golden.py`
   with `system_prompts.consolidation` / `system_prompts.shadow_scan` and
   per-branch scenarios. Capture the prompt by stubbing `send_to_model` around
   the real `propose_consolidation` / `propose_shadow_observations`, so the
   golden is the literal bytes the oracle sends, not a re-composition.
   Branches: memory with and without `journey` / `context`; identity context
   present, absent, and >600 code points containing a non-BMP character;
   Unicode `user_name`; shadow structure empty and populated;
   `readiness_state` variants. CI's determinism gate already regenerates
   this file. **Every input is synthetic** — no identity text or memory
   content from any real database enters the golden or any rendered prompt
   in this package (security review; see Implementation Contract).
5. **Pins.** Byte-equality of both templates against the golden; SHA-256 of
   every assembled scenario; and one hermetic `ReplayLlmProvider` fixture that
   pins `promptDigests.consolidation` / `promptDigests.shadow_scan`, proving
   the enforcement path works for these roles.
6. **Flip.** Delete `liveBlockedBy` from `CULTIVATION_SCAN_TRANSPORT`
   (`ts/src/providers/transport.ts`), rewrite its comment and the `propose.ts`
   header (the deferral note becomes history), and update the two
   `routing.test.ts` tests and two `route_matrix.ts` entries that currently
   assert the refusal. `MIRROR_TS_CULTIVATION=0` remains the family revert.
7. **Live witness.** The smoke's `checkLedger` for the two scan probes gains a
   `prompt_tokens` floor — `≥ 400` for `consolidation`, `≥ 300` for
   `shadow_scan`. The dump prompt this story replaces is ~50 tokens; the real
   templates alone are ~550 and ~400. It is the one live assertion that
   separates "the instruction text was sent" from "a bare dump got a lucky
   JSON answer" (ai-engineer review). The probe still reads the route, so this
   is the only edit the smoke needs.
8. **Closure docs.** Burn-down ledger's replay-gated table emptied and the two
   leaves moved to the family row as flipped-ungated; DS8 index row → Done
   (4/5); `decisions.md` entry for the resolver deviation below; CR014
   evidence note; `configuration.md` and worklog. Sweep
   `.pi/skills/mm-consolidate/SKILL.md:37`, whose 10-minute Python ceiling and
   "no `llm_calls` row when killed" become false on the TS path (extraction-tier
   timeout per call; one row per successful cluster). Capture one CR from the
   prompt-engineer reading: `CONSOLIDATION_PROMPT` asks for "the exact
   paragraph or sentence to insert or replace" while showing only the first
   600 characters of each identity layer — a Python finding, not a TS2 edit.

## Non-Goals

- **CR014** (one owner-name resolver for all sites) stays captured and
  unassigned. TS2 ports only the cultivation lookup and does not touch the
  close tail's `resolveUserName` (a different oracle, `You are talking to`).
- **Prompt text improvements.** This is a parity story: any prompt-engineer
  finding is a finding against Python too and becomes a CR, not a TS2 edit.
- `consolidate apply` (live since US3, sends no prompt), `list|show|reject`
  (deterministic since DS7.US3), DS8.TS1 (`eval`), the DS10 Workbench.
- The swallow behaviour (`null` / `[]` on failure) — US3's outcome seam already
  makes it visible; TS2 changes what is sent, not what happens on failure.
- Any Python change. The oracle is read, not edited.

## Decisions for the Navigator (approve with the plan)

**D1 — Do not port the hardcoded name.** `consolidate_cmd._user_name` short-
circuits on `"Vinícius" in entry.content` before the regex; `shadow_cmd` uses
the regex alone. TS ships one resolver: the regex (Unicode-correct) with the
shared fallback `"the user"`. Divergence from the consolidate oracle exists only
when identity content mentions the name without a "speaking with" line — a
shape no shipped template produces. Assembly parity is proven independently
(the golden takes `user_name` as input), and the resolver gets its own
characterization test against Python outputs on the seed phrasing, a Unicode
name, and the fallback. Recorded in `decisions.md` and as CR014 evidence.

**D2 — Riders.** US3's review parked two cosmetic sweeps on "whatever next
edits those files". TS2 edits `transport.ts`, so the `soul harvest save`
revert-reason string is in — **carried together with its `route_matrix.ts`
contract**, which asserts the current string (QA review). TS2 now edits the
smoke script for the `prompt_tokens` floor, so the `$0.000000` rounding rides
along too, in the same commit.

**D3 — Plan review.** Done 2026-09-13 before approval, four lenses; findings
folded into this plan and recorded below. The DS8 index's ask — the ported
text read *as text* before it reaches a model — is not satisfied by a plan
review and is now its own gate, plateau 4½.

## Acceptance Behavior

```text
Given a copy home (a directory holding a copied memory.db) with at least one cluster above
      threshold and at least one shadow-candidate memory, no MIRROR_TS_* variable set,
      MEMORY_LOG_LLM_CALLS at its default, and the OpenRouter key in .env
When  the Navigator runs `consolidate scan --limit 3` and `shadow scan` through the front door
Then  both route to TypeScript in live mode, and no routing contract anywhere still says
      "live blocked by DS8.TS2"
And   `consolidate scan` reports at least one `answered` outcome, and both leave a
      `consolidation` / `shadow_scan` ledger row priced like Python's, with
      prompt_tokens above the floor (≥ 400 / ≥ 300) — the live witness that the
      instruction text, not a memory dump, reached the model
And   a pending row produced by the real prompt is consumed by TS's own `apply`:
      `consolidate apply <id>` and `shadow apply <id>` on the copy leave the row `accepted`
And   `MIRROR_TS_CULTIVATION=0` sends both leaves back to Python
And   `consolidate list|reject` and `shadow list|show|reject` are unchanged

Proven hermetically, not live: the assembled prompt hashes to the digest Python
produces for the same inputs (byte-equality, per-scenario SHA-256, replay-fixture
pin). The live route cannot observe the digest — the ledger is metadata-only — and
does not claim to.
```

## Validation Route

Hermetic first, then Navigator-run live on a copy. Detail in
[test-guide.md](test-guide.md).

1. `cd ts && npm run typecheck && npm run lint && npm test` — pass: 0 failures,
   the new prompt tests present and green.
2. `uv run python ts/parity/generate_prompt_assembly_golden.py && git diff --exit-code ts/test/goldens/prompt-assembly.golden.json`
   — pass: regeneration is a no-op.
3. `node ts/parity/route_matrix.ts --contracts-only` — pass: exit 0 with both
   scan leaves live; fail: any contract mismatch.
4. **Prompt-engineer reading (plateau 4½, hard stop).** One assembled scenario
   per surface rendered from the golden's `prompt` field — synthetic by
   construction — read as text before any live call: `{{ }}` collapsed into a
   valid JSON contract; the fence encloses exactly the user-derived block; the
   unfenced `identity_context` / `shadow_structure` sit above the guard, never
   inside the data. Recorded in `validation.md`.
5. `node --env-file=.env ts/parity/live_long_tail_smoke.ts --db tmp/parity/real-copy.db consolidate-scan`
   and `… shadow-scan` — pass: `transport is live`, ≥1 `answered` for
   consolidate, a ledger row per role with `prompt_tokens` above the floor, key
   absent from output; fail: `SKIPPED`, every outcome `parse_failed`, no ledger
   row, or a row below the floor.
6. The journey, on the copy home: `consolidate scan --limit 1` → `list` →
   `apply <id>` → `accepted`; `shadow scan` → `shadow apply <id>` → `accepted`.
   Proves a row the real prompt produces is consumable by TS's `apply` — the
   seam this story opens (QA review). At most one embedding call.
7. Revert matrix: `MIRROR_TS_CULTIVATION=0` routes both to Python.

**E2E decision: required** — steps 5 and 6 are the E2E. They spend real money
(≤ 3 consolidation calls + 1 shadow call at `temperature: 0.1` on the
extraction model, plus ≤ 1 embedding). Validation runs with
`MEMORY_LOG_LLM_CALLS` at its default (metadata-only); no evidence pastes a
`prompt` column. A real-home run is optional and Navigator-chosen:
`shadow scan` is one call and writes only `pending` rows, reversible with
`shadow reject`.

## Plateaus

Each closes with green CI and a commit explaining why.

| # | Plateau | Ends when |
|---|---|---|
| 1 | Oracle golden — generator extended, corpus regenerated, TS test asserting the scenarios exist (red) | golden committed; determinism gate passes |
| 2 | Templates + assembly + pins — constants, builders, `propose*` wired, byte/digest/fixture tests green | `propose.test.ts` header comment ("prompt-level guard is DS8") replaced |
| 3 | Context resolvers — `promptContext.ts`, characterization tests, threaded through `scan.ts` | the smoke and `cli.ts` compile unchanged |
| 4 | Flip — `liveBlockedBy` deleted, comments, `routing.test.ts`, `route_matrix.ts`; smoke `prompt_tokens` floor; rider D2 with its contract | route matrix green with both leaves live |
| 4½ | Prompt-engineer reading — one assembled golden scenario per surface, read as text; finding recorded | **hard stop**: no live call before this is recorded in `validation.md` |
| 5 | Navigator validation — smoke on copy, the scan→apply journey, revert matrix, evidence in `validation.md` | Navigator accepts |
| 6 | Closure — ledger, DS8 index, decisions, CR014 note, configuration, `mm-consolidate` skill sweep, the 600-character CR, worklog; Debt Review; Done | replay-gated table reads `(none)` |

## Risks

- **Replay masking (the story's own origin).** Inline fake providers in
  `propose.test.ts` never read the prompt. Mitigation: the three pins in
  scope §5 — a drifted template or a `String.replace` regression fails
  deterministically in CI.
- **Unicode divergence** (`\w`, `[:600]`) — the US10 class. Mitigation:
  scenarios with a non-BMP character past the slice boundary and a Unicode
  name; resolver characterization against Python output.
- **Production behaviour changes on the owner's home** the moment the flip
  lands: both scans go live from TS on an unconfigured install. Mitigation:
  copy-first smoke, single-variable revert, ledger rows visible.
- **Unfenced system-side context** (`identity_context`, `shadow_structure`)
  reaches the prompt. Matches Python by design. Security review confirmed: the
  poisoning loop (injected memory → proposal → owner accepts → next scan sees
  it as system context) is closed by the human `apply` step and the
  identity-write allowlist; TS2 does not touch `apply`, so the boundary holds.
- **Private identity text leaking into the repo** through "realistic"
  fixtures. Realistic, not theoretical: the Driver builds golden scenarios and
  the reading step, and the shortest path to realism is the real DB copy.
  Mitigation: the synthetic-only rule below; the reading step uses the golden,
  never a real-copy render.
- **`MEMORY_LOG_LLM_CALLS=full`** persists the assembled prompt — identity plus
  cluster — into `llm_calls`. Not new (Python does the same, opt-in), but the
  flip makes it real for these roles. Validation runs in default mode.

## Implementation Contract

- TDD against the oracle: golden first (red), then templates, then resolvers.
- The two templates are emitted from the Python source, not typed by hand.
- Prompt assembly only through `pyFormat`; single pass, so a `{placeholder}`
  literal inside memory content is never re-substituted.
- `userName` / `identityContext` are required at the `propose*` layer — no
  silent default there; the fallback lives in the resolver, as in Python.
- **Synthetic-only.** No identity text or memory content from any real
  database enters the golden, a test fixture, a rendered prompt in this
  package, or `validation.md`. Rendered prompts come from golden scenarios.
- **No live call before plateau 4½ is recorded.**
- Keep changes scoped to `CV22.DS8.TS2` plus rider D2 (with its route-matrix
  contract) and the smoke rounding sweep.
- Use `uv run` for Python commands and tests.
- Do not use `git add .`; commit only story-scoped files.
- Descriptive English commit messages explaining why; one commit per plateau.
- Never prove write parity against the live production database.

## Stop Conditions

- scope_change_detected — anything beyond the two scan leaves and rider D2
- plan_rule_conflict — a golden branch the TS builders cannot reproduce byte-for-byte
- failing_required_check_without_clear_fix
- navigator_decision_needed — D1–D3 unresolved, or the smoke fails on the copy

## Plan review (2026-09-13)

Four lenses, one pass, before approval. Synthesis: sound; risk concentrates in
the first live call, everything before it is deterministic and pinned. Dissent
and what it changed:

| Lens | Finding | Folded as |
|---|---|---|
| ai-engineer | The digest claim in Acceptance is observable only hermetically; the live route needs its own witness | Acceptance split into live vs. hermetic; `prompt_tokens` floor in the smoke (scope §7) |
| prompt-engineer | Plan review ≠ reading the assembled prompt; the DS8 ask had no gate | Plateau 4½, hard stop. Out-of-scope finding (600-character `replace`) → CR at closure |
| security-engineer | Realistic path from "realistic fixtures" to the owner's soul text in a committed JSON; `full` ledger mode persists prompts | Synthetic-only contract; validation in default ledger mode; poisoning loop confirmed contained by `apply` |
| quality-assurance | E2E stopped at `scan`, leaving the scan→`apply` seam unproven; Navigator route not runnable as written; rider D2 breaks a route-matrix contract; stale skill note | Route step 6 (journey to `apply`); copy-home prerequisite in the test guide; rider carries its contract; `mm-consolidate/SKILL.md:37` in closure |

Release confidence per QA: ready with known risks once steps 5–6 pass on the copy.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
