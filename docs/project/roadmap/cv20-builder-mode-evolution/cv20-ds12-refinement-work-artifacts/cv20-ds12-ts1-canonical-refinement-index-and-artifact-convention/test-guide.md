[< Story](index.md)

# Test Guide — CV20.DS12.TS1

## Documentation Checks

Run:

```bash
python scripts/check_doc_links.py
git diff --check
```

Pass when relative links and heading codes are valid and no whitespace errors exist.

## Scope Check

Inspect changed paths. Implementation must add only:

```text
docs/project/refinement/index.md
docs/project/refinement/rs001-ariad-runtime-trust/index.md
docs/project/refinement/rs001-ariad-runtime-trust/cr001-scope-confirmation-checkpoint.md
docs/project/refinement/rs001-ariad-runtime-trust/cr002-cursor-sync-roadmap-selection.md
docs/project/refinement/rs001-ariad-runtime-trust/cr003-surface-materialization-truth.md
```

The already-authored TS1 roadmap package may also change to record lifecycle evidence.
Any source, test, database, configuration, generated manifest, or lockfile change fails
scope validation.

## Contract Review

Confirm from the root index alone:

- exactly one place declares current focus;
- each known RS and CR has exactly one canonical status;
- every CR links to one RS and one narrative document;
- IDs are stable project IDs rather than journey/database identity;
- open order is authored and understandable;
- terminal history is distinguishable from open work;
- no field exists only for a hypothetical parser or synchronization protocol.

## File-Only Navigation Exercise

Open `docs/project/refinement/index.md` in a fresh context without querying SQLite.
Answer:

1. What is the current Refinement focus?
2. Which CRs remain open and in what order?
3. Which CR demonstrates a terminal outcome?
4. Where is the evidence for each answer?

Expected observation: all answers are available through relative links from the index.

Pass condition: the backlog and evidence are unambiguous without database, journey, or
conversation history.

Fail condition: status must be inferred from prose, links are broken, local-only context
is required, or the index and item documents compete for authority.

## E2E Decision

Required as the file-only navigation exercise above. No executable-product E2E and no
full Python/TypeScript suite are required because TS1 changes documentation only.

## Validation Evidence

Pending implementation and Navigator validation.
