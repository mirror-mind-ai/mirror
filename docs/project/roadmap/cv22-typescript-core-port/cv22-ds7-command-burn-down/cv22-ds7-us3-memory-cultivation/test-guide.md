[< Story](index.md)

# Test Guide — CV22.DS7.US3 — Memory cultivation

## Automated Validation

Run in CI (no live provider dependency):

- **Security-first unit tests (authored first):**
  - identity-write allowlist — an allowed `identity_update` (`self`/`ego`)
    appends after a blank line; a non-allowlisted target (`shadow`, `user`,
    `persona`, or a hallucinated layer) is **refused** with the exact Python
    message and **no write** (no partial row), matching
    `apply_consolidation_identity_update` / AI-23.
  - **no ungated bypass** — assert `identity_update` reaches an identity write
    ONLY through the gated allowlist method; the apply handler has no reachable
    call to the ungated `upsertIdentity`/`setIdentity` for that action, and the
    refused case leaves the identity table byte-unchanged.
  - **`shadow apply` hardcoded layer** — the write targets the constant
    `layer="shadow"` regardless of any layer-like value in the proposal; only
    the *key* varies. Appends with the `\n\n---\n\n` separator (or creates when
    absent) and advances source readiness to `acknowledged`, at parity.
- **Cluster golden** — `cluster_memories` graded against the Python oracle over
  a committed synthetic embedding corpus: greedy single-linkage, seed=first
  member, first-match-wins, `MAX_CLUSTER_SIZE=5`, terminal-`integrated` and
  embedding-less skipped, singletons dropped.
- **Deterministic apply/reject/list/show** — `identity_update`/`shadow_candidate`
  readiness transitions, `reject` status change, and the `list`/`show` renders,
  string-exact goldens.
- **Proposal prefix resolution** — exact id, unique 8-char prefix, first-match-
  wins (confirm there is **no** ambiguous branch, unlike US2's task resolver).
- **Scan orchestration under replay** — `consolidate scan`/`shadow scan` drive
  `cluster → propose → store` with the DS5 replay provider returning canned
  proposals; assert the stored `Consolidation` rows match, no live call.
- **Adversarial-proposal containment** — the scan replay fixture carries a
  poisoned proposal (non-allowlisted `target_layer`, injection-y body); assert
  it is stored `pending` at scan, then **refused at `apply`** with no identity
  write. (Scan-under-replay proves plumbing + DB transitions only — NOT proposal
  quality or prompt-level injection resistance, which are DS8 + evals.)
- **Readiness-state transition strings** — pin each exact target string, since
  the column is unconstrained `TEXT`: `shadow_candidate`⇒`candidate`,
  `merge`⇒sources `integrated`, `identity_update`/`shadow apply`⇒sources
  `acknowledged`.
- **Per-call commit boundary** — assert `merge`/`identity_update` write each
  row in its own call (no single wrapping transaction), matching Python.
- **Replay-gate routing (both states)** — gate-off ⇒ `scan`/`consolidate apply`
  route to Python (routing-decision assertion, like US2's `week plan`/`save`);
  gate-on ⇒ TS. Gate-off is a security control, not just coverage.
- **Fail-closed** — gate-on with a missing/malformed replay fixture errors
  clearly; no live call, no degenerate embedding written.
- **Determinism gate** regenerates the cluster golden with no diff.
- **Oracle-drift checker** passes with new entries for `cli/consolidate_cmd.py`,
  `cli/shadow_cmd.py`, `intelligence/consolidate.py`, `intelligence/shadow.py`.
- **Redaction test** — front-door log for each new command records
  command/subcommand/counts and **never** proposal content, rationale, identity
  content, or `--content` payloads.

## Real-DB-Copy Parity (redacted)

- `ts/parity/real_db_copy_*` extended with a `cultivation` probe family (cluster
  ordering over the copied DB's real memories + consolidation listing order).
  Redacted by default — no proposal text, ids, or identity content.

## E2E Decision

**Required.** Per-family end-to-end smoke before each routing flip: deterministic
(list→reject, shadow apply→show) run unconditionally; the replay-gated
scan→apply(merge) cycle runs under the replay provider. No live call.

**Cross-command lifecycle seam (highest-value journey).** An e2e that walks
`consolidate apply <shadow_candidate>` (advances a memory to `candidate`) →
`shadow scan` sees that memory in its candidate pool — the handoff *between* the
two families, which per-command tests in isolation would miss.

## Navigator Validation

Run on a copied DB (`--mirror-home`/`--db-path` pointed at the copy):

**Expected observation** — TS front-door output and resulting DB rows/identity
match the Python oracle for every command; an `identity_update` to a
non-`{self,ego}` layer is refused loudly with no write; `scan`/
`consolidate apply` stay on Python unless the replay gate is set.

```text
consolidate list
shadow list
shadow show
consolidate reject <pending-id>
shadow apply <shadow-observation-id>
consolidate apply <identity_update-id>              # allowlisted self/ego write
consolidate apply <identity_update-to-shadow-id>    # expect loud refusal, exit 1, no write
# with the replay gate set:
consolidate scan
consolidate apply <merge-id>                        # replayed embedding
```

**Pass condition** — rendered stdout and affected rows/identity identical to
Python for every deterministic command; the allowlist refusal is byte-identical
and writes nothing; scan/merge under replay reproduce parity; the front-door log
shows no proposal/identity content or payloads.

**Fail condition** — any output/row/identity divergence from the oracle; the
allowlist writing (or silently no-op'ing) a non-allowlisted layer; a live
provider call in CI; any proposal/identity content or payload in the front-door
log; any write touching a non-copied database during proof.

## Validation Evidence

Implemented across four commits on `mirror-ts-core`:

- `a698989` — Slice A: allowlist (`applyConsolidationIdentityUpdate`), `cluster.ts`
  (golden-graded against the Python oracle via `generate_cluster_golden.py`),
  `consolidationStore.ts`, deterministic `applyActions.ts` (identity_update,
  shadow_candidate, reject, shadow apply).
- `519f9b8` — Slice B: `propose.ts` (formatting helpers verified byte-for-byte
  against a live Python interpreter), `scan.ts` (consolidate/shadow scan
  orchestration), `applyMerge`, plus the adversarial-containment and
  cross-command lifecycle integration tests (`lifecycle.test.ts`).
- `dd26688` — front-door wiring: `routing.ts` gates, `cultivationRoute.ts`,
  `render/consolidate.ts` + `render/shadow.ts` (several of the trickiest
  byte-exact shapes spot-checked directly against a live Python interpreter,
  not just reasoned from source), `cli.ts` read/write dispatch, and 15
  CLI-level tests spawning the real front door end-to-end.
- `16e5244` — the real-DB-copy `cultivation` probe family (cluster ordering +
  consolidation listing), wired into `real_db_copy_verify.ts`.

**Automated (CI):** all unit/golden/replay-fixture tests pass (801 TS tests
total at the last commit, typecheck and lint clean); the oracle-drift checker
passes with the five new entries (`storage/consolidations.py`,
`intelligence/{consolidate,shadow}.py`, `cli/{consolidate,shadow}_cmd.py`).

**Real-DB-copy (redacted):** ran end-to-end against a freshly generated demo
DB (`generate_demo_memory_db.py`, now seeded with `DEMO_CONSOLIDATIONS`) —
both the `cultivation_cluster_order` probe (2 real clusters, member order
included) and both `cultivation_consolidation_list_*` probes passed at full
byte-parity (matching `python_order_hash`/`ts_order_hash`), confirmed with
`--debug-sensitive-output` that the underlying ordered ids also matched
exactly. `overall_match: true`, harness exit code 0.

**E2E / Navigator-validation-shaped evidence:** the 15 `cultivationCli.test.ts`
tests spawn the actual front door (not just unit-level route functions) and
cover the full command list in the Navigator Validation section above,
including: `consolidate list` (empty + populated), `consolidate reject`
(not-found + success), `consolidate apply` for `identity_update` (allowed +
refused, verified against the live Python oracle's identical allowlist
message), `consolidate apply` for `merge` under the replay gate, `shadow
show`/`shadow apply` (including the wrong-action refusal), `consolidate scan`
and `shadow scan` under the replay gate, backup-gating (a non-empty pre-write
backup file is produced), and redaction (the front-door log never contains
proposal content, rationale, or identity content).

**Fail-condition checks exercised:** the identity-write allowlist refusal
writes nothing (asserted at both the unit level and the live CLI level); a
missing replay-gate env var routes the whole command to Python (asserted via
the front-door log's routing decision, since Python's own allowlist message is
byte-identical to the port); no live provider call occurs anywhere in the
suite (only `Replay*Provider` fixtures are used).

**Not yet run:** a hand-run Navigator validation session against a real
copied `memory.db` (as opposed to the demo DB) — recommended before closing
the Ariad Validation checkpoint with Navigator acceptance.
