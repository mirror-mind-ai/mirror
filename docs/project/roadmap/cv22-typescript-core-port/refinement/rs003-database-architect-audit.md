[< Refinement Campaign](index.md)

# RS003 — Database-architect audit of the persistence seam

**Lens:** database-architect · **CRs:** CR018–CR023 (6) · **Status:** complete

> *Database-architect audit of the CV22 persistence seam (authored by the database-architect persona).*

## Framing

This lens owns what the *data* means: schema as contract, migration custody,
query plans, FTS integrity, retention, and the JSON-in-TEXT metadata contract.
The schema was in better shape than expected — every ported query is properly
indexed and FTS sync is trigger-based (the database-as-seam bet paying off) — but
the findings that were genuinely the DB architect's were about **custody and
recorded contracts**, which is why four of the six CRs are decision/roadmap work.
The expensive failures in persistence come from undecided custody, not bad
queries.

## Change requests

### CR018 — Schema-state guard at the TS seam — `9ff69c8`
**Problem.** The TS core ran SQL against a database whose migration state it never
checked, while the Python core keeps migrating (CV9 is active). **Resolution.**
`ts/src/db/schemaState.ts` asserts `_migrations` against a committed
`KNOWN_MIGRATION_IDS` snapshot before serving any route, failing loudly with the
exact pending/unknown migrations and the action to take. A Python-side pytest
locks the snapshot to `memory.db.migrations.MIGRATIONS`, so drift fails CI from
both directions.

### CR019 — Name schema custody transfer as a DS6 deliverable — `ad19096`
**Problem.** Everything that creates, migrates, and disciplines the database
(schema DDL, migration engine, `fcntl` bootstrap lock, WAL/busy-timeout/FK
pragmas) lives only in Python and dies with it — but DS6 never named the handover.
**Resolution.** The DS6 scope row, sequencing entry, and the collaboration
strategy now name it explicitly: TS must own bootstrap, migrations, locking, and
pragmas, proven over real legacy databases, **before** the Python core is deleted.
The schema guard's `KNOWN_MIGRATION_IDS` snapshot becomes the handover manifest.

### CR020 — Decide the DS5 access-count read strategy — `9172ee3`
**Problem.** Python computes reinforcement with a per-candidate `COUNT` (an N+1)
over the unboundedly growing `memory_access_log`. **Resolution.** Recorded the
rule *port semantics, not query plans* in [Decisions](../../../decisions.md): the TS
live-search path may use a single `GROUP BY memory_id` aggregate **iff** a parity
probe proves identical counts on a real-DB copy. The CV22 DS5 sequencing entry
points at the decision so the plan checkpoint inherits it.

### CR021 — FTS integrity posture — `8205ac4`
**Problem.** `memories_fts` is an external-content FTS5 index whose integrity
nothing ever checked, and whose update trigger fires on *every* `memories` row
change (write amplification). **Resolution.** Three slices: `ts/src/db/
ftsIntegrity.ts` runs FTS5's `integrity-check` after each write-parity probe (a
row-count comparison can't detect desync because external content mirrors the
content table's count); `runtime diagnose` gains a read-only MATCH-probe
corruption detector (a corrupt index raises on any MATCH), tested against a
fabricated-corrupt index; and a [Radar](../../index.md) entry scopes the
`UPDATE OF`-column trigger as post-CV22 schema work, now safe to make because
integrity is verified.

### CR022 — Put `memory_access_log` retention on the Radar — `fcb113d`
**Problem.** The highest-frequency insert table is appended on every retrieval,
read on every search, and never pruned in production. **Resolution.** A
[Radar](../../index.md) entry names the problem, the compaction sketch
(reinforcement needs only count + latest access per memory), and the interaction
with the DS5 read strategy — post-CV22 work under the no-behavior-change rule, now
on the roadmap instead of in memory.

### CR023 — Record the `identity.metadata` JSON contract — `6f33288`
**Problem.** The metadata contract is literally *the bytes Python's `json.dumps`
emits*, in two dialects, faithfully mimicked by `pyJson.ts` — right for the
transition, incoherent as a permanent contract. **Resolution.**
[Decisions](../../../decisions.md) states the mimicry's boundary: at DS6 the project
chooses a canonical serialization (explicit choice, not drift) and revisits
promoting `parent_journey` from JSON metadata to a real indexed column, both
gated on the CR019 custody transfer.
