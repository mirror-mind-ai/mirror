# Implementation Plan

## Delivery classification

This is non-trivial product and architecture work. It changes routing behavior, prompt behavior, database schema, runtime context composition, and user-facing configuration. It should be represented as a Capability Value, Delivery Story, or a sequence of small User and Technical Stories according to the live roadmap at implementation time.

Do not absorb it into the unrelated active Builder item. Create or select explicit work through the current Ariad flow.

## Recommended delivery sequence

### Slice A: domain and persistence foundation

Outcome: contracts can be created, validated, revised, disabled, and inspected without affecting routing.

Work:

- add strict domain models;
- add append-only migration for contract and proposal tables;
- implement `storage/context_contract.py`;
- implement service CRUD and revision transactions;
- update journey removal association checks;
- wire `MemoryClient`;
- add contract show, history, validate, enable, and disable CLI commands;
- document public Python API if exposed.

Verification:

- unit tests for schema validation and state transitions;
- integration tests over real SQLite;
- migration rehearsal;
- TS database open and existing read parity checks.

### Slice B: deterministic resolution without model changes

Outcome: explicit profile, exact profile keyword, same-journey sticky profile, and default profile resolve predictably.

Work:

- implement `ContextResolutionRequest` and `ContextResolution`;
- implement precedence and reason codes;
- enforce mode boundaries;
- store namespaced contract session metadata;
- add `memory context resolve` and `context explain`;
- ensure journey and persona are treated as a compatible pair.

Verification:

- table-driven precedence tests;
- cross-journey contamination tests;
- session revision invalidation tests;
- command smoke tests in isolated database.

### Slice C: safe project-file context assembly

Outcome: selected profiles load required and optional project files safely and lazily.

Work:

- implement typed `project_file` source;
- implement path and size validation;
- add provenance-framed context sections;
- integrate with Mirror context composition;
- expose degraded and blocked results;
- add bounded cache only if measurements justify it.

Verification:

- full path attack matrix;
- missing required and optional behavior;
- prompt provenance snapshot tests;
- production database checksum unchanged in smoke tests.

### Slice D: reception profile classification

Outcome: ordinary language selects a profile dynamically without a universal intent taxonomy.

Work:

- extend reception input with bounded journey profiles;
- extend `ReceptionResult` with optional profile ID and confidence or ambiguity data;
- update prompt fencing and validation;
- prefer exact deterministic match when unique;
- define ambiguity behavior;
- log through existing observability authority;
- add or extend routing and reception evals.

Verification:

- unit tests with mocked model output;
- malformed and unknown output tests;
- live eval probes for authoring versus diagnosis, software discovery versus implementation, and cross-journey profile selection;
- cost comparison against baseline reception.

### Slice E: Mirror Mode integration

Outcome: activation loads compact contract state and turns apply selected context through the core.

Work:

- integrate resolver into `src/memory/skills/mirror.py`;
- integrate assembled sections into identity context without moving behavior into runtime wrappers;
- update transition or explanation surfaces minimally;
- ensure explicit persona and profile arguments remain authoritative;
- preserve behavior for journeys without contracts.

Verification:

- current no-contract behavior remains backward-compatible;
- identical core results for runtime adapters;
- isolated smoke routes for Pi, Claude Code, Gemini CLI, and Codex where practical.

### Slice F: conversational proposals and confirmation

Outcome: natural durable instructions create reviewable proposals and only confirmation activates a revision.

Work:

- add fenced proposal-generation prompt;
- define strict patch or full-contract proposal model;
- persist pending proposals;
- render proposal surfaces;
- implement accept, edit, reject, expire, and stale-base behavior;
- bind confirmation to active session and journey;
- exclude repetition-based learning initially.

Verification:

- no same-call activation;
- quoted confirmation and prompt-injection tests;
- stale proposal concurrency test;
- evals for transient versus durable language;
- manual conversational validation.

### Slice G: Web journey surface

Outcome: a non-technical user can inspect and manage "How we work in this journey".

Work:

- add typed surface DTOs under `src/memory/surfaces/`;
- expose web routes through services, never raw SQL;
- render profile cards, references, active revision, and proposals;
- provide confirmation and restore flows;
- preserve accessibility and narrow viewport behavior.

Verification:

- surface unit tests;
- server route tests;
- browser QA with screenshots;
- no production mutation during read-only inspection.

### Slice H: broader mode and source support

Outcome: contracts coordinate approved context in Builder and Explorer, and can use additional typed source classes.

This slice requires separate product decisions. Do not include it automatically in the first release.

## Likely files

The exact file list must be confirmed against the live checkout. Likely touch points:

```text
src/memory/models.py
src/memory/client.py
src/memory/db/schema.py
src/memory/db/migrations.py
src/memory/storage/store.py
src/memory/storage/identity.py
src/memory/storage/context_contract.py
src/memory/services/context_contract.py
src/memory/services/journey.py
src/memory/services/identity.py
src/memory/intelligence/reception.py
src/memory/intelligence/prompts.py
src/memory/skills/mirror.py
src/memory/cli/context.py
src/memory/__main__.py
src/memory/surfaces/
src/memory/web/server.py
src/memory/web/static/
tests/unit/
tests/integration/
evals/reception.py
evals/routing.py
docs/product/
docs/reference/
docs/project/roadmap/
docs/process/worklog.md
REFERENCE.md
```

## Refactoring boundary

Do not keep growing `_resolve_defaults()` into a monolithic policy function. Extract a resolver with typed inputs and outputs. `_resolve_defaults()` can become a compatibility adapter or disappear after callers migrate.

Do not place filesystem loading inside `JourneyService`. Use source-specific loaders coordinated by the context contract service.

Do not let web routes or runtime adapters parse contract JSON.

Do not regenerate persona descriptors as a side effect of contract resolution. Descriptor lifecycle is related but separate.

## Backward compatibility

- Journeys without contracts behave exactly as they do before the feature.
- Existing identity metadata keys remain valid.
- Existing explicit `--persona` and `--journey` flags retain behavior.
- Existing extension bindings continue to load.
- Existing runtime adapters do not need to understand contract schema.
- Existing production metadata keys named `default_persona` or `required_context_files` are not interpreted implicitly unless an explicit migration is approved.

## Documentation updates required in the implementation cycle

- product principles: journey continuity includes agreed working context;
- architecture: domain service, tables, resolution flow, context source boundary;
- runtime interface: core resolution and adapter behavior;
- Python API: contract and resolution methods;
- command reference: contract, proposal, resolve, and explain commands;
- decisions: persistence, precedence, confirmation boundary, v1 source types;
- roadmap and story artifacts;
- worklog;
- release notes if a release boundary is created.

## Release considerations

This feature changes prompts and routing behavior. Before release:

- run the relevant routing and reception evals before prompt changes for baseline;
- run them after changes;
- run `eval --all` or record the required waiver under current policy;
- rehearse database restore;
- validate all four runtime surfaces;
- inspect reception token and cost impact;
- provide a safe no-contract fallback;
- publish migration and rollback notes.
