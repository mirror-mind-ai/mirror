# Extensions

Mirror Mind has a built-in capability to load and run **extensions**: external,
user-owned modules that add features to the mirror without modifying its core.
Finance tracking, customer testimonials, calendar integrations, content
pipelines — anything that is specific to a single user (or a small group) lives
as an extension, not in the core.

This directory documents **the extension system itself**. It does not document
any specific extension. Each extension carries its own documentation, in its
own repository, following the layout described in the [Authoring Guide](authoring-guide.md).

## Why extensions exist

Mirror Mind is a framework, not an application. The core gives every user the
same primitives: identity, journeys, memories, personas, attachments,
conversations. Anything beyond that — domain features, personal data models,
integrations with third-party systems — is the user's own concern. Putting
those features in the core would:

- mix personal code with framework code,
- bloat the runtime for users who do not need that feature,
- create implicit dependencies on data that not every user has,
- make the project harder to maintain over time.

Extensions solve this by giving users a stable contract to plug in their own
features while reusing the mirror's infrastructure (storage, embeddings, LLM
access, persona routing, Mirror Mode injection).

## Two kinds of extensions

The mirror supports two `kind`s of extensions, declared in `skill.yaml`:

- **`prompt-skill`** — the simplest form. A markdown file that instructs the
  agent how to orchestrate existing Mirror commands. No code, no schema, no
  state. Example: `examples/extensions/review-copy/`. Good for workflows that
  glue together existing capabilities.

- **`command-skill`** — extensions with state. They own SQLite tables (under a
  forced `ext_<id>_*` prefix), expose subcommands through
  `python -m memory ext <id> <subcommand>`, can register Mirror Mode context
  providers, and run their own SQL migrations. Example: a finance extension
  that tracks accounts, transactions, and runway.

This documentation focuses on `command-skill` because that is the more
involved contract. `prompt-skill` is covered briefly in the
[Authoring Guide](authoring-guide.md).

## What the mirror provides

When the mirror loads a `command-skill` extension, it offers a stable API:

- a shared SQLite connection (the same `memory.db` the rest of the system
  uses), restricted to the extension's table prefix for writes,
- read-only access to other tables (identity, journeys, memories, etc.),
- embedding generation (`text-embedding-3-small`),
- LLM access through the project's router,
- a way to register CLI subcommands,
- a way to register Mirror Mode context providers bound to a persona,
- a SQL migration runner with checksum tracking.

See the [API Reference](api-reference.md) for the full contract.

## Where extensions live

```
<extensions-root>/<id>/                # source (user repo, versioned)
~/.mirror-minds/<user>/extensions/<id>/      # installed (runtime copy)
~/.mirror-minds/<user>/memory.db             # shared database with ext_<id>_* tables
```

`<extensions-root>` is any directory the user chooses to host their
extension source trees. The mirror never ships extension source code.
Extensions are installed explicitly:

```bash
python -m memory extensions install <id> \
  --extensions-root <extensions-root>
```

The target mirror home is resolved from `MIRROR_HOME` or `MIRROR_USER`
in the active `.env` (or shell environment). Pass `--mirror-home <path>`
explicitly when working against a non-default home, otherwise omit it.

Installation copies the source tree, runs the extension's SQL migrations,
imports `extension.py`, and calls its `register(api)` entrypoint.

## Reading order

1. [Architecture](../architecture.md) — how the pieces fit together.
2. [Binding Model](binding-model.md) — how extensions connect to personas
   and journeys (this is the conceptually trickiest part).
3. [Journey-Bound Context](journey-bound-context.md) — how `journey -> project_path`
   and `extension capability -> journey` combine during Mirror Mode.
4. [API Reference](api-reference.md) — the full `ExtensionAPI` contract.
5. [Migrations](migrations.md) — SQL migrations contract.
6. [Authoring Guide](authoring-guide.md) — step-by-step authoring of a new
   extension, including the recommended documentation layout for the extension's
   own repository.
7. [Testing Guide](testing-guide.md) — how to test extensions.
8. [Roadmap](roadmap.md) — phased plan for the extension system.

User stories that drive the build of the system itself live under
[User Stories](user-stories/). User stories for individual extensions live
in each extension's own repository, not here.

## Design principles

- **The mirror does not know about specific extensions.** It loads whatever is
  installed. No hardcoded extension names anywhere in the core.
- **Extensions cannot reach into core internals.** They use `ExtensionAPI` and
  nothing else. The API may grow; internal modules are not part of the
  contract.
- **Schema isolation is enforced.** Writes outside `ext_<id>_*` raise
  `ExtensionPermissionError`. Reads outside the prefix go through a read-only
  view.
- **Failures in extensions never break the mirror.** Errors in extension
  callbacks are caught, logged, and skipped — the mirror keeps responding.
- **Avoid proper nouns in names.** CLI subcommands, table names, and
  identifiers describe the *capability*, not the brand or format. Banks,
  vendors, and file formats are parameters, not identity.
