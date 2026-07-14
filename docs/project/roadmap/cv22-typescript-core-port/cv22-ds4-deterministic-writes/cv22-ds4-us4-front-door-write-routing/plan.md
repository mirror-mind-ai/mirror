# Plan — CV22.DS4.US4

## Objective

Open the **first sanctioned live-write path** in the TS front door and route the
`identity set` / `identity edit` commands to the TS core, so a real
`memory.db` identity write is answered by TS (not Python) with no user-visible
change. This proves the live-write front-door architecture on the simplest ported
write before extending it to journey writes.

## What the investigation found (load-bearing facts)

- **The copy guard forbids live TS writes.** `runTs` in `frontDoor/cli.ts` opens
  the DB **read-only**, and `openDatabaseCopyForWrite` runs `assertCopyTarget`,
  which throws on a real `memory.db`. That guard was the invariant that kept TS off
  the live database during DS4 parity. Routing writes therefore requires a **new,
  explicitly-named live-write seam** — this is the core of US4 and its main risk.
- **`id`/`now` were injected during parity; live routing must generate them.**
  Python uses `_uuid()` = `uuid.uuid4().hex[:8]` and `_now()` =
  `datetime.now(timezone.utc).isoformat().replace("+00:00","Z")` (microsecond ISO,
  `Z` suffix). The front door must generate the same shapes.
- **`identity set`/`edit` reuse the ported `setIdentity`.** Both `cmd_set` and
  `cmd_edit` call `set_identity(layer, key, content)` with `metadata=None` — exactly
  the inheritance path US3 ported and proved. So the write logic is already done and
  tested; US4 is the **live wiring**, not new write behavior.
- **Reinforcement is coupled to DS5.** `log_access`/`log_use` fire *inside* the
  Python search path (`intelligence/search.py`), not as a CLI command, so they
  cannot be front-door-routed until search moves to TS (DS5).

## Scope

- **Live-write seam** — add `openDatabaseForWrite(path)` to `db/database.ts`: opens
  the real `memory.db` writable, deliberately **not** copy-guarded, named to signal
  "this writes the live database." The copy guard stays the default for parity
  harnesses; this is the narrow, sanctioned exception.
- **Deterministic id/now helpers** — a small `util/pyIdentifiers.ts` (or similar):
  `newId()` = 8-char uuid4 hex, `nowIso()` = microsecond ISO-`Z`, matching Python.
- **Route `identity set`** — add it to `frontDoor/routing.ts` (engine `ts`), and a
  `cli.ts` handler that opens the live-write seam, resolves the metadata-None
  inheritance via the existing `setIdentity`, generates `id`/`now`, writes, and
  prints the same `✓ {layer}/{key} created|updated` line Python prints.
- **Backup-before-write safety** — the handler takes/verifies a backup before the
  first live write (reusing the existing backup mechanism), so a live write is never
  unguarded.

## Non-Goals

- **`identity edit` routing** — `identity edit` spawns `$EDITOR` interactively, so it
  is not a deterministic write; it stays on Python. (Refinement discovered during
  implementation — a narrowing from the approved `set`/`edit` to `set` only.)
- **Journey write routing** (`set-path` / `update` / stage-status) — the immediate
  fast-follow (**proposed CV22.DS4.US5**), reusing this same live-write seam.
- **Reinforcement write routing** (`log_access` / `log_use`) — deferred to **DS5**,
  because it fires inside the Python search path. DS4's done condition should be
  amended to record that reinforcement routing lands with DS5, not DS4.
- No new write behavior, schema change, or parity re-proof — `setIdentity` is
  already proven (US3).
- No external-API writes, memory creation, embeddings (DS5).

## Acceptance Behavior

```text
Given a real (dev) memory.db and an identity (layer, key) that does not yet exist
When `node frontDoor/cli.ts identity set <layer> <key> <content>` runs through the
     front door
Then the TS core writes the identity row to the live DB (generated id + now),
     prints the same success line Python prints, and a subsequent read shows the row
And running `identity set` again on that (layer, key) updates content + updated_at,
     preserves id + created_at, and inherits the stored metadata (metadata=None)
And every unported or mutating command still falls back to Python unchanged
```

## Validation Route

- **Automated:** routing unit tests (`identity set` → `ts`; `identity edit`, reads,
  journey writes, reinforcement → `python`); a `cli.ts` spawn write test against a
  DB copy asserting the resulting row (INSERT + update/inherit) and the empty-content
  guard; an `openDatabaseForWrite` backup-guard test; TS suite green;
  `tsc` / `biome` clean.
- **Navigator-visible (E2E):** on the **dev** runtime (never production), take a
  backup, then `identity set` a probe key through the front door and confirm the
  row via `identity get`; then `identity set` it again and confirm the update +
  inherited metadata; confirm an unported write still routes to Python.
- **E2E decision:** a real front-door write against a demo-DB copy / dev DB — a
  genuine (non-fixture) E2E, but scoped to a copy/dev database, never production.
  (Navigator to accept.)

## Implementation Contract

- TDD: routing table + `openDatabaseForWrite` guard first, then the `cli.ts`
  handler, then the demo-DB write test.
- Reuse `setIdentity` and the backup gate; do not duplicate write logic.
- Keep scoped to `CV22.DS4.US4` (identity `set` only); journey writes are a
  separate story.
- Use `uv run` for Python; `git add` only story-scoped files; descriptive English
  commit messages.

## Open Decisions (Navigator)

1. **Scope width.** Recommended: identity-first (this plan). Alternative: widen US4
   to also route journey writes now (one bigger story that collapses DS4's CLI-write
   routing). I recommend identity-first to de-risk the live-write seam on the
   simplest command.
2. **DS4 done-condition amendment.** Reinforcement routing must move to DS5. Approve
   amending DS4's done condition to say so, so DS4 can collapse once the CLI writes
   (identity + journey) are routed.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
