# Roadmap

This roadmap covers the phased delivery of the **extension system itself** —
the infrastructure inside the mirror that lets extensions be authored,
installed, and run. It does not cover the roadmap of any specific extension;
those live in their own repositories.

## Phase 1 — Infrastructure of `command-skill`

**Goal.** A working `command-skill` contract: manifest validation, migrations
runner, loader, API, CLI dispatch, Mirror Mode hook, binding model. A fixture
extension proves the contract end to end.

**Scope.**

- `memory.extensions.api` — `ExtensionAPI`, `ContextRequest`, exceptions,
  `VERSION`.
- `memory.extensions.loader` — discover, validate, import, register.
- `memory.extensions.migrations` — runner, `_ext_migrations` table, prefix
  validation, checksums.
- `memory.extensions.context` — `_ext_bindings` table, dispatch from
  `IdentityService.load_mirror_context`.
- `memory.extensions.testing` — `api_for_test` helper.
- `memory.cli.ext` — top-level CLI dispatcher (`list`, `<id> <subcommand>`,
  `<id> bind`, `<id> unbind`, `<id> bindings`, `<id> migrate`).
- `memory.cli.extensions` — install/uninstall extended to run migrations
  and call `register`.
- Fixture extension `ext-hello` under `tests/extensions/fixtures/`.
- Tests in `tests/extensions/` covering: loader, validation, migrations
  runner (idempotent, checksum mismatch, prefix violation), API (write
  outside prefix rejected, read-only across all tables, transaction
  context), binding model (CRUD on `_ext_bindings`, dispatch from Mirror
  Mode), CLI dispatcher (list, help, error paths).
- Documentation in `docs/product/extensions/` (this directory).
- Update `AGENTS.md` with a short Extensions section.

**Out of scope for Phase 1.**

- `target_kind='global'` bindings (schema supports them, dispatch does
  not).
- Hot-reload of extensions inside a running process.
- A marketplace or registry of extensions.
- Sandboxing beyond the prefix check (extensions are trusted code).
- Performance work (caching of registered providers across processes).

**Acceptance criteria.**

- [ ] `python -m memory extensions install` runs migrations and `register`.
- [ ] `python -m memory ext hello ping` works end to end on the fixture.
- [ ] `python -m memory ext list` shows installed extensions and their
      registered subcommands.
- [ ] Binding/unbinding `hello.greeting` to a fixture persona works.
- [ ] Mirror Mode with that persona active injects the provider's text.
- [ ] All tests in `tests/extensions/` pass.
- [ ] CI is green on the post-implementation push.
- [ ] Documentation matches the implementation.

**User stories.**

- [`US-00-infra-de-command-skill`](user-stories/US-00-infra-de-command-skill.md).

## Phase 2 — Authoring quality of life

**Goal.** Smooth the rough edges discovered during Phase 1 and the first real
extensions.

**Candidate scope (subject to learnings from Phase 1).**

- `python -m memory ext <id> doctor` — diagnostics that check schema,
  migrations, bindings, and registered surfaces.
- Better error messages on manifest validation (line numbers, suggestions).
- Stricter parsing of migrations (full SQL AST, not regex).
- Optional schema dump command (`python -m memory ext <id> schema`).
- Tooling to scaffold a new extension (`python -m memory extensions new <id>`),
  emitting the recommended layout from
  [`authoring-guide.md`](authoring-guide.md).
- A reusable test rig (`memory.extensions.testing`) extended with helpers
  for seeding identity and journeys.

## Phase 3 — Cross-extension features (provisional)

**Goal.** Address needs that emerge from running multiple extensions in
parallel. Concrete shape is undefined; the items below are hypotheses.

- Read-only events bus so extensions can react to core events (conversation
  ended, memory created, journey state changed) without polling.
- Cross-extension reads with a stable contract (an extension declaring it
  publishes a view that others may consume).
- `target_kind='global'` bindings, gated by an opt-in flag.
- Cost accounting per extension (LLM and embedding calls attributed).

This phase is **not committed**. It will be planned only when Phase 2 ends
and we have concrete evidence of need.

## Phase 4 — Distribution (provisional)

**Goal.** Make sharing extensions feasible between users.

- A package format (zip with manifest + signature?).
- A simple installer for remote extensions (`extensions install --from <url>`).
- A vetting flow for community-shared extensions.

Out of scope unless and until at least two non-author users want to share
extensions.

## Stability and versioning

- `ExtensionAPI` version was `1.0` in Phase 1.
- Version `1.1` adds the backward-compatible Journey projection façade under CV23.
- A future major version is required if signatures become incompatible. We aim to avoid this.
- Deprecation cycles are at least one minor release with warnings before
  removal.

## Tracking

Implementation tracking lives in the project roadmap (`docs/project/roadmap/`).
The extension system is a candidate Epic under a future CV (Capability
Version); naming and slot to be decided when Phase 1 enters delivery.

## Open questions

- Should `register()` be allowed to be `async`? Probably not — adds
  complexity, no current need. Revisit if an extension wants to validate
  remote state at load time.
- Should the manifest declare an explicit list of CLI subcommands, or rely
  solely on `register_cli` at runtime? Phase 1 ships both: declaration is
  documentation, runtime registration is truth.
- Should we provide a way for extensions to declare hard schema
  dependencies on core tables (e.g., `journeys.id` foreign keys)? Phase 1
  says no — extensions reference core data by id, the core does not enforce
  the link. Revisit if data integrity bugs appear.
