# Plan — CV22.DS7.US3 — Memory cultivation

## Objective

Route the memory-cultivation command surface — `consolidate` and `shadow` — to
the TS core. The **deterministic** subcommands (reads, non-LLM writes, and the
security-critical identity-write allowlist) flip to TS unconditionally, proven
on copies. The **LLM/embedding-orchestration** subcommands (`scan`, and
`consolidate apply`'s `merge` action) run on TS **behind the DS5 replay
`LlmTransport`/embedding provider**, env-gated exactly like `memories --search`
and `consult`; the live call stays on Python fallback until DS8. Ported
injection-fence *helpers* travel with the orchestration; live prompt-level
resistance is the DS8 boundary, mirroring the decision `ts/src/extraction/
fencing.ts` already recorded for extraction.

## Grounding: the real surface (from inspection)

**Families:** `consolidate scan|apply|reject|list` and
`shadow scan|apply|reject|list|show`, sharing one `Consolidation` proposal model
and the `consolidations` table.

**Already present (lowers risk):**
- The `consolidations` table and the `memories.readiness_state` column are
  **already in the TS-authored schema** (DS6, migration `010_create_consolidations`
  + the readiness-state ALTER) — no new migration here.
- `cosineSimilarity` is already exported from `ts/src/search/ranker.ts` (DS2) —
  `cluster_memories` reuses it, not a re-implementation.
- The DS5 replay substrate exists: `ts/src/providers/{replay,llm,embedding,
  config}.ts`, and `ts/src/extraction/conversation.ts` is the worked example of
  orchestration-behind-replay to mirror.
- A fence primitive exists (`ts/src/extraction/fencing.ts: fenceTranscript`),
  but the **generic** `fence_untrusted(tag, body)` the cultivation prompts use
  is not yet ported.

**Deterministic — Slice A (flip to TS unconditionally, copy-provable):**
- `Consolidation` store read/write model: create / get / list(status,limit) /
  updateStatus(status,result), plus `update_memory_readiness_state` and
  `get_shadow_candidate_memories`.
- `cluster_memories` — greedy single-linkage cosine clustering (seed = first
  member, first-match-wins, skip terminal `integrated`, skip embedding-less,
  drop singletons, `MAX_CLUSTER_SIZE=5`). Pure over memories+embeddings.
- **The identity-write allowlist** — `apply_consolidation_identity_update`:
  refuse any `target_layer ∉ {self, ego}` with a loud `ValueError` (no partial
  write, no silent redirect), append-after-blank-line for an allowed write
  (CV9.E2.S23 / AI-23). **Security-critical; ported at parity now.** The
  `identity_update` apply action must reach an identity write **only** through
  this gated method — never the general `upsertIdentity`/`setIdentity` — and a
  test must assert the refused case writes **nothing** (no row, no partial),
  i.e. the guarantee is *no bypass*, not merely happy-path parity
  (security-engineer).
- Proposal prefix-ID resolution (exact id → first 8-char-prefix match over
  recent proposals; **first-match-wins, no ambiguous branch** — simpler than
  US2's task resolver). Keep it a **separate** small function; do not unify it
  with `resolveTaskByIdOrPrefix`, whose ambiguous-vs-not-found asymmetry US3
  does not share (engineer).
- Reads: `consolidate list`, `shadow list`, `shadow show`.
- Non-LLM writes: `consolidate reject`, `shadow reject`, and **`shadow apply`**
  (append to the structural `shadow` identity layer with the `\n\n---\n\n`
  separator + advance source readiness to `acknowledged` — a deterministic
  identity write, no provider), and the `identity_update` and `shadow_candidate`
  actions of `consolidate apply`. **`shadow apply`'s safety is the hardcoded
  layer**: the target layer is the constant `"shadow"` and only the *key*
  (`target_key or "profile"`) is model-influenced — the port must pin
  `layer="shadow"` as a constant and never let the proposal drive the layer
  (security-engineer: this is safety-by-construction, the reason shadow apply
  needs no allowlist). Each of `consolidate apply`'s three actions is its own
  small, individually-tested function behind a dispatch, not one branching
  mega-handler (engineer).

**LLM/embedding-orchestration — Slice B (flip to TS under the DS5 replay gate;
live stays Python until DS8):**
- `consolidate scan` / `shadow scan`: `cluster` (deterministic) → `propose`
  (LLM call → replay provider) → store proposals.
- `consolidate apply`: routes atomically (the action is read from the DB, not
  argv), and its `merge` action creates a new memory with a **fresh embedding**
  (embedding provider → DS5 replay). So the whole command is gated on the replay/
  embedding config, same as `scan`; its deterministic `identity_update`/
  `shadow_candidate` actions still run the ported allowlist/readiness logic when
  it does route to TS.
- Fence helper `fenceUntrusted(tag, body)` ported (and `fenceTranscript`
  refactored to call it — one fence primitive, not two). Live prompt-level
  "## Untrusted input" resistance is **DS8**, exactly as `extraction/fencing.ts`
  already records — under replay the provider ignores the prompt, so there is no
  behavioral fence surface to prove until the live template lands.

## Scope

- New `ts/src/cultivation/` module family (one directory, no god-module):
  - `consolidationStore.ts` — the `Consolidation` read/write model + readiness
    transitions + shadow-candidate query over the seam.
  - `cluster.ts` — `cluster_memories` port (golden-tested).
  - `applyActions.ts` — the deterministic apply actions (identity_update via the
    allowlist, shadow_candidate readiness advance, shadow apply) + reject.
  - `propose.ts` — scan orchestration behind the replay provider (Slice B).
- New allowlist port in the identity write layer:
  `applyConsolidationIdentityUpdate` (self/ego gate, loud refusal, append).
- `fenceUntrusted` in `ts/src/extraction/fencing.ts` (shared with `fenceTranscript`).
- Front-door sub-command routing for `consolidate`/`shadow` (deterministic
  unconditional; scan/consolidate-apply replay-gated), backup-gated write
  handlers, string-exact renderers.
- Oracle-drift baseline entries for every ported Python oracle
  (`cli/consolidate_cmd.py`, `cli/shadow_cmd.py`, `intelligence/consolidate.py`,
  `intelligence/shadow.py`; `services/identity.py` and `intelligence/prompts.py`
  are already registered).
- Real-DB-copy redacted harness: a `cultivation` probe family (cluster ordering
  + consolidation listing).

## Non-Goals

- **No live provider call.** `scan`/`merge` orchestrate behind the *replay*
  transport only; the `live` mode is DS8.
- **No prompt-level injection-resistance template.** The fence helper ports; the
  live "## Untrusted input" prompt guard's behavioral proof is DS8 (the replay
  provider ignores the prompt), per the extraction precedent.
- **No new schema/migration** — the `consolidations` table and `readiness_state`
  already exist in the TS-authored schema (DS6).
- No behavior change — parity only; cultivation semantics reproduced, not
  improved (including the allowlist's exact refusal message and the shadow
  append separator).
- No sibling DS7 families (mirror-mode, extraction, Soul, Explorer, Builder/Ariad
  tree, ops tail).

## Acceptance Behavior

```text
Given a copied memory.db exercised through the front door
When the Navigator runs the cultivation commands below via TS
Then rendered output and resulting DB rows/identity match the Python oracle

  consolidate list [--status] / shadow list / shadow show      → identical (TS, always)
  consolidate reject <id> / shadow reject <id>                 → status→rejected, identical
  shadow apply <id> [--content ...]                            → shadow layer appended, readiness advanced
  consolidate apply <id>  (identity_update)                    → allowlisted write (self/ego only)
  consolidate apply <id>  (identity_update, target=shadow/etc) → REFUSED loudly, no write, exit 1
  consolidate apply <id>  (shadow_candidate)                   → readiness→candidate
  consolidate apply <id>  (merge)         [replay-gated]       → merged memory + replayed embedding
  consolidate scan / shadow scan          [replay-gated]       → cluster→propose(replay)→proposals stored

And the identity-write allowlist refuses a non-{self,ego} target at parity
And every write is backup-gated with redacted evidence and no real DB artifact
And deterministic routing flips are user-invisible and revertible; scan/
  consolidate-apply route to TS only under the replay gate, Python otherwise
```

## Architecture / Approach

1. **TDD, parity-first, security-first.** Author the allowlist refusal test
   (refused non-`{self,ego}` target writes nothing) and the shadow-apply
   append test *first* — the two identity-write paths are the highest-blast-
   radius surfaces.
2. **No ungated bypass (security).** The `identity_update` action routes only
   through the ported allowlist method; the apply handler has no reachable call
   to the ungated `upsertIdentity`/`setIdentity` for that action. A test asserts
   both the loud refusal and that nothing was written.
3. **Adversarial replay fixture (ai-engineer).** The `scan` replay fixture
   carries a **poisoned** proposal — a non-allowlisted `target_layer` (e.g.
   `persona`) and an injection-y body — so the test proves the full lifecycle:
   the poisoned proposal is stored `pending` at `scan` (scan does not gate),
   then **refused at `apply`** by the allowlist. This proves containment, not a
   happy-path round-trip. Scan-under-replay proves *plumbing and DB transitions
   only* — proposal quality and prompt-level injection resistance are DS8 +
   evals, not this story.
4. **Determinism injection.** Created rows (merged memory id, consolidation ids,
   timestamps) use the frozen `newId`/`_now()` idiom for byte-identical copy
   parity; scan's proposals under replay use the replay provider's canned output.
5. **Readiness-state strings pinned (database-architect).** `readiness_state` is
   an unconstrained `TEXT` column — the DB will not catch a typo'd transition.
   Every transition target string is asserted exactly: `shadow_candidate` ⇒
   `candidate`; `merge` ⇒ sources `integrated`; `identity_update`/`shadow apply`
   ⇒ sources `acknowledged`.
6. **Per-call commit boundary (database-architect).** `merge` (insert merged
   memory + N readiness updates) and `identity_update` (allowlist write + N
   readiness updates) are multi-statement writes Python commits **per call**
   with no wrapping transaction — reproduce that boundary exactly (same
   discipline as US2's import/sync), do not consolidate into one transaction.
7. **Cluster golden.** `cluster_memories` is graded against the Python oracle on
   a committed synthetic embedding corpus (deterministic; no provider), reusing
   the DS2 `cosineSimilarity`.
8. **Replay gate mirrors DS5 — and gate-off is a security control.**
   `scan`/`consolidate apply` route to TS only when the replay env config is
   present (`MIRROR_TS_EXTERNAL_ROUTES` + the relevant `*_REPLAY` fixtures),
   else Python fallback. Both states are tested: gate-off ⇒ Python (asserted at
   the routing-decision level, like US2's `week plan`/`save`), gate-on ⇒ TS. The
   off-state assertion is a **security** control: a regression routing these to
   TS ungated would move a fenced live surface onto an unfenced TS path.
9. **Fail-closed on a missing replay fixture (devops).** With the gate on but
   the LLM/embedding replay fixture absent or malformed, the TS path errors
   clearly — it never falls through to a live provider call and never writes a
   degenerate/zero embedding for a merged memory.
10. **Fences.** `fenceUntrusted(tag, body)` extracted as the single primitive
    and `fenceTranscript` refactored to call it; the prompt-level resistance
    boundary is documented inline pointing at DS8.

## Validation Route

- **Automated (CI):** `npm test` covering the cluster golden, the allowlist
  (allowed write + refused non-allowlisted layer, exact message), deterministic
  apply/reject/list/show, proposal prefix resolution, and scan orchestration
  behind the replay provider; determinism gate; oracle-drift checker with the new
  entries.
- **Real-DB-copy (redacted):** a `cultivation` probe family (cluster ordering +
  consolidation listing) — redacted evidence, no proposal text/ids/identity
  content.
- **Redaction test:** front-door log never contains proposal content, rationale,
  identity content, or `--content` payloads.
- **E2E smoke before each flip:** deterministic — a full list→reject and a
  shadow apply→show cycle; replay-gated — a scan→apply(merge) cycle under the
  replay provider. **E2E required**, no live dependency.

## Named Risks & Seams

- **Identity-write allowlist / no bypass (security-critical).** Porting `apply`'s
  `identity_update` without the self/ego gate reopens AI-23. The guarantee is
  *no ungated path*: identity_update reaches a write only through the gated
  method, the refused case writes nothing, and both are acceptance criteria.
- **Shadow-layer write / hardcoded layer (security).** `shadow apply`'s safety
  is the constant `layer="shadow"`; only the key is model-influenced. The port
  must never parameterize the layer from the proposal. Append-separator and
  readiness transition match exactly.
- **Adversarial-proposal containment (ai-engineer).** The eval that matters is a
  poisoned proposal stored at `scan` and refused at `apply` — build the replay
  fixture for that lifecycle, not a happy-path round-trip.
- **Replay-vs-live seam / gate-off is security.** `scan`/`merge` are "done for
  DS7" on TS under replay; the live call is DS8. Gate-off ⇒ Python is a tested
  security control (keeps the fenced live surface on Python), not just routing.
- **Fail-closed (devops).** Gate-on + missing/invalid replay fixture ⇒ clear
  error, never a live call or a degenerate embedding write.
- **Unconstrained readiness `TEXT` (database-architect).** No CHECK constraint;
  a wrong transition string silently corrupts the lifecycle. Pin every target
  string; match Python's per-call commit boundary for the multi-row writes.
- **Fence boundary.** Helper ports now; prompt-level resistance is DS8 — do not
  claim injection-resistance parity this story can't yet prove under replay.
- **Prefix resolution.** First-match-wins with no ambiguous branch (unlike US2);
  keep it a separate small function, preserve exactly, do not "improve" it.

## Handoff / DS8 Note (recorded per collaboration-strategy)

When DS8 lands the live `LlmTransport`/embedding mode, cultivation inherits: the
live `scan` propose call, the live `merge` embedding, and the **prompt-level
injection-resistance template** (the "## Untrusted input" guard around the
`fenceUntrusted` blocks) whose behavioral proof is deferred here because the
replay provider ignores the prompt. The deterministic allowlist and shadow write
are already fully proven in this story and need no DS8 rework.

## Implementation Contract

- TDD for every ported branch; goldens/replay-fixtures committed.
- Keep changes scoped to `CV22.DS7.US3`; one directory per family
  (`ts/src/cultivation/`).
- Use `uv run` for Python oracle/tests; `npm` for TS.
- Do not `git add .`; commit only story-scoped files.
- Descriptive English commit messages explaining why.

## Stop Conditions

- scope_change_detected (e.g. pressure to port the live provider call = DS8)
- security_guard_parity_gap (allowlist or shadow write diverging from the oracle)
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
