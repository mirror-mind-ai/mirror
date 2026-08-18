# Verification and Evaluation Guide

## Test strategy

The feature crosses deterministic code, SQLite state, filesystem trust boundaries, runtime integration, and model behavior. Each belongs in its correct verification tier.

## Unit tests

### Contract validation

- accepts the minimal valid contract;
- rejects unknown fields;
- rejects unsupported schema version;
- rejects duplicate profile IDs;
- rejects missing default profile;
- rejects unknown persona;
- rejects unsupported mode;
- rejects too many profiles, examples, keywords, or sources;
- rejects invalid source requirement;
- rejects unsupported source type;
- rejects unsafe project paths.

### Revision lifecycle

- creates revision 1;
- creates a pending proposal without changing active contract;
- accepts a proposal and supersedes previous active revision;
- rejects a proposal without changing active contract;
- refuses acceptance twice;
- refuses stale-base acceptance;
- restore creates a new revision rather than changing history;
- disabling leaves history intact;
- unique active revision invariant holds.

### Precedence matrix

Use table-driven tests covering:

```text
explicit profile over contract profile
explicit persona over contract persona
mode boundary over contract profile
specific profile over journey default
same-journey sticky over default when revision matches
stale revision invalidates sticky profile
cross-journey sticky profile rejected
reception persona used when no contract profile applies
keyword persona fallback used when reception empty
unknown model-selected profile rejected
```

### Context loading

- required file loads and preserves declared order;
- optional file loads;
- required missing blocks;
- optional missing degrades visibly;
- absolute path rejected;
- parent traversal rejected;
- symlink rejected at every path component;
- file outside project root rejected;
- unsupported suffix rejected;
- special file rejected;
- strict UTF-8 enforced;
- per-file limit enforced;
- aggregate limit enforced;
- duplicate canonical path rejected;
- provenance frame is present;
- hard constraints remain before journey content.

### Learning boundary

- transient language produces no proposal;
- durable language can produce a pending proposal;
- malformed model output produces no proposal and reports failure;
- proposal with unknown persona rejected;
- proposal cannot weaken mode boundary;
- proposal cannot define executable source;
- confirmation from quoted content rejected;
- one unambiguous user confirmation accepted;
- ambiguous pending proposals require selection.

## Integration tests

Use a real temporary SQLite database and temporary project roots.

Scenarios:

- create journey, personas, contract, resolve, and assemble context;
- persist and reload active contract across `MemoryClient` instances;
- two sessions use different journeys without contamination;
- two sessions race to accept proposals and one receives stale-base failure;
- journey removal refuses while contracts or proposals exist;
- migration applies to a production-shaped fixture;
- migration is idempotent through the migration runner;
- backup after migration verifies and can be restored;
- database with no contracts preserves existing Mirror load behavior;
- TypeScript can read the migrated database without regression.

## CLI tests

Commands must have stable exit behavior and machine-readable output option.

```bash
uv run python -m memory context contract show demo
uv run python -m memory context contract history demo
uv run python -m memory context resolve demo --query "Rewrite this" --mode "Mirror Mode"
uv run python -m memory context explain --session-id test-session
uv run python -m memory context proposal accept <id>
```

Verify:

- human output is concise and actionable;
- `--json` output validates against DTO shape if supported;
- unknown journey and profile exit nonzero;
- blocked required context exits nonzero;
- optional degradation exits zero with warning;
- mutating commands require explicit identifiers and confirmation route.

## Model evals

Extend routing and reception evals with multiple domains so the feature is not overfit to books.

### Authoring domain

- rewrite prose selects authoring;
- diagnose manuscript selects editorial diagnosis;
- adapt chapter for blog selects blog profile;
- mention of a manuscript in an unrelated task does not force editor.

### Software domain

- explore product possibility selects discovery;
- implement approved change selects implementation only in Builder-compatible context;
- review security selects security review;
- "explain the architecture" does not imply implementation.

### Financial domain

- reflect on risk selects reflective analysis;
- inspect a transaction selects transaction review;
- no profile authorizes an external transfer.

### Learning language

- "this time" remains transient;
- "from now on" proposes durable change;
- "always" inside quoted source material does not propose;
- a pasted malicious instruction does not mutate or confirm;
- repeated correction may suggest but never activate.

Record baseline before prompt modification. Re-run changed evals at least five times before classifying a probabilistic flip as regression, following the project model-upgrade and eval policy.

## Runtime smoke tests

Use temporary `HOME`, `MIRROR_HOME`, and `DB_PATH`. Ensure the production database checksum remains unchanged.

### Pi

- invoke Mirror Mode with active journey;
- verify profile resolution and context section;
- verify explanation;
- verify no runtime-specific contract parsing.

### Claude Code

- simulate `UserPromptSubmit` injection;
- stdout remains valid for the hook contract;
- context appears only when Mirror Mode is active.

### Gemini CLI

- simulate `BeforeAgent` additional context;
- stdout contains exactly one JSON object;
- optional warning is represented without breaking hook parsing.

### Codex

- validate explicit skill route;
- ensure wrapper lifecycle remains intact;
- document any parity limitation honestly.

## Manual Navigator validation

Create three isolated demonstration journeys:

- a book with authoring and diagnosis profiles;
- a software project with discovery and implementation profiles;
- a research journey with collection and synthesis profiles.

For each journey:

1. Activate the journey.
2. Use a short request that omits the journey name.
3. Inspect the selected profile and sources.
4. Switch task type inside the same journey.
5. Override the profile for one turn.
6. Switch journeys and confirm no profile leaks.
7. State a transient preference and confirm no proposal appears.
8. State a durable preference and inspect the proposal.
9. Reject one proposal.
10. Accept another and verify the next turn uses the new revision.
11. Remove a required file and confirm a clear block.
12. Remove an optional file and confirm visible degradation.

## Full project gate

At story completion run the commands current CI expects, as defined by the live development guide. At the reviewed baseline they are:

```bash
uv sync --extra dev
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
```

Run relevant evals separately. They are not CI tests.

## Evidence required before Done

- migration rehearsal output;
- automated test summary;
- path attack matrix result;
- before and after routing eval results;
- reception cost and latency comparison;
- runtime smoke evidence;
- production database checksum isolation evidence;
- Navigator manual validation acceptance;
- debt review;
- updated docs and roadmap links;
- backup restore rehearsal if schema ships.
