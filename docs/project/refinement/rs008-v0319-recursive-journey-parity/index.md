[< Refinement Workbench](../index.md)

# RS008 — v0.31.9 Recursive Journey Parity

## Framing

Mirror Mind `v0.31.9 — Recursive Journey Hierarchy` removed the Python product's
artificial two-level journey limit and made arbitrary-depth organization part of the
released observable contract. The `mirror-ts-core` branch already routes journey reads
to TypeScript and has separately introduced a first-class `identity.parent_journey`
column, but its current hierarchy algorithms, validation rules, renderer, roadmap
policy, and convergence scope still describe the earlier one-level contract.

This story makes the release delta explicit before CV22 claims complete command parity
or retires Python authority. It does not authorize implementation merely by existing in
the Workbench.

## Outcome

The TypeScript migration has an explicit, reviewable route to absorb the complete
`v0.31.9` journey contract without losing the database-seam discipline: recursive
reads and rendering, arbitrary-depth mutation with cycle refusal, stable identity and
path semantics, conservative removal, and named ownership for Workspace/web hierarchy
projections.

## Boundaries

- Treat `v0.31.9` as the current Python oracle for journey behavior until command
  authority is deliberately reconciled.
- Preserve arbitrary depth with organizational parentage only; never introduce inherited
  context, memories, conversations, tasks, attachments, routing, search, status, or
  Builder state.
- Preserve journey IDs, `project_path`, and filesystem content across tree movement.
- Never infer parentage from paths or move filesystem content because parentage changes.
- Reject direct, indirect, and pre-existing ancestry cycles without automatic repair.
- Keep malformed read state bounded and visible.
- Remove only empty leaves, transactionally and without cascades or implicit
  reparenting.
- Treat migration `017` and the first-class parent column as an explicit compatibility
  question; do not silently redefine the released metadata contract.
- Do not inspect, migrate, reconcile, delete, or dual-write legacy SQLite Workbench
  rows.
- Keep implementation, assignment, commit, push, merge, and release as separate
  Navigator-authorized decisions.

## Audit Evidence

A read-only audit refreshed `mirror-ts-core` to remote commit `ea54d4c` before capture.
The current TS listing still performs roots-then-immediate-children traversal, exposes
no `depth` or `lineage`, and renders child indentation with leading spaces. The current
TS parent validator explicitly enforces a single hierarchy level. No TS journey-removal
operation or association guard was found. The branch roadmap still freezes Python,
while the released project decision now defines a moving-target strangler.

The branch also carries TS-authored migration `017_journey_parent_column`, making
parent authority reconciliation part of the release impact rather than a hidden
implementation detail.

## Change Requests

- [CR050 — Reconcile moving-target policy and parent authority](cr050-reconcile-moving-target-and-parent-authority.md)
- [CR051 — Restore recursive journey read and CLI rendering parity](cr051-restore-recursive-journey-read-and-render-parity.md)
- [CR052 — Port parent movement and cycle semantics](cr052-port-parent-movement-and-cycle-semantics.md)
- [CR053 — Port conservative transactional journey removal](cr053-port-conservative-transactional-journey-removal.md)
- [CR054 — Assign Workspace and web hierarchy parity ownership](cr054-assign-workspace-and-web-hierarchy-parity-ownership.md)

## Suggested Dependency Order

```text
CR050 → CR051 → CR052 → CR053
                 └────→ CR054
```

This sequence is advisory narrative. Canonical order and focus remain in the root
Workbench, and selecting or planning any CR requires an explicit decision.

## Closure

RS008 is closed after all five Change Requests reached `done`:

- CR050 reconciled the moving-target policy and established metadata as semantic parent
  authority while retaining migration `017` as a derived projection.
- CR051 restored deterministic arbitrary-depth reads and CLI rendering, including
  bounded orphan and rootless-cycle visibility.
- CR052 ported transactional parent creation/movement, complete ancestry validation,
  cycle refusal, and meaning-preserving dual projection updates.
- CR053 ported conservative transactional removal with a closed association inventory
  and empty-leaf-only semantics.
- CR054 assigned the remaining released Workspace/web hierarchy contract to
  CV22.DS7.US9 and blocked Python retirement behind CV22.DS10's web convergence gate.

The RS outcome is therefore satisfied: CV22 has an explicit, reviewable absorption route
for the complete `v0.31.9` journey contract. Closing RS008 does not pull or implement
DS7.US9 or DS10, retire Python, change a browser route, or create a new release. Those
remain future independently authorized CV22 work.
