# Plan — CV22.DS7.TS2

## Objective

Replace US4's whole-command Python fallback for matching extension context bindings with a
TypeScript-owned provider dispatcher. Preserve existing Python providers during a finite
deprecation window through a narrow compatibility host, give extension authors a
language-neutral process protocol, and leave no permanent TypeScript-to-Python bridge.

## Grounded Starting State

- `_ext_bindings` is already TS-owned schema and is authoritative for target selection.
- Python selects persona/journey bindings in stable
  `(extension_id, capability_id, target_kind, target_id)` order.
- A provider receives `persona_id`, `journey_id`, `user`, `query`, `binding_kind`, and
  `binding_target`; it returns text or `None`.
- Rendered sections use `=== extension/<extension>/<capability> ===` and blank-line joins.
- Missing extensions, unknown capabilities, load failures, provider exceptions, and empty
  output are fail-soft.
- Current command-skill manifests declare capabilities but register their implementations
  dynamically from arbitrary `extension.py` code. Automatic source translation is neither
  safe nor finite.
- The repository contains one reference context provider (`hello/greeting`), which reads an
  extension-owned SQLite table. No other concrete provider implementation is versioned in
  this repository; private installations will not be inspected.
- US4 currently preflights any possible matching binding and routes the complete
  `mirror load` command to Python. This preserves behavior but prevents command burn-down.

## Required Design Decision

Approve a **language-neutral out-of-process protocol with a temporary legacy adapter**.

### Authoritative provider contract: `mirror-context-v1`

Each `mirror_context_providers[]` entry may add a runtime descriptor:

```yaml
mirror_context_providers:
  - id: greeting
    description: Latest ping injected as a greeting.
    provider_runtime:
      protocol: mirror-context-v1
      command: [node, context/greeting.mjs]
```

The command is an argv array, never a shell string. It runs with the extension directory as
its working directory and receives one versioned JSON request on stdin. It returns one JSON
result on stdout:

```json
{"protocol":"mirror-context-v1","text":"..."}
```

`text: null` means skip. The request carries the existing `ContextRequest` fields plus the
extension/capability identity, extension root, table prefix, and explicitly selected
database path. This preserves the SQLite seam and permits providers written in Node or any
other executable runtime; the Mirror core has no language dependency on them.

The extension remains trusted code, matching today's raw `ExtensionAPI.db` escape hatch.
The provider opens the selected SQLite path itself; TS does not invent a broad database RPC
API. The implementation must characterize connection/commit visibility and contention
against the current same-connection Python behavior. If a stable provider behavior cannot
survive the separate-process connection model, stop rather than silently narrowing the API.
The core nevertheless contains execution failures through no-shell spawning, a bounded
timeout, a bounded stdout buffer, strict JSON/protocol validation, and suppression of raw
provider stderr from operational logs.

### Finite compatibility path

When a declared capability has no `provider_runtime`, TS invokes a compatibility-only
Python host over the same `mirror-context-v1` stdin/stdout envelope. The host is narrow: it
loads one existing extension/capability through today's Python `ExtensionAPI`, invokes that
provider, and serializes only `text` or `null`. It does not run `mirror load`, choose
bindings, compose core context, render the final prompt, or own the command route.

This means:

1. current Python providers continue to work during CV22 without whole-command fallback;
2. authors migrate one capability at a time by adding `provider_runtime` and an executable;
3. TS remains the sole owner of binding selection, ordering, context composition, state,
   and rendering;
4. the compatibility host is explicitly deprecated when introduced and is deleted in
   CV22.DS10 before Python retirement/npm publication;
5. after that cutoff, a provider without `provider_runtime` fails visibly and fail-soft —
   never silently — with migration guidance.

The compatibility host is accepted only as finite transition code. Expanding it into a
second extension runtime, a public API, or a permanent subprocess bridge is a stop
condition.

## Implementation Sequence

### 1. Freeze the existing provider oracle

- Add Python characterization/golden coverage for exact binding selection, request fields,
  ordering, rendering, empty output, unknown capability, missing installation, load error,
  and provider exception.
- Register the Python extension context, API, loader, manifest-validation, and Mirror hook
  files in the oracle-drift baseline.
- Keep fixtures synthetic and explicitly rooted in a temporary Mirror home/database.

### 2. Add the manifest and protocol contract

- Add a TS manifest reader/validator for the narrow fields needed by context dispatch.
- Validate provider ids, uniqueness, protocol version, argv-array shape, and extension-root
  containment for path-like command arguments without invoking a shell.
- Extend Python manifest validation tolerantly so installation and the legacy runtime accept
  the optional descriptor during the transition; existing manifests remain valid.
- Define typed request/result codecs. Reject malformed, oversized, multi-document, or
  wrong-version output fail-soft.

### 3. Implement the isolated TS dispatcher

- Select matching bindings through the released stable SQL order.
- Resolve the installed extension beneath the selected Mirror home; never infer from CWD.
- Invoke one provider per binding with timeout/output limits and deterministic sequencing.
- Preserve text conversion/empty semantics and exact section headers/blank-line rendering.
- Continue after missing extensions, unknown capabilities, process failures, timeouts,
  malformed output, or provider failures.
- Emit metadata-only diagnostics. Never log request JSON, query, user, persona, journey,
  binding target, database contents/path, provider stdout/stderr, or rendered section text.

### 4. Add and fence the legacy compatibility host

- Add one internal compatibility entrypoint that accepts only the protocol request over
  stdin and invokes exactly the named installed Python provider.
- Reuse the existing loader/API behavior; do not duplicate binding selection or Mirror
  orchestration in Python.
- Launch through the existing bounded Python runtime mechanism and mark every source/doc
  reference with its DS10 removal gate.
- Prove that a legacy provider produces the same section while the front-door decision and
  complete `mirror load` lifecycle remain TS-owned.

### 5. Integrate with Mirror Mode and remove the US4 fallback

- Collect extension sections only after persona/journey defaults are resolved.
- Insert them at the same point/order as the Python context oracle.
- Remove `extensionBindingsCouldContribute` and both conservative preflight fallback
  branches from the front door.
- Keep replay/live-provider gates unchanged: live reception remains DS8-owned.
- Prove selected journeys remain isolated; parent/child bindings cannot widen context.

### 6. Migrate the reference extension and document author migration

- Add a `mirror-context-v1` executable provider to the synthetic `hello` reference fixture.
- Preserve a separate Python-only legacy fixture to test the compatibility window.
- Update extension API reference, authoring guide, binding/context docs, and template with:
  protocol schema, executable lifecycle, trust boundary, timeout/output behavior,
  deprecation timeline, and a Python-provider migration example.
- Record DS10 as the hard removal gate; do not activate CV9.E2.S2 or change skill projection.

### 7. Flip evidence and ledger state

- Update front-door routing tests and logs to show matching bindings remain on TS.
- Update the DS7 ledger only after golden and disposable-home runtime evidence pass.
- Preserve DS7 progress at `4/11` until TS2 itself passes Validation, Debt Review, and Done.

## Acceptance Behavior

```text
Given a persona- or journey-bound extension context capability
When mirror load resolves that target
Then TypeScript selects bindings in Python-compatible stable order
And invokes mirror-context-v1 providers in isolated bounded processes
And renders the same ordered extension sections as the Python oracle
And a legacy Python provider still works through the explicitly temporary compatibility host
And missing, unknown, empty, malformed, timed-out, or failing providers remain fail-soft
And selected-journey isolation is unchanged
And operational logs contain no request or provider payload
And the complete mirror load command never falls back to Python because a binding exists
```

## Non-Goals

- Automatic translation of arbitrary Python provider source.
- A permanent Python host or generic TS-to-Python extension API.
- Porting extension CLI handlers, install/uninstall commands, or SQL migrations (DS7.TS1).
- Live LLM/embedding provider cutover (DS8).
- Gemini/Codex skill projection (CV9.E2.S2).
- Marketplace/remote installation, Python deletion, npm publication, or production-data
  inspection.
- Expanding the process protocol beyond Mirror context providers in this story.

## Validation Route

E2E is required.

Automated evidence:

- focused Python extension/context characterization tests;
- TS manifest/protocol/selection/dispatcher/failure/redaction unit tests;
- Python-generated extension-context golden parity;
- full TS suite, typecheck, and lint;
- Python non-live suite, Ruff, oracle drift, deterministic golden regeneration, and
  `git diff --check`.

Navigator-visible disposable-home smoke:

1. create a temporary Mirror home and database;
2. install a synthetic process-provider extension and a Python-only legacy extension;
3. bind providers to one persona and one selected journey, with unrelated ancestor/child
   bindings present;
4. run replay-safe `mirror load` through the TS front door;
5. observe stable sections from both provider forms, no unrelated sections, and a TS route;
6. replace one provider with malformed/raising/timed-out variants and observe that core
   context still renders;
7. inspect redacted front-door diagnostics and confirm no payload is present.

Pass: exact sections/order match the oracle, both transition forms work, failures isolate,
logs are payload-free, and no binding-triggered whole-command fallback remains.

Fail: context is lost silently, order/request/rendering diverges, unrelated journey context
appears, raw payload reaches logs, a provider can hang the command past its bound, or TS
still delegates complete `mirror load` because a binding exists.

## Structured Plan Review

The required technical lenses produced these Plan constraints:

- **Engineer:** keep one small versioned protocol; do not recreate the full Python
  `ExtensionAPI` as RPC. Characterize the SQLite connection semantic before claiming parity.
- **Quality assurance:** require non-vacuous fixtures for native, legacy, failing, malformed,
  and timed-out providers, plus proof that complete-command routing is TS.
- **Database architect:** test read visibility, provider writes/commit, busy-timeout behavior,
  and failure rollback/partial effects across the second SQLite connection. Stop if current
  stable semantics cannot be preserved safely.
- **DevOps:** use argv spawning without a shell, extension-root working directories, bounded
  output/time, portable path construction, and the already-supported `uv` fallback only for
  the explicitly temporary host. Do not claim Windows process homologation without evidence.
- **Security:** treat installed extensions as trusted executable code as today, but validate
  descriptors, prevent shell interpolation/path escape, suppress raw stdout/stderr from
  diagnostics, cap resources, and test every sensitive field for log absence.

No review lens found a reason to retain the US4 whole-command fallback. The unresolved
product decision is whether the finite compatibility host and DS10 cutoff are acceptable.

## Stop Conditions

Stop for Navigator decision if:

- the finite legacy-host removal gate is rejected;
- preserving a discovered stable provider behavior requires an unbounded generic Python API
  or cannot preserve required SQLite connection/commit semantics across processes;
- a provider requires live LLM/embedding behavior that would cross DS8;
- the manifest/protocol change breaks existing command-skill installation outside the
  documented deprecation path;
- safe process containment requires a scope expansion beyond TS2;
- any test would use a production or development database.

## Approval Gate

**Approved by the Navigator on 2026-08-19.** The approval explicitly accepts the
`mirror-context-v1` process contract and the compatibility host's DS10 deletion deadline.
It authorizes local TDD implementation, not commit, push, release, or the DS10 removal
itself.
