[< Refinement Campaign](index.md)

# RS001 — Engineer code-quality sweep

**Lens:** engineer · **CRs:** CR002–CR011 (10) · **Status:** complete

> *CV22 code quality sweep: readability, DRY, and coherence refactorings.*

## Framing

This was the origin of the campaign: a Navigator request to make the CV22 TS core
easier for a junior developer to read, DRY, easier to change/test/fix, coherent,
well-named, and idiomatic. The inspection covered `ts/src`, `ts/parity`, and
`ts/test`. The verdict was that quality was already **high** — `journeyOptions.ts`,
`detectPersona.ts`, and `pyJson.ts` were models — and most findings were the
front door growing faster than its structure during DS3/DS4.

Deliberately *not* flagged: subprocess-based CLI tests (realistic), fixture-load
casts in `golden.ts` (acceptable for committed fixtures), and cross-language
duplication inherent to a port.

## Change requests

### CR002 — Decompose the front-door `cli.ts` god module — `ab36356`
**Problem.** `cli.ts` was 362 lines mixing six concerns (argv parsing, DB-path
resolution, three render pipelines, write handlers, Python fallback, process
bootstrap). The renderers weren't exported (untestable), and a top-level
`process.exitCode = await main()` ran on import. **Resolution.** Extracted the
renderers into `frontDoor/render/` (`icons`, `identityRows`, `detectPersona`,
`journeys`, `memories`) as importable, unit-tested modules; `cli.ts` dropped to
277 lines. Guarded the entry (`import.meta.url === pathToFileURL(argv[1])`) so
the module is importable; removed a pointless dynamic import and a too-late
warning handler; fixed a latent `--db-path`-leaks-into-query bug. Held to
byte-identical output by the CR016 render goldens plus new pure-helper unit
tests. *(Argv and DB-path extraction had already landed with CR024.)*

### CR003 — Unify write handlers; typed `JourneyNotFoundError` — `aaf2b35`
**Problem.** `runIdentityWrite`/`runJourneyWrite` repeated a resolve → guard →
backup → open → try/finally skeleton, and a missing journey was signalled by
`error.message.startsWith("journey not found")`. **Resolution.** A shared
`withLiveWriteDb(argv, write)` captures the skeleton; `setProjectPath` throws a
typed `JourneyNotFoundError` (message unchanged) caught by `instanceof` —
coherent with `BackupGateError`/`CopyOnlyGuardError`/`SchemaStateError`. Written
in erasable form (no parameter properties) for node type-stripping.

### CR004 — Dedup journey grouping; drop the N+1 in `journeyRows` — `783805c`
**Problem.** The roots-then-children bucketing existed twice (sort + render), and
`journeyRows` issued 1 + 2N queries with an `as unknown as` double cast.
**Resolution.** One `groupJourneysByParent<T>` helper used by both; `journeyRows`
reads the `journey` and `journey_path` layers once each into key→content maps
(two queries) with an explicit row mapping.

### CR005 — Consolidate parity grading + verify scaffold — `091150a`
**Problem.** The real-DB grader built probe results four ways; ordered-id
equality was `JSON.stringify` in three places while `golden.ts` had
`orderedIdsMatch`; the search evaluator was misnamed; the two verify scripts
copy-pasted `argValue` + load/exit scaffold. **Resolution.** Every evaluator
routes through `toProbeResult`, which grades via `orderedIdsMatch`; renamed
`evaluateSearchProbes`; extracted `src/parity/verifyCli.ts`
(`parseVerifyArgs` + `loadFixture`). Verified by an end-to-end harness run.

### CR006 — Move parity decoders into the core — `3fab97b`
**Problem.** `blobToFloat32`/`parseUtcMs` lived under `src/parity/` but
`search/ranker.ts` (production core) imported them — a layering inversion.
**Resolution.** Moved to `src/db/decode.ts`; no `src/` module imports from
`parity/` anymore; decoder tests moved to `test/db/`, still proving byte-for-byte
parity.

### CR007 — Align DB-path precedence + `expandHome` with Python — `71ca41e`
*(same commit as CR024)* **Problem.** `DB_PATH` env precedence and the
`MIRROR_HOME`/`MIRROR_USER` conflict rule diverged from Python, and
`expandHome("~user/x")` produced garbage. **Resolution.** Ported the Python
precedence and conflict-raise; `expandHome` handles bare `~`, `~/x`, and passes
`~user` through; the one intentional divergence (CLI flags beat env) is
documented at the source.

### CR008 — Discriminated-union write fixtures; drop dead param — `77e7f51`
**Problem.** `WriteProbeFixture.probe_type` was `string` with optional payloads
validated at runtime; `WriteProbe.apply(db, frozenNowMs)` declared a param every
production factory ignored. **Resolution.** A discriminated union on `probe_type`
with the payload required per branch; `buildWriteProbe` is an exhaustive switch
(`assertNever` catches bad JSON); the dead `frozenNowMs` is removed. Verified by
an end-to-end write-parity harness run.

### CR009 — Extract shared test helpers — `645103f`
**Problem.** The identity DDL was copy-pasted across ~11 test files, the
`_migrations` seed across 6, the front-door spawn across 2 — drift risk.
**Resolution.** `test/helpers/identitySchema.ts` (`IDENTITY_DDL`,
`createIdentityTable`, `seedKnownMigrations`) and `test/helpers/frontDoor.ts`
(`spawnFrontDoor`); every duplicating file converted. *(Lifecycle backfilled
after commit — see the campaign index process notes.)*

### CR010 — Centralize Row decoding; dedup handle wrappers — `915a4aa`
**Problem.** `Row = Record<string, unknown>` pushed `as string` casts into every
consumer; the read-only and writable handles duplicated the same
row-normalization. **Resolution.** `db/rowDecode.ts`
(`requireString`/`optionalString`/`optionalNumber`, column-named throws) applied
across the read model and render mappers; a shared `readableStatement` backs both
handles.

### CR011 — Deliberate `index.ts` public surface; rename `pyIdentifiers` — `25bdcb0`
**Problem.** `index.ts` exported only the read surface and had drifted; the whole
DS4 write surface was absent. **Resolution.** Rebuilt `index.ts` as the
organized public API (read + write) with a policy header; renamed
`util/pyIdentifiers.ts` → `pyGenerators.ts` (it generates ids *and* timestamps).
Completing this closed RS001 (10/10).
