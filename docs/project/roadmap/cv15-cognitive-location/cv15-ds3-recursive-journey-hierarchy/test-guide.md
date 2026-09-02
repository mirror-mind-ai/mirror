[< Story](index.md)

# Test Guide — CV15.DS3 Recursive Journey Hierarchy

## Automated Focus

Develop behavior test-first and keep this focused gate green:

```bash
uv run pytest \
  tests/unit/memory/services/test_journey.py \
  tests/unit/memory/cli/test_journeys.py \
  tests/unit/memory/surfaces/test_workspace.py \
  tests/unit/memory/web/test_server.py -q

uv run ruff check \
  src/memory/services/journey.py \
  src/memory/cli/journeys.py \
  src/memory/surfaces/workspace.py \
  src/memory/web/server.py \
  tests/unit/memory/services/test_journey.py \
  tests/unit/memory/cli/test_journeys.py \
  tests/unit/memory/surfaces/test_workspace.py \
  tests/unit/memory/web/test_server.py

uv run ruff format --check src/ tests/
node --check src/memory/web/static/app.js
```

Required automated cases:

- create a chain at least four journeys deep;
- move a subtree under another branch without changing ids or project paths;
- detach a node to root;
- reject self-parenting;
- reject an indirect cycle;
- reject mutation through pre-existing malformed cyclic metadata;
- keep unknown-parent journeys visible and bounded;
- recursively order active/non-active siblings at every depth;
- render all CLI depths with stable tree connectors;
- compose recursive Scene children and complete root-to-selected lineage;
- return only immediate siblings as nearby journeys;
- preserve exact-journey movement counts with no ancestral aggregation;
- refuse removal when direct children exist;
- prove refused or allowed removal has no cascade into unrelated records.

## TypeScript Contract

Before CV22 claims journey read parity, add golden coverage for:

- recursive depth-first ordering;
- depth and complete lineage;
- unknown-parent handling;
- cyclic metadata failure/degradation contract.

Before CV22 claims journey write parity, cover:

- arbitrary-depth parent assignment;
- indirect-cycle rejection;
- move stability;
- parent-with-children removal refusal.

This story records those obligations; it does not require dual implementation.

## Isolated CLI Validation

Use a temporary mirror home and create this tree through supported service/API
paths:

```text
Life
└─ Entrepreneurial Life
   └─ Business A
      └─ Product A
         └─ Website
```

Then run:

```bash
MIRROR_HOME="$TMP_MIRROR_HOME" uv run python -m memory journeys
```

Expected:

- all five levels are visible in order;
- each level has an unambiguous connector/indent;
- status, stage, and description remain present;
- no ancestor content is displayed as child content.

## Manual Browser Validation

Against an isolated database:

1. Open Workspace and create or assign at least five nested journeys.
2. Confirm navigation can expand every level and automatically reveals the
   selected journey's ancestor chain.
3. Select the deepest node and confirm Current Scene shows complete lineage.
4. Confirm nearby journeys are only its immediate siblings.
5. Confirm Journey Map and All Journeys preserve the complete hierarchy.
6. Confirm parent selectors distinguish nodes with similar names by lineage.
7. Move an intermediate subtree and confirm ids, project paths, and filesystem
   directories remain unchanged.
8. Attempt to move a parent below its descendant and confirm a clear rejection
   with no partial metadata change.
9. Attempt to remove a parent with children and confirm simple refusal.

## Full Verification Before Close

```bash
uv sync --extra dev
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
```

If repository-wide mypy still reports the known baseline, record the exact
result rather than claiming that gate green.
