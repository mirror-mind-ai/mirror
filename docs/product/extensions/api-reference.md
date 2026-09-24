# API Reference

This document specifies the contract between the mirror core and a
`command-skill` extension. The contract is composed of two things:

1. The shape of `skill.yaml`.
2. The two runtime protocols a manifest declares: `mirror-cli-v1` for a
   subcommand, and `mirror-context-v1` for a Mirror Mode context provider.

Everything outside this contract is considered an internal detail of the core
and may change. Anything documented here is stable and changes only with a
deprecation cycle.

Until CV22.DS10.TS2 there was a third part: a Python entrypoint,
`extension.py`, whose `register(api)` the core imported and handed an
`ExtensionAPI` object. That contract [retired](#retired-extensionpy-registerapi-and-extensionapi)
with the Python core.

## 1. The manifest — `skill.yaml`

```yaml
# Required fields
id: <slug>                  # lowercase, dash-separated; must match folder name
name: <human name>
category: extension
kind: command-skill         # or prompt-skill (see authoring-guide.md)
summary: <one-line summary>

# For command-skill
table_prefix: ext_<id>_     # must equal "ext_" + id + "_"; enforced at install
entrypoint:                 # OPTIONAL since CV22.DS10.TS5; checked only if declared
  module: extension         # filename without .py
  function: register        # default; can be omitted

# Required: at least one runtime entry
runtimes:
  pi:
    command_name: ext-<id>          # must start with "ext-"
    skill_file: SKILL.md
  claude:
    command_name: ext:<id>          # must start with "ext:"
    skill_file: SKILL.md
  # gemini, codex, etc. optional

# Optional: capabilities for Mirror Mode integration
mirror_context_providers:
  - id: <capability_id>             # lowercase, dash-separated, unique within extension
    description: <one-line description>
    suggested_personas: [<persona_id>, ...]  # hint only, never auto-binds
    provider_runtime:               # the process the core runs for this capability
      protocol: mirror-context-v1
      command: [node, context/<capability_id>.mjs]

# Optional: declared CLI subcommands. `name` and `summary` render the
# extension's listing; `runtime` is what makes the subcommand executable, in
# any language.
cli:
  subcommands:
    - name: <subcommand>
      summary: <one-line>
      runtime:                      # the process the core runs for this subcommand
        protocol: mirror-cli-v1
        command: [node, commands/<subcommand>.mjs]
```

### Validation rules

- `id` matches `^[a-z][a-z0-9-]*$`.
- `table_prefix` equals `"ext_" + id.replaceAll("-", "_") + "_"`.
- `kind` is one of `prompt-skill`, `command-skill`.
- For `command-skill`: `entrypoint` is optional. When declared,
  `entrypoint.module` must resolve to a `.py` file inside the extension folder
  (CV22.DS10.TS5, decision D10: the core has imported no entrypoint since
  CV22.DS10.TS2, so it no longer demands one, but a declared one is still
  validated as before).
- Each `runtimes.<name>.command_name` follows the runtime's convention
  (`ext:<...>` for Claude, `ext-<...>` for Pi).
- Each `mirror_context_providers[].id` is unique within the extension.
- `provider_runtime.protocol`, when present, is exactly `mirror-context-v1`.
- `provider_runtime.command` is a non-empty argv array. It is never interpreted by a shell;
  path-like arguments must remain inside the installed extension root.
- `cli.subcommands[].runtime`, when present, uses protocol `mirror-cli-v1` and the same
  argv rules as `provider_runtime.command`. It is read by the dispatcher rather than by
  the manifest validator, so a malformed declaration never invalidates the extension: that
  subcommand refuses, exactly as one that declares no runtime does.

Manifests that fail validation are rejected at install time and at every
subsequent load.

## 2. Context providers — `mirror-context-v1`

The core owns Mirror context binding selection and invokes each declared provider command
in deterministic binding order. The command runs with the installed extension root as CWD,
receives one JSON request on stdin, and must return one JSON object on stdout.

```json
{
  "protocol": "mirror-context-v1",
  "extension_id": "hello",
  "capability_id": "greeting",
  "extension_root": "/installed/extensions/hello",
  "table_prefix": "ext_hello_",
  "database_path": "/mirror/memory.db",
  "persona_id": "engineer",
  "journey_id": "mirror-ts-core",
  "user": "user",
  "query": null,
  "binding_kind": "journey",
  "binding_target": "mirror-ts-core"
}
```

| Field | Meaning |
|---|---|
| `persona_id` | the active persona, if any |
| `journey_id` | the active journey, if any |
| `user` | the active user (from `MIRROR_USER` / configuration) |
| `query` | the user's query, when available |
| `binding_kind` | `persona`, `journey`, or `global` |
| `binding_target` | the target id that triggered this call |

Providers may use any combination of these fields. They should never assume
all are populated; in particular, `query` and `journey_id` may be `null`.

Success response:

```json
{"protocol":"mirror-context-v1","text":"context to inject"}
```

Use `"text": null` to skip. Raw stdout must contain only this JSON result; write extension
diagnostics to stderr. The core never forwards raw provider stdout/stderr into operational
logs. Execution is no-shell, bounded to 60 seconds and 1 MiB of stdout per binding, and
sequential in stable binding order. Missing, malformed, timed-out, or failing providers are
skipped so Mirror Mode can continue.

The installed extension is trusted executable code. A process provider may open
`database_path`; extension authors remain responsible for the documented table-prefix
boundary. Prefer read-only context providers and short deterministic work.

A capability that declares no `provider_runtime` is **skipped**. The skip is soft and
reported: `mirror load` completes with every other section intact, and a
`no_provider_runtime` diagnostic names what went dark. One unmigrated capability never
costs the whole load, and it is never silently omitted either.

## 3. Subcommands — `mirror-cli-v1`

`mirror ext <id> <subcommand> [args...]` runs a subcommand that declares
`cli.subcommands[].runtime` **directly**: the declared argv runs without a shell, from the
installed extension root, with the user's argv appended verbatim and the user's stdin,
stdout, and stderr inherited. Its exit code is the command's exit code. Context arrives in
the environment, never on stdin:

| Variable | Value |
|---|---|
| `MIRROR_HOME` | the resolved mirror home |
| `MIRROR_DATABASE_PATH` | the database the core opened for this home and environment |
| `MIRROR_EXTENSION_ID` | the extension's id |
| `MIRROR_EXTENSION_ROOT` | the installed extension directory |
| `MIRROR_TABLE_PREFIX` | the extension's required table prefix |

A subcommand that declares no runtime — or whose declaration is malformed, which amounts to
the same thing — **refuses**. One line on stderr names the extension, the subcommand, and
the fix; stdout stays empty and the exit code is 1. Nothing is spawned.

Refusal is per SUBCOMMAND, so an extension may migrate one command at a time without
losing the others. A declared command receives all three of the user's streams, including
stdin.

The subcommand listing (`ext <id>`, `ext <id> --help`) is rendered from the manifest's
`cli.subcommands[]`, with unmigrated entries flagged `(no runtime declared)`. It therefore
describes what the manifest documents: a command that is not declared there does not
exist for the core.

### What the core still provides

A runtime process owns its own database access, embeddings, and LLM calls. The core keeps
the parts that have to be shared:

- **Migrations.** `migrations/NNN_<name>.sql` files, applied at install and by
  `mirror ext <id> migrate`, tracked in `_ext_migrations` with checksums — see
  [migrations.md](migrations.md).
- **Bindings.** `mirror ext <id> bind|unbind|bindings`, which decide when a context
  provider runs — see [binding-model.md](binding-model.md).
- **The table-prefix boundary**, enforced on migration SQL at install. A runtime process
  that opens `MIRROR_DATABASE_PATH` is trusted to keep writing under its own prefix.

## Retired: `extension.py`, `register(api)`, and `ExtensionAPI`

Until CV22.DS10.TS2 a command-skill shipped a Python module whose
`register(api)` the core imported, handing it an `ExtensionAPI` object with
prefix-checked database access (`execute`, `read`, `transaction`), `embed` and
`cosine`, an `llm` call through the core's router, `register_cli` and
`register_mirror_context`, and structured logging. Context providers received
a `ContextRequest` dataclass; failures surfaced as `ExtensionError` subclasses.

CV22.DS10.TS2 deleted the compatibility host that called `register(api)` on the
core's behalf, and CV22.DS10.TS5 deleted the Python core the API lived in. None
of it exists in this release. Its last state is readable at the
[`cv22-last-python-bearing`](https://github.com/mirror-mind-ai/mirror/blob/cv22-last-python-bearing/docs/product/extensions/api-reference.md)
tag, and the [cutoff](../../releases/pending-cutoffs.md#the-extension-compatibility-host-and-registerapi-as-a-core-served-contract)
gives the migration path: declare a runtime per capability, in any language.

### Journey projections — removed

Extension API `1.1` exposed `api.journey_projections.publish(...)` and
`.inspect(...)` over the `mirror.journey-projections@1.0` contract. **CV22.DS10.TS1
removed the capability**: the contract retired with the Python core, and Mirror no
longer publishes `.mirror/projections`. An extension that needs a durable read model of
Journey state owns it: a table under its own prefix, or files under its own directory. See
the release note for the cutoff.

## Versioning and stability

The Python API was versioned as `extension_api_version`. Version `1.1` added the
`journey_projections` façade; CV22.DS10.TS1 removed it, and the number was frozen at `1.1`
(decision D-018, CV22.DS10.TS2) because the API was not evolving — it was retiring. The
constant left with the Python core in CV22.DS10.TS5.

The contract an extension codes against is the **manifest runtime protocols**, which carry
their own names and their own compatibility story:

| | |
|---|---|
| `mirror-cli-v1` | one subcommand, declared on `cli.subcommands[].runtime` |
| `mirror-context-v1` | one context provider, declared on `mirror_context_providers[].provider_runtime` |

Both are language-neutral: an extension may own any executable runtime,
**Python included**. What ended is the core owning Python as every extension's
permanent compatibility layer. Backward-incompatible changes to a runtime protocol
increment its own version suffix (`mirror-cli-v2`).

A manifest may still carry `requires: extension_api: ...` from the Python era. The core no
longer reads it: compatibility is the protocol name each runtime declares.
