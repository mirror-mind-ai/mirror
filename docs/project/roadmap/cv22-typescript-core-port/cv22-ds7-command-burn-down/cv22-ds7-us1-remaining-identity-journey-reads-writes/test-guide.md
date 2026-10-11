[< Story](index.md)

# Test Guide — CV22.DS7.US1 — Remaining identity/journey reads & writes

## Automated Validation (CI gate)

Coverage is **per subcommand/branch**, not per top-level command.

### Slice A — reads (committed synthetic goldens)
- `identity list` (all layers + `--layer` filter), `identity get` (hit + not-found exit 1).
- `journey status` (named slug + all-journeys; empty/populated memories & conversations).
- `list personas|journeys`; `inspect persona|extension|runtime-catalog` (found + not-found).
- `descriptor list`; `recall` (prefix hit, ambiguous/missing prefix); `conversations` `list_recent`.
- Assertion: rendered surface is **byte-exact** to the Python oracle (preview truncation, grouping, ordering).

### Slice B — writes (DS4 copy harness, backup-gated)
- `journey update`: content write parity on a copied DB; verb/stderr parity.
- `seed`: create/update/skip/`--force`/error-path goldens; persona & journey
  **metadata-JSON assembly byte-equal** to Python `json.dumps` key order; identity-write
  allowlist enforced; result summary parity.
- `init`: filesystem parity — copied tree structure + `{{user_name}}` substitution;
  refuses a non-empty identity root (parity with `FileExistsError`).
- All writes proven on copies only; pre-write backup gate asserted; **no real DB artifact committed**; evidence redacted by default.

### Slice C — riders
- `kebab_slug`: golden covering accents, `/` and `&`, collapsing runs, 80-char cap,
  empty→bare-code; registered in `ts/parity/oracle-baseline.json`.
- `parent_journey` atomic dual-write: JSON + column written in **one transaction**;
  a fault injected mid-write leaves **neither** JSON nor column updated (rollback);
  `resolveParentJourney` reads **column-first** at parity with the JSON-first oracle.

### Cross-cutting
- Redaction test per newly-routed command: front-door log never records argument
  payloads (`--content`, stdin).
- Determinism gate regenerates all new goldens; oracle-drift tripwire green for
  every ported Python oracle.

## E2E Decision

**Required** as a per-family front-door smoke before each routing flip (dogfood a
real invocation, confirm no user-visible change, then flip `routing.ts`). Navigator
may accept a narrower fixture-only route for the pure reads (Slice A).

## Navigator Validation

Expected observation, pass condition, fail condition (to be exercised at Validation):

- **Observation:** run each ported command through the front door against a demo/copied
  DB and compare to the Python oracle output.
- **Pass:** byte-exact rendered surface + identical DB state (writes) + `identity edit`,
  `descriptor generate`, and conversation-lifecycle writes still route to Python; each
  flip revertible with no data migration.
- **Fail:** any surface diff, any DB-state divergence, a non-revertible flip, a logged
  argument payload, or a non-atomic `parent_journey` write.

## Validation Evidence

**Slice A (deterministic reads) — complete.** All seven read families landed as
separate, independently-committed units, each with committed synthetic goldens
(CI-gated) and a live cross-check against the real Python oracle on a scratch
database (not committed) before being trusted:

- `identity list`/`identity get` — byte-identical incl. `--layer` filter and a
  not-found (exit 1, stderr) case.
- `descriptor list` — byte-identical for both the identity-driven "all layers"
  path and the direct `--layer` scan, including the orphaned-descriptor
  exclusion/inclusion divergence between the two paths.
- `list personas`/`list journeys` — byte-identical incl. `--verbose` and the
  120-char truncation + Portuguese-before-English heading precedence in the
  journey description extractor (a distinct implementation from the already-
  ported `journeys` command's extractor — see journey/journeyListing.ts).
- `inspect persona` — byte-identical for found and not-found (the not-found
  message goes to stdout, not stderr — a real, verified Python divergence from
  `identity get`, ported faithfully).
- `recall` — byte-identical incl. `--limit 0` (a verified Python slicing quirk:
  `-0 == 0`, so `--limit 0` returns the WHOLE history, not zero messages) and a
  not-found case.
- `conversations` (plain listing) — byte-identical incl. `--journey`/`--persona`
  filters; the ES-001 metadata-lifecycle/backfill flags correctly stay on
  Python fallback (not exercised by this story).
- `journey status` — byte-identical incl. a real external `sync_file` on disk,
  a broken `sync_file` path falling back to the DB `journey_path` row, a
  nonexistent journey slug (renders an empty-history block, not an error), and
  the verified `journey status` positional-parsing quirk (bare "status" with no
  following token becomes the literal slug "status", not "show every
  journey").

Grounding corrected the original candidate-table disposition twice during
implementation (both narrowings within already-stated Non-Goals, not scope
expansions): `inspect extension`/`inspect runtime-catalog` turned out to share
the extension-catalog machinery with `list extensions`/`all` and moved to the
TS1 ops-tail bucket; `list personas`/`list journeys` were split from `list
extensions`/`all` at the subcommand level.

**Slice B (deterministic writes) — complete.** All three writes landed as
separate, independently-committed units, validated on database copies/scratch
mirror-homes only — never live — with resulting DB state compared, not just
printed output:

- `journey update` — a thin wrapper reusing the already-ported `setIdentity`;
  verified stdout/stderr/exit AND the resulting `identity` row are
  byte-identical between a Python-copy and a TS-copy of the same source DB.
- `init` — filesystem-only bootstrap; verified with a real HOME override
  (never Vinícius's real home): printed output, the full copied file list, and
  `diff -r` byte-for-byte content across every file are identical. The
  already-existing-and-non-empty-destination error is Python's *uncaught*
  exception (a raw traceback with this machine's paths) — a deliberate,
  flagged divergence preserves the contract (exit 1, a stderr message) rather
  than fabricate a fake traceback.
- `seed` — the largest unit: added the `yaml` package (zero transitive deps,
  safe `parse()`) as a real new dependency, named explicitly. Verified on the
  **real repository templates** (`templates/identity/`, copied into isolated
  scratch mirror-homes): identical stdout (incl. a real "empty content" error
  neither side special-cased), identical row count and byte-identical
  content/version, and semantically-identical metadata (parsed structure, not
  raw bytes — canonical `JSON.stringify` per the already-decided DS6
  identity.metadata contract) across all 19 seeded rows, for both the initial
  create run and a `--force` re-run. Also verified live that `seed
  --mirror-home X --env test` still writes `memory.db`, not `memory_test.db`
  — a genuinely surprising, verified-not-assumed path-resolution divergence
  documented in `seedPaths.ts`.

**Slice C (riders) — complete.** Both riders landed as separate,
independently-committed units:

- `kebab_slug`/`strip_accents` — the first TS port of `src/memory/utils.py`
  (no prior TS slugifier existed). Registered as a tracked oracle
  (`oracle_drift.ORACLE_PATHS`, baseline regenerated via `--update`).
  Validated against a 19-case golden generated from the real Python oracle
  (`ts/parity/generate_slug_golden.py`) covering multi-script accents,
  empty-result, non-Latin script, and several 80-char cap boundary shapes
  (including a case engineered so the cut lands exactly on a hyphen) — all
  byte-identical, including the Unicode NFD/combining-mark equivalence
  between Python's `unicodedata` and V8's `\p{Mn}` property escape (verified,
  not assumed).
- `parent_journey` atomic dual-write — `createJourney` now writes the JSON
  metadata and the `identity.parent_journey` column in one `withTransaction`;
  `resolveParentJourney` flipped to column-first with a JSON fallback.
  Grounding found a real wiring gap (the shared `identityRows()` reader never
  selected the column, which would have made the flip a no-op for the
  already-shipped `journeys` command) and fixed it. No Python oracle exists
  for the column itself (`TS ⊇ Python`), so validation is TS-internal: a
  rollback test (a simulated pre-migration schema makes the second statement
  fail; the first statement's INSERT does not survive either), the flip's
  precedence tested directly, and a focused end-to-end test proving the write
  and the read genuinely agree through a real DB round-trip. A known, bounded
  limitation (the web-server-only `update_metadata_fields` path can still
  stale a previously-synced column) is recorded in `docs/project/decisions.md`,
  not silently absorbed.

**CV22.DS7.US1 — all three slices (A: 7 reads, B: 3 writes, C: 2 riders) are
now implemented and validated.** ~18 commits, `tsc --noEmit` clean, `biome
check` clean, oracle-drift clean, 487/487 TS tests passing.

**Navigator validation — accepted.** Vinícius ran the front door directly in
his terminal against his real identity (`~/.mirror-minds/vinicius-ts`), not a
fixture: `identity list`, `identity list --layer`, `identity get`, `journey`
(bare and by slug), `conversations`, `recall`, and `seed --env production`
(skip mode). One real gotcha surfaced and was fixed as part of this
validation: `uv run` auto-loads `.env` for the Python CLI, but plain `node`
does not, so `MIRROR_USER` from `.env` never reached the front door and the
first attempt failed with "Mirror home is not configured." Fixed with Node's
native `--env-file=.env` flag, baked into every front-door invocation across
all 8 Pi skills that call it (not just this story's 5 — also the CV22.DS3/DS4
ones, for consistency). After the fix, every command ran cleanly against real
data and matched the Python-era output Vinícius expected. His verdict: "It all
worked well. Validated."
