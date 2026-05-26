[< Story](index.md)

# Plan — CV13.E5.S1 Operation registry and dry-run contract

## Implementation plan

1. Add a small `memory.web.operations` module that owns the allowlisted operation catalog.
2. Represent catalog entries as typed dataclasses or equivalent immutable structures with explicit serialization.
3. Model parameters declaratively with safe primitive field metadata instead of accepting arbitrary JSON schema from callers.
4. Add `GET /api/operations/catalog` to return the serialized catalog.
5. Seed the catalog with non-executing operation definitions for the first E5 candidates:
   - runtime health diagnosis,
   - database backup,
   - conversation journey repair,
   - conversation logger health,
   - batch conversation retitle.
6. Add focused unit tests for catalog shape, stable operation ids, dry-run metadata, parameter definitions, and endpoint behavior.
7. Stop before execution, jobs, audit persistence, streaming, or UI-heavy work.

## Design boundaries

- The registry is server-owned and static for this story.
- Request input cannot add, modify, or select arbitrary operations for execution because execution does not exist yet.
- Operation ids should be stable kebab-case strings that can become future route/job identifiers.
- Risk levels should be explicit and conservative, for example `read_only`, `writes_backup`, `writes_database`, or `external_llm`.
- Dry-run metadata should distinguish unsupported, supported, and required dry-run behavior.
- Parameter fields should expose only product-safe controls: string, integer, boolean, choice, optional/default, help text, and basic limits where needed.
- The catalog may include operations whose execution is `future` so the UI can explain the roadmap without implying runnable capability.

## Risks and mitigations

- Risk: the registry becomes a disguised generic command launcher. Mitigation: no command strings, no subprocess hooks, no user-provided executable path, no execution method in S1.
- Risk: parameter schemas become too abstract too early. Mitigation: keep the schema minimal and driven by known operations.
- Risk: exposing future operations confuses users. Mitigation: include execution availability/status in the catalog and use conservative copy.

## Verification approach

- Unit tests cover serialization and endpoint response.
- Existing web tests continue to pass.
- Static checks cover the new web module and tests.
- Manual validation calls the catalog endpoint and confirms it is read-only metadata, not execution.
