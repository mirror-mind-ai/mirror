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

Pending implementation and validation.
