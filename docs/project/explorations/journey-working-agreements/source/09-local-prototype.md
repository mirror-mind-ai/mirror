# Local Prototype and Migration Notes

## Why this note exists

Before this general feature was framed, a machine-local workaround was created for two book journeys. That workaround is not the product design and must not be copied into Mirror Mind core as-is. It is useful as discovery evidence and as migration input.

## Local artifacts

Outside the Mirror source repository:

```text
/Users/alissonvale/.pi/agent/AGENTS.md
/Users/alissonvale/.mirror-minds/alisson-vale/local-routing/resolve_journey_writing.py
/Users/alissonvale/.mirror-minds/alisson-vale/local-routing/README.md
```

The Pi global context instructs an agent to call the local resolver for authorial book work. The resolver reads custom keys from journey identity metadata and returns an explicit persona plus required project files.

## Experimental metadata

The production database currently contains experimental journey metadata of this conceptual shape:

```json
{
  "default_persona": "escritora-ensaista",
  "required_context_files": [
    "docs/obra/voz.md",
    "docs/obra/rubrica-de-revisao.md"
  ]
}
```

Known journey mappings at the time of documentation:

```text
o-sentido-do-ser -> escritora-ensaista
livro-lideranca-soberana -> escritora
```

Both journeys reference their voice guide and editorial rubric under their configured `project_path`.

Persona routing descriptors for `escritora`, `escritora-ensaista`, `jornalista`, and `editor` were synchronized in the local database with their current metadata descriptions. Descriptor correction is valid independent of the workaround.

## What the prototype proves

- A journey-owned persona default reduces repeated instruction.
- Project-relative required files are sufficient to preserve distinct voices.
- Explicit task intent must outrank a journey default.
- Blog output and editorial diagnosis are cross-cutting task distinctions.
- A resolver can validate persona existence and safe project-relative files.
- Global runtime configuration is the wrong long-term authority.

## What the prototype does not prove

- that `default_persona` is a sufficient general model;
- that a global Pi instruction is portable across runtimes;
- that custom metadata is the right revisioned persistence shape;
- that contracts can be learned safely from conversation;
- that context resolution works in Builder, Explorer, or Soul Mode;
- that runtime behavior is explainable;
- that the approach survives concurrent sessions and contract revisions.

## Migration recommendation

Do not interpret unknown metadata automatically during schema migration. That could turn unrelated user keys into active policy.

Provide an explicit, previewable import command after the contract service exists:

```bash
uv run python -m memory context contract import-legacy-metadata <journey> --dry-run
uv run python -m memory context contract import-legacy-metadata <journey> --apply
```

The importer may translate:

```text
default_persona -> default profile persona
required_context_files -> default profile project_file sources
```

It cannot infer profile description, examples, mode scope, or distinctions such as authoring versus editorial diagnosis safely. The dry run must show a proposed initial contract and require confirmation.

## Decommission sequence

After the official feature ships and is validated against both book journeys:

1. Back up the production database.
2. Import or manually create official contracts.
3. Validate ordinary authoring, editorial diagnosis, blog adaptation, and journey switching.
4. Remove the Journey Context Contract section from the global Pi `AGENTS.md`, preserving any unrelated global instructions.
5. Archive or remove the local resolver directory.
6. Optionally remove experimental metadata keys after confirming the official contract is active.
7. Run the production runtime status and routing checks.
8. Create another backup.

Do not remove the workaround during feature implementation or migration development. Remove it only after user-visible validation proves the official path replaces it.

## Relevant backups

Backups created around the local workaround include:

```text
memory_20260814_160622.zip
memory_20260816_092319.zip
memory_20260816_092629.zip
```

Backup retention may remove old archives over time. The implementation session must create a fresh backup before touching production data and must never use the production database for automated tests.
