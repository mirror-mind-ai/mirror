[< CV23](index.md)

# CV23 — Journey Projection Contract: Verification Guide

**Status:** Planned verification contract
**Rule:** all fixtures are synthetic and all subprocess homes are temporary

Each Delivery Story will refine these commands into its own copy-paste test
route. This guide defines the CV-level acceptance matrix and the failure tests
that may not be omitted.

## 1. Acceptance-Kit Integrity Baseline

```bash
CONTRACT=/Users/alissonvale/.mirror-journeys/vida-criativa/nautilus/harness/contracts/mirror-journey-projections/v1
cd "$CONTRACT"
shasum -a 256 -c PROBE-SHA256SUMS
python3 -m unittest discover -s tests -p 'test_*.py'
```

Expected before and after Mirror implementation:

- every recorded hash reports `OK`;
- 16 acceptance-kit self-tests pass;
- no contract file is modified.

## 2. Pre-Implementation Baseline

Run against an isolated home:

```bash
CONTRACT=/Users/alissonvale/.mirror-journeys/vida-criativa/nautilus/harness/contracts/mirror-journey-projections/v1
TEMP_HOME="$(mktemp -d)"
python3 "$CONTRACT/probe/contract_probe.py" \
  --mirror-command-json '["uv","run","python","-m","memory"]' \
  --mirror-root /Users/alissonvale/Code/mirror-dev \
  --mirror-home "$TEMP_HOME" \
  --journey-fixture "$CONTRACT/fixtures/journey"
rm -rf "$TEMP_HOME"
```

Expected before CV23: exit `10`, `result: contract_unavailable`, `gate: blocked`.

Expected after implementation: the same unchanged command exits `0`, reports
`result: passed`, and opens the test gate.

## 3. Unit Test Matrix

### Models, schemas, and deterministic serialization

- shared envelope accepts only contract `1.0` and schema `1`;
- Operational and extension domain schemas compose correctly;
- optional extension schema uses JSON Schema 2020-12 behavior;
- unknown/additional strict fields fail where schemas prohibit them;
- timestamps require UTC `Z`;
- canonical serialization uses UTF-8, sorted keys, two spaces, and one newline;
- equivalent input produces byte-identical output;
- fixed timestamp/snapshot seams are unavailable outside test mode.

### Identifier and path safety

- empty, one-character where forbidden, oversized, separator-bearing, `..`,
  absolute POSIX, absolute Windows, UNC, and drive-relative identifiers fail;
- unknown Journey fails before filesystem mutation;
- missing registered root fails loudly;
- symlink in namespace path, projection path, temp path, receipts path, or
  manifest path cannot escape the registered Journey root;
- a symlink that changes between validation and write is detected or contained;
- rejected inputs preserve projection, manifest, and pre-existing receipts byte
  for byte.

### Namespace authority

- Core alone publishes `ariad:operational`;
- extension façade derives namespace from `extension_id`;
- extension cannot publish into `ariad` or another extension namespace;
- envelope namespace and producer ID must equal the bound extension ID;
- test-only `probe-publish` cannot be reached in production mode or against the
  configured production home.

## 4. Linearizable Publication Tests

### Per-Journey exclusion

Use real subprocesses, not threads or mocked locks.

1. Process A acquires the Journey publication lock and pauses at an injected
   barrier.
2. Process B attempts a publication for the same Journey.
3. Assert B cannot enter manifest read/merge until A commits or aborts.
4. Release A; assert both completed operations have a total order matching their
   manifest results and both inspections are valid.
5. Repeat with different Journeys and assert they may progress independently.

Required cases:

- Core/Core publishers;
- Core/extension publishers;
- extension/extension publishers;
- lock holder exits normally;
- lock holder raises;
- lock holder process is terminated;
- bounded lock timeout returns structured failure with no public mutation.

### Explicit stale-manifest lost-update prevention

A deterministic two-process barrier must force both publishers to observe the
same manifest before they contend for the lock. Each publishes a different
namespace/projection.

Expected final state:

- both entries exist;
- neither source revision or path was overwritten;
- unrelated baseline entries remain unchanged;
- both documents inspect successfully;
- repeated runs produce no missing entry;
- a deliberately stale-merge reference implementation would fail this test.

Also test two updates to the same projection. Their successful return order must
match one total publication order, and the final manifest/document pair must be
the latter operation in that order.

### Linearizable inspection

Pause a writer after projection replacement and before manifest replacement.
Start inspection in another process.

Expected:

- inspect never returns the new document with the old manifest entry;
- inspect either waits and returns the committed pair, returns the restored old
  pair after writer failure, or returns structured divergence after an
  unrecoverable/crash state;
- inspect never repairs, publishes, or invokes synthesis.

## 5. Immutable Receipt Tests

For a fixed `(journey, namespace, projection, snapshotId)`:

- first publication creates one deterministic internal receipt;
- retry with byte-identical document is idempotent;
- retry with semantically equivalent input produces the same canonical digest;
- retry with different canonical bytes fails before public replacement;
- receipt itself cannot be overwritten, truncated, or redirected through a
  symlink;
- failed publication after receipt creation may leave that receipt but cannot
  make it current in the manifest;
- a later valid retry may reuse the matching receipt;
- receipt contents contain no prompt, response, transcript, environment dump,
  secret, raw reasoning, or database path/content;
- receipt presence never makes `inspect` accept an absent or divergent public
  projection.

## 6. Failure-Injection Matrix

Inject one deterministic failure at each boundary and compare exact bytes before
and after:

| Failure point | Required observation |
|---------------|----------------------|
| Journey resolution | no directories or receipts created |
| Identifier/confinement validation | no filesystem change |
| Envelope/domain validation | no filesystem change |
| Serialization | no filesystem change |
| Lock acquisition timeout | no filesystem change |
| Manifest read/validation under lock | no public change |
| Receipt temp write | no public change; incomplete temp removed/bounded |
| Receipt flush/close | no public change |
| Receipt create-once publish | no public change; conflicting receipt rejected |
| Projection temp create/write | old projection and manifest unchanged |
| Projection file flush | old projection and manifest unchanged |
| Projection atomic replace | old manifest remains; old projection restored when operation retains control |
| Projection directory durability | no success returned; restore or explicit divergence |
| Next-manifest build/merge | old manifest remains; old projection restored |
| Manifest validation | old manifest remains; old projection restored |
| Manifest temp write/flush | old manifest remains; old projection restored |
| Manifest atomic replace | either old pair restored or committed new pair; never mixed success |
| Manifest directory durability | no false success; platform-specific result documented |
| Restoration replace/flush | structured `projection_divergence`; receipt evidence preserved |
| Process kill after projection replace | old manifest remains; subsequent inspect reports bounded divergence and performs no implicit repair |
| Rendering after committed manifest | publication remains committed; no duplicate retry or false rollback |

For every failure:

- error is nonzero structured JSON at the CLI boundary;
- diagnostics contain no document content, Journey private data, root/database
  path, environment values, prompt, transcript, secret, or provider output;
- lock is eventually reclaimable according to the selected cross-platform
  mechanism;
- no unrelated manifest entry changes;
- no model or network call occurs.

## 7. Operational Compiler Golden

With the acceptance kit's synthetic Journey copied under a temporary home and
prepared through the test-only command:

- rebuilt `document` is byte-equivalent to
  `fixtures/expected/operational.json` under canonical serialization;
- manifest identity matches `fixtures/expected/manifest.json`;
- authored roadmap root/child order is preserved;
- node status and type normalization match the fixture;
- artifact references are Journey-relative and confined;
- active work comes only from supplied/durable active state;
- Exploratory Story includes public summary, attractor, experiment, and handoff
  metadata but no narrative evidence;
- Refinement Story and nested Change Request use canonical document-first state;
- source revision changes when and only when represented source truth changes;
- fixed test time/snapshot inputs are deterministic across repeated runs.

Add native Mirror fixtures for both supported roadmap grammars and for absent,
malformed, cyclic, ambiguous, and partially-authored structures. The compiler
must fail or degrade according to explicit policy rather than fabricate content.

## 8. Lifecycle Refresh Integration

For each represented mutation family:

- Delivery plan/checkpoint/validation/debt/done changes;
- Explorer story status, summary, attractor, experiment, and handoff changes;
- Refinement Story and Change Request lifecycle changes;

prove:

1. source truth commits first;
2. exactly one refresh request follows when represented state changed;
3. no refresh occurs for read-only or non-represented changes;
4. successful refresh is quiet;
5. injected refresh failure leaves source truth committed;
6. previous manifest-referenced projection remains valid when restoration
   succeeds;
7. unrecoverable publication state surfaces explicit divergence;
8. no model/network provider is invoked.

An architecture-level test must inventory mutation entry points or otherwise
prevent a new represented mutation from silently bypassing refresh.

## 9. Production and Privacy Guards

- `probe-prepare` and `probe-publish` refuse production mode;
- both refuse the configured production home even when `MEMORY_ENV=test` is
  forged;
- fixture DB resolution is verified with `PRAGMA database_list` before any test
  write;
- tests refuse DB paths outside their temporary directory;
- no test reads or copies a development or production database;
- no projection operation invokes model, embedding, Pi, persona, provider, or
  network seams;
- operational logs and JSON errors are payload-free.

## 10. Full Repository Gate

Before every story close and before release:

```bash
uv sync --extra dev
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
uv run python scripts/check_doc_links.py
```

Expected: all commands pass without API keys.

## 11. Installed-Runtime Return Gate

After a separately authorized central release and safe installation:

1. verify installed Mirror version and capability discovery;
2. use a new isolated temporary Mirror home;
3. run the unchanged external probe against the installed executable, not the
   source checkout;
4. require `result: passed` and `gate: open`;
5. verify the operational fixture snapshot ID and source revision;
6. complete consumer-owned `mirror-return.json` with release, CI, backup/update,
   probe hash/command/artifact, and no private evidence;
7. leave the gate blocked for any unresolved normative deviation.

Repository tests, a merge, a tag, or a claimed installation do not replace this
return gate.
