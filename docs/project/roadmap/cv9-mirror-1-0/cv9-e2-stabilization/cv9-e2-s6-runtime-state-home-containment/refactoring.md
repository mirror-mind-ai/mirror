[< CV9.E2.S6](index.md)

# CV9.E2.S6 — Refactoring Notes and Deferred Items

## Deferred: `EXPORT_DIR` homes-root fallback

`config.EXPORT_DIR` still falls back to `~/.mirror-minds/exports` when no
mirror home is resolvable (consumer: `cli/transcript_export.py`). This is the
same containment class as this story, but no root-level `exports/` artifact
was observed in the wild, and widening scope would have touched the export
flow. Revisit when transcript export changes or if diagnose ever reports a
root `exports/` directory. The scan in `scan_homes_root_state` will surface
it if it appears (any non-hidden root-level file; add `exports` to
`_ROOT_RUNTIME_DIR_NAMES` when picking this up).

## Deferred: automatic relocation command

`runtime diagnose` detects `legacy_root_runtime_state`; relocation is a
documented manual route (REFERENCE.md). A `memory runtime relocate-root-state`
command with backup-first semantics is a candidate follow-up if manual
relocation proves error-prone for non-developer users.

## Observation: legacy `_ENV_DIRS` removal

The old `_DEFAULT_RUNTIME_DIR` / `_LOCAL_DIR` / `_ENV_DIRS` module globals
were removed entirely rather than kept as deprecated aliases — nothing in
`src/` or `tests/` referenced them. `DEFAULT_MEMORY_DIR` remains exported (it
still names the homes root for bootstrap-fallback and diagnose purposes).
