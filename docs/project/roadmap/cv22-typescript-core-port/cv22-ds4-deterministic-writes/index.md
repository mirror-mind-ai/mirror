[< CV22 TypeScript Core Port](../index.md)

# CV22.DS4 — Deterministic Writes

**Delivery Story:** Port the deterministic write commands to the TypeScript core over the shared database seam, with parity proven on copies of `memory.db` — never the live database — behind an explicit backup gate.
**Status:** 🟡 Planned · next (Baton 4)
**Type:** Delivery Story
**Depends on:** [CV22.DS2 TS Foundation & Read-Only Command Parity](../cv22-ds2-ts-foundation-read-only-parity/index.md) (done) for the `node:sqlite` seam and the redacted parity-harness pattern; [CV22.DS3 Pi TS Front Door](../../cv22-pi-ts-front-door/cv22-ds3/index.md) (done) for the routing table that currently sends every write to the Python fallback; the [database-seam strangler decision](../../../decisions.md).

---

## What This Is

DS2 proved the TS core can *read* Mirror deterministically over the shared seam;
DS3 put those reads behind the Pi front door while **every mutating command still
falls back to Python**. DS4 is where the strangler first *writes*.

The unit stays the command, the seam stays the shared SQLite file, and the oracle
stays the Python implementation — but the risk profile changes. Reads could be
validated live; **writes cannot**. A write parity proof mutates state, so it must
run against a **copy** of `memory.db`, gated by a backup, and never against the
live production database. This is the load-bearing discipline of DS4: mutation
safety is explicit, not incidental.

Scope is the **deterministic** writes — the ones with no external-API dependency,
so parity is a pure function of `(seed state, command, frozen now) → mutated
state`:

- **Honest-reinforcement writes** — `log_access` and `increment_use_count`
  (`src/memory/storage/memories.py`): the write counterpart to the ranker inputs
  DS2 already reads (`use_count`, `last_accessed_at`, `access_count`). Highest
  value: frequent, and it feeds the ranker we already ported. `last_accessed_at`
  is stamped with `now`, so the frozen-`now` contract from DS2 applies again.
- **Journey writes** — `create_journey`, `set_project_path`, and the
  stage/status/path setters (`src/memory/services/journey.py`): the mutations
  behind journey management.
- **Identity writes** — `upsert_identity` and `update_identity_metadata`
  (`src/memory/storage/identity.py`), surfaced through `set_identity`
  (`src/memory/client.py`): the deterministic write paths behind `mm-identity`
  and `mm-seed`.

Memory *creation* (extraction + embedding) is intentionally excluded — it depends
on external APIs and non-determinism, which is DS5.

---

## Parity Approach (writes differ from reads)

DS2 graded **ordered ids** from a read. DS4 must grade **state transitions**:

- Seed a DB copy; snapshot the target rows.
- Apply the same command through the **Python oracle** and through the **TS core**
  on two parallel copies of the same seed, with a **frozen `now`**.
- Diff the resulting state (the mutated rows/columns) for equality — same rows,
  same values, same timestamps.

This extends the reusable redacted harness from DS2.TS3 into a **write** harness:
copy-only, backup-gated, redacted evidence by default (labels, counts, hashes,
pass/fail — never raw ids/content). The portable demo DB from DS2/DS3 is the seed
source, so validation stays independent of any private filesystem.

---

## Candidate Stories

TS1, US1, US2, and US3 delivered the deterministic-write parity (all ✅ Done) and
are linked below. Front-door **write routing** remains: CV22.DS4.US4 opens the
sanctioned live-write seam and routes identity writes; journey-write routing is its
fast-follow; reinforcement-write routing moves to CV22.DS5 (it fires inside the
Python search path). DS4 collapses once the identity + journey CLI writes are
routed.

| Code | Story | Type | Outcome |
|------|-------|------|---------|
| [CV22.DS4.TS1](cv22-ds4-ts1-write-parity-harness/index.md) | Write Parity Harness & Backup Gate | Technical Story | The reusable write-parity route: seed → copy → apply (Python ‖ TS) → state-diff under frozen `now`, backup-gated, redacted by default — the write counterpart to DS2.TS3 |
| [CV22.DS4.US1](cv22-ds4-us1-reinforcement-write-parity/index.md) | Reinforcement Write Parity (`log_access`) | User Story | `log_access` + `increment_use_count` ported to the TS seam with state-diff parity on a copy; `last_accessed_at` frozen-`now` correct; front door routes reinforcement writes to TS |
| [CV22.DS4.US2](cv22-ds4-us2-journey-write-parity/index.md) | Journey Write Parity | User Story | Journey writes (create, set path/stage/status) ported to the TS seam with state-diff parity on a copy; front-door journey-write routes enter TS |
| [CV22.DS4.US3](cv22-ds4-us3-identity-write-parity/index.md) | Identity Write Parity | User Story | Identity writes (`upsert_identity`, `update_identity_metadata` / `set_identity`) ported to the TS seam with state-diff parity on a copy; deterministic `mm-identity` / `mm-seed` write paths enter TS |
| [CV22.DS4.US4](cv22-ds4-us4-front-door-write-routing/index.md) | Front-Door Write Routing | User Story | Open the first sanctioned live-write seam in the TS front door and route `identity set` to TS (reusing US3 `setIdentity`), backup-gated, Python fallback for everything else (`identity edit` is interactive → Python); journey routing is the fast-follow, reinforcement routing moves to DS5 |

Suggested sequence: **TS1** first (the safety/harness foundation), then **US1**
(highest-value, ranker-adjacent), then **US2** / **US3**; finally **US4**
(front-door write routing) to close DS4.

---

## Done Condition

- The deterministic write commands — reinforcement (`log_access` /
  `increment_use_count`), journey CRUD, and identity CRUD — are answered by the TS
  core.
- Write parity is proven by **state-diff on copies** of `memory.db`, under a
  **backup gate**, with a **frozen `now`** wherever a write stamps a timestamp —
  **never** proven against the live production database.
- The schema/FTS5 compatibility contract holds; existing `memory.db` files keep
  working with no migration.
- The Pi front door routes the ported **CLI** writes (identity, journey) to TS;
  reinforcement-write routing lands with CV22.DS5 (it fires inside the Python search
  path, not as a CLI command). Every unported or non-deterministic command still
  falls back to Python; no user-visible change.
- Mutation safety is explicit: the harness refuses to run against a non-copy, and
  a backup precedes any destructive parity proof.

---

## Non-Goals

- No memory creation, extraction, or embedding writes — those depend on external
  APIs (CV22.DS5).
- No external-API commands — extraction, embeddings, consult (CV22.DS5).
- No schema or semantic change; FTS5/tokenizer behavior is inherited from the
  shared file.
- No npm build/publish pipeline or package rename (CV22.DS6).
- No new Python features — Python is maintenance-only from the CV21.E2.S2
  baseline.
- No live-database write parity — proofs run on copies only.

---

## See also

- [CV22 index](../index.md)
- [CV22 Collaboration Strategy — Baton 4](../collaboration-strategy.md)
- [CV22.DS2 TS Foundation & Read-Only Command Parity](../cv22-ds2-ts-foundation-read-only-parity/index.md)
- [CV22.DS3 Pi TS Front Door](../../cv22-pi-ts-front-door/cv22-ds3/index.md)
- [Decisions — database-seam strangler](../../../decisions.md)
