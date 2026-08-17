[< RS008](index.md) · [Canonical status](../index.md#change-requests)

# CR052 — Port Parent Movement And Cycle Semantics

## Problem

The current TS parent validator preserves the superseded two-level invariant: a parent
may not itself have a parent, and a journey with children may not gain a parent. The
released `v0.31.9` contract instead permits arbitrary depth and moving complete
subtrees, while rejecting self-parenting, unknown parents, indirect cycles, and attempts
to extend a malformed cyclic ancestry.

The TS write surface also needs explicit evidence that a move changes only
organizational position and preserves identity, `project_path`, descendants, and
filesystem content.

## Expected Behavior

TypeScript accepts any valid parent depth and allows a node that already has children
to move beneath another journey. Before mutation it walks the full proposed ancestry,
rejecting direct and indirect cycles and refusing ancestry that already loops. Unknown
parents and self-parenting remain rejected.

A successful move changes only the effective parent relation. Journey ID, identity row,
`project_path`, child relations, documents, records, and filesystem content remain
unchanged. No status or content inheritance is introduced.

## Impact

Without this parity, the TS engine rejects valid trees created by the released product
or may write parent metadata without enforcing the released cycle boundary. Either
outcome prevents safe command-authority transfer.

## Plan Or Decision

Navigator-approved plan. Deliver the released `v0.31.9` movement and cycle boundary in
eight bounded slices:

1. **Lock the superseded rules with failing tests.** Replace the one-level validator
   assertions with tests that accept attaching beneath an already nested parent and
   moving a node that already has descendants. Add exact-message failures for
   self-parenting, a missing proposed parent, an indirect cycle back to the moved node,
   and a proposed ancestry that already contains a cycle. Preserve the released rule
   order so the first relevant error remains deterministic.
2. **Advance only the Python compatibility oracle required by validation parity.** Port
   the branch copy of `JourneyService._validate_parent_journey` to the released
   full-ancestry walk, leaving Python write authority, removal, Workspace, and web code
   otherwise unchanged. Expand the Python-generated validation corpus with arbitrary
   depth, subtree movement, indirect cycles, existing cycles, and a missing ancestor in
   legacy metadata. Regenerate the committed golden and deliberately refresh only the
   resulting `journey.py` oracle-baseline hash after TS parity is green.
3. **Port the pure ancestry validator.** Index the CR050 metadata-resolved parent rows
   by key, then walk from the proposed parent toward the root. Reject the journey itself
   anywhere in that lineage as `parent_journey would create a cycle`; reject a repeated
   ancestor as `Parent lineage contains an existing cycle`; stop safely at a root or a
   missing legacy ancestor. Remove both superseded checks: parent-already-has-parent and
   journey-already-has-children.
4. **Introduce one dedicated parent-movement write seam.** Add a `setParentJourney`
   operation for an existing journey. Inside one `BEGIN IMMEDIATE` transaction, read
   the complete metadata-authoritative parent graph, validate the proposal, preserve
   every existing valid metadata field, set or remove only `parent_journey`, update the
   metadata JSON, and mirror the value (or `NULL`) into migration `017`'s derived column.
   Missing, malformed, or non-object metadata follows Python's tolerant empty-object
   semantics. A missing journey fails before mutation.
5. **Guard every TS writer that can set a parent.** Make `createJourney` use the same
   graph reader and validator whenever `parentJourney` is present, within the same
   immediate transaction as its existing atomic metadata/column write. Keep
   `setProjectPath` and unrelated metadata writes behaviorally unchanged. Export the
   movement seam for future adapters, but do not invent a new CLI command: the released
   Workspace/web entry point remains Python-owned until CR054.
6. **Prove meaning-preserving movement and rollback on database copies.** Snapshot an
   identity row, descendants, and associated journey records before moving a populated
   subtree. After the move, permit differences only in the moved row's metadata,
   projection column, and `updated_at`; assert stable ID, content, version, creation
   time, `project_path`, `sync_file`, icon/color, descendant rows, and associated data.
   Prove unparenting, stale-column convergence, failed-cycle zero-write behavior, and
   complete rollback when the projection write fails after metadata update. No test or
   production path may move or create filesystem content.
7. **Reconcile parity evidence and narrative.** Extend focused TS write/validator tests
   and a portable copied-database movement smoke. Keep validation outcomes/messages
   graded by the real Python golden, and record the semantic state-diff proof separately
   because Python has no migration `017` column. Amend DS6.US3, DS7.US1, and the CV22
   journey-authority narrative to distinguish the new TS core seam from the still
   unported Workspace/web adapter.
8. **Validate end to end.** Run focused red/green Python and TS tests, full Python and TS
   suites, typecheck, Biome, Ruff, golden determinism, oracle-drift, schema/migration
   parity, portable copied-database smoke, docs checks, and `git diff --check` before
   presenting the movement behavior to the Navigator.

### Acceptance checkpoint

CR052 is ready for Navigator validation when:

- arbitrary-depth attachment and movement of a node with descendants succeed;
- self-parenting, a missing proposed parent, indirect cycles, and already-cyclic
  ancestry fail before any write with the released messages;
- moving or unparenting changes only organizational parent state and `updated_at`;
- identity, content, project path, metadata siblings, descendants, associated records,
  and filesystem content remain unchanged;
- metadata remains semantic authority and the TS-only column converges atomically as a
  derived projection; and
- no Workspace/web routing, removal, reparent cascade, inheritance, or repair behavior
  from CR053–CR054 is implemented implicitly.

### Conscious exclusions

No schema migration, new CLI command, Workspace/web transfer, journey removal,
automatic reparenting, cycle repair, path inference, inherited context/status, directory
creation, filesystem movement, or production-database reconciliation belongs to CR052.

## Evidence

`ts/src/journey/validateParentJourney.ts` explicitly documents and enforces
single-level nesting. `v0.31.9` replaced those Python checks with complete ancestry
walking.

### Implementation evidence

- TDD first reproduced five TS validator failures and four Python compatibility failures:
  nested parents and subtree moves were refused, while indirect cycles, existing cycles,
  and missing legacy ancestors produced the obsolete one-level result.
- The Python compatibility copy advances only `_validate_parent_journey` to the released
  ancestry walk. The real Python generator now grades nine cases across arbitrary depth,
  subtree movement, self/missing parents, indirect and existing cycles, and a missing
  legacy ancestor. The tracked `journey.py` oracle hash was deliberately refreshed only
  after focused TS parity passed.
- The TS validator indexes metadata-authoritative parent rows once and walks the full
  proposed lineage. It preserves released error order/messages and removes both
  superseded one-level checks.
- `setParentJourney` is an exported core seam, not a command route. Within one
  `BEGIN IMMEDIATE` transaction it reads the graph, validates, preserves metadata
  siblings, writes or removes the parent key, and converges migration `017`'s projection.
- `createJourney` now validates every non-empty parent through the same graph and within
  its existing atomic transaction. Both parent writers preserve Python's trim and
  500-character boundary.
- Database-copy tests prove a populated subtree move preserves identity, content,
  version, creation time, project path, sync file, icon/color, child rows, memories,
  tasks, conversations, and filesystem content. Unparenting preserves metadata siblings
  and clears a stale projection. Cycle failures leave every row byte-for-byte unchanged.
- Injected projection failure proves complete metadata rollback. Malformed, array, and
  null metadata converge through Python's tolerant empty-object semantics.
- DS6.US3, DS7.US1, and the CV22 journey narrative now distinguish the TS core seam from
  the still Python-owned Workspace/web adapter under CR054.

### Validation evidence

- Focused TS validator/write suite: `31/31` passed.
- Focused Python journey service: `48/48` passed.
- Full TS suite: `818` passed.
- Full Python 3.12 suite: `2461` passed.
- TypeScript typecheck, Biome, Ruff lint/format, documentation links/headings, and
  `git diff --check`: passed.
- Python validation golden: nine cases (`5` accepted, `4` rejected) and exact TS parity.
- Golden regeneration: deterministic across all four CI generators.
- Oracle-drift check: clean after the deliberate `journey.py` baseline advance.
- Schema structural parity and FTS probe: passed.
- Migration fixture parity: all nine probes passed (`001`, `002`, `003`, `004`, `005`,
  `008`, `009`, `016`, and multi-hop chain).
- Portable copied-database smoke: moved `demo-child-beta` with its deep subtree beneath
  `demo-child-alpha`, preserved descendant/task state, refused a cycle with zero writes,
  then unparented and cleared the projection; temporary artifacts were removed.

## Review

The implementation keeps validation pure and movement local to one identity row. A
single transaction closes the validation/write race, while CR050's resolver prevents a
stale column from entering ancestry decisions. No adapter, command, schema, repair,
reparent cascade, inheritance rule, or filesystem operation was introduced.

No corrective debt action is required for CR052. Removal and Workspace/web transfer
remain explicit CR053–CR054 work rather than hidden implementation debt.

## Outcome

Implemented and locally validated. Canonical status remains `in_progress` pending the
implementation commit/push gate, integrated CI, and explicit Navigator acceptance of
the movement/cycle behavior.
