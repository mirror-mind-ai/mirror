[< RS008](index.md) · [Canonical status](../index.md#change-requests)

# CR053 — Port Conservative Transactional Journey Removal

## Problem

`v0.31.9` added a conservative journey-removal domain operation: only an empty leaf may
be deleted, association checks and deletion occur under `BEGIN IMMEDIATE`, and no child
is reparented or associated record cascaded. The TS core has a reusable immediate
transaction helper but no equivalent journey association inventory or removal
operation.

Removal has no public UI today, yet Python cannot be retired while it remains the only
implementation of this domain behavior.

## Expected Behavior

TypeScript refuses removal when the journey does not exist, has child journeys, or is
referenced by any known journey path, conversation, memory, task, attachment, runtime
session, Explorer story, Builder refinement story, change request, or refinement
cursor. The check and delete execute atomically in an immediate transaction.

Only an empty leaf is removed. Failure leaves all state untouched. There is no cascade,
automatic reparenting, orphan creation, filesystem deletion, or public removal UI added
implicitly by this CR.

## Impact

Without this operation, Python retirement remains incomplete. A weaker TS deletion
would risk orphaning durable personal and Builder data under concurrency.

## Plan Or Decision

Navigator-approved plan. Port the released removal boundary in nine bounded slices:

1. **Lock the released contract with failing tests.** Add focused TS tests for a missing
   journey, every blocking association, multiple associations in deterministic message
   order, a parent with children, an empty-leaf success, and a database failure after
   deletion begins. The initial red must show that no TS inventory or removal seam
   exists, rather than passing through a test-only implementation.
2. **Advance only the Python compatibility oracle needed by CR053.** Bring the released
   `count_journey_associations`, `delete_unassociated_journey`, and `remove_journey`
   behavior into the branch compatibility copy without routing a Python command or
   changing unrelated Python authority. Generate a small real-Python golden for missing,
   child-blocked, association-blocked, multi-association, and successful removal cases.
   Refresh only the resulting `journey.py` and `identity.py` oracle hashes after TS
   outcomes and messages match.
3. **Define a closed, typed association inventory.** Introduce an explicit TS result with
   all eleven released categories: `child_journeys`, `journey_paths`, `conversations`,
   `memories`, `tasks`, `attachments`, `runtime_sessions`, `explorer_stories`,
   `refinement_stories`, `change_requests`, and `refinement_cursors`. Use fixed SQL per
   category—never caller-controlled table or column interpolation—and preserve that
   order when rendering populated counts.
4. **Keep child detection metadata-authoritative.** Count children from valid journey
   metadata exactly as the released Python query does. Prove that metadata parentage
   blocks removal even when migration `017`'s column is null or stale, while a
   column-only stale parent does not invent a child. Malformed or non-object metadata
   remains tolerated and does not fall back to the projection column.
5. **Add one transactional domain seam.** Implement and export `removeJourney` over a
   `WritableDatabase`. Within one existing `withTransaction` / `BEGIN IMMEDIATE`
   boundary, verify the journey identity, count all associations, refuse children before
   other records with the released messages, and delete only the matching
   `(layer='journey', key)` row when every count is zero. Return `true` on success. Do
   not add a front-door route, CLI command, Workspace/web action, or generic identity
   deletion API.
6. **Prove refusal and rollback preserve complete state.** On isolated database copies,
   snapshot relevant tables before every failure and assert byte-for-byte equality
   afterward. Use an aborting SQLite delete trigger to prove a database exception rolls
   back the identity deletion. Test multiple unrelated journeys so success proves that
   exactly one identity row changed and no descendant or associated row was touched.
7. **Prove the serialized contention outcome.** Use a separate process/connection to
   acquire the write lock and create an association before committing. Start removal
   while that transaction owns the lock and prove removal waits, then observes the
   committed association and refuses without mutation. This grades the released atomic
   check/delete boundary; it does not introduce foreign keys or promise to reject a new
   unguarded association written after removal has already committed.
8. **Prove meaning and filesystem preservation.** Remove a leaf whose own metadata
   contains `project_path`, `sync_file`, icon, and color, and assert its external
   directory and sentinel files remain untouched. Run a portable copied-database smoke
   covering blocked-parent, blocked-association, and successful-leaf outcomes. Amend
   DS6.US3, DS7.US1, and the CV22 authority narrative so the TS domain seam is explicit
   while public removal UI remains absent.
9. **Validate end to end.** Run focused red/green Python and TS tests, full Python 3.10
   and 3.12 plus TS suites, typecheck, Biome, Ruff, deterministic golden regeneration,
   oracle drift, schema and migration parity, the contention test, copied-database
   smoke, documentation checks, and `git diff --check` before Navigator validation.

### Acceptance checkpoint

CR053 is ready for Navigator validation when:

- a missing journey fails with the released message and zero writes;
- each of the eleven association categories independently blocks removal;
- child refusal takes precedence over associated-record detail, and populated detail is
  deterministic;
- metadata, never migration `017`'s derived column, decides child parentage;
- a competing association transaction that wins the lock is observed before removal;
- every domain or database failure leaves all state unchanged;
- one empty leaf can be removed without changing any other row or filesystem content;
  and
- no cascade, reparenting, orphan repair, schema change, public route, or CR054 adapter
  work is introduced implicitly.

### Conscious exclusions

No schema migration, foreign key retrofit, generic deletion framework, public CLI/UI,
Workspace/web transfer, automatic child movement, associated-record cascade, path
inference, inherited behavior, filesystem deletion, production-data inspection or
reconciliation, or protection against unrelated writes that begin after removal commits
belongs to CR053.

## Evidence

The planning audit found no `removeJourney`, `deleteUnassociatedJourney`,
`countJourneyAssociations`, or equivalent guard under `ts/src`. The branch compatibility
copy also predates the released Python removal methods, so a bounded oracle advance is
required rather than a handwritten TS-only expectation.

The released implementation inventories eleven categories across `identity`,
`conversations`, `memories`, `tasks`, `attachments`, `runtime_sessions`,
`exploratory_stories`, `builder_refinement_stories`, `builder_change_requests`, and
`builder_refinement_cursors`. These journey references are not foreign keys to the
journey identity. The released child query reads JSON metadata, consistent with CR050's
mixed-engine authority decision.

`ts/src/db/database.ts` already supplies `withTransaction`, an explicit
`BEGIN IMMEDIATE`/commit/rollback seam with a 30-second busy timeout. The TS schema and
migration inventory contains every released association table and migration `017`'s
derived parent projection, so CR053 requires no schema change. Existing multi-process
migration tests provide the process/connection pattern for deterministic lock
contention evidence.

### Implementation evidence

- TDD first reproduced the missing TS removal module and four missing Python
  compatibility behaviors before either implementation existed.
- The branch compatibility copy now carries only the released removal service and
  identity-store inventory needed by this parity slice. A real-Python five-case golden
  records exact missing/child/association errors, deterministic multi-association order,
  all eleven counts, successful removal, and the postcondition. Oracle drift now tracks
  both `journey.py` and `storage/identity.py`.
- `JourneyAssociationCounts` is a closed eleven-field contract backed by fixed SQL
  literals. Child detection reads valid JSON metadata and never migration `017`'s
  projection; tests cover metadata/column disagreement plus malformed and non-object
  metadata.
- Exported `removeJourney` performs existence, inventory, refusal ordering, and one
  identity deletion inside the existing immediate transaction. Typed errors retain the
  slug, complete counts when available, and released Python messages. No route or
  generic deletion API was added.
- Parameterized database-copy tests independently seed every association category and
  prove complete table snapshots are unchanged after refusal. An aborting delete
  trigger proves database failure rolls back. Empty-leaf success removes exactly one
  identity and preserves unrelated journeys and external sentinel files.
- A separate-process contention test acquires the write lock, inserts a task, and commits
  while removal waits; removal then observes `tasks=1` and refuses without mutation.
- A portable Python-created database smoke refused a populated parent, refused a
  task-associated leaf, removed only `demo-child-alpha`, preserved the parent and task,
  and removed all temporary artifacts. The removal seam itself works without relying on
  migration `017`'s column.
- DS6.US3, DS7.US1, and the CV22 authority narrative now record core removal parity while
  leaving public Workspace/web ownership to CR054.

### Validation evidence

- Focused TS removal/parity suite: `21/21` passed.
- Focused Python removal oracle: `4/4` passed on Python 3.12 and Python 3.10.
- Full TS suite: `839` passed.
- Full Python 3.12 suite: `2465` passed.
- The local Python 3.10 full run reached two unrelated SQLite-runtime failures. Both
  failures reproduce unchanged at kickoff commit `92bfb23`; all CR053-focused Python
  3.10 tests pass. Integrated CI remains the authoritative Python 3.10 gate.
- TypeScript typecheck, Biome, Ruff, schema/FTS structural parity, and all nine migration
  fixture probes passed.
- All CI golden generators, including the new removal oracle, regenerate
  deterministically. Oracle drift is clean after the deliberate two-file baseline
  advance.
- Copied-database smoke, multiprocess lock contention, documentation checks, and
  `git diff --check` passed.

## Review

The implementation preserves the released conservative boundary: it can delete only
one demonstrably empty journey identity, and every ambiguous or populated state fails
closed. Transaction scope is narrower than a generic data-deletion framework and broad
enough to close the check/delete gap. Metadata authority remains consistent with
CR050–CR052.

No corrective debt action is required for CR053. Foreign keys, writer-wide prevention
of associations created after removal commits, public routing, and Workspace/web
ownership remain conscious exclusions rather than hidden implementation debt.

## Outcome

Implemented and locally validated. Canonical status remains `in_progress` pending the
implementation commit/push gate, integrated CI (including Python 3.10), and explicit
Navigator acceptance of the conservative removal behavior. No public removal route or
production-data mutation was introduced.
