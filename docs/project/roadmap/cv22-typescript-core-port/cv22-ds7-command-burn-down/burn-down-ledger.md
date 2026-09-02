[< CV22.DS7 Command Burn-Down](index.md)

# CV22.DS7 — Burn-Down Ledger

The auditable denominator for the command burn-down. DS7's plan review made
this a blocking constraint (quality-assurance): *"the burn-down denominator
must be an explicit, tracked artifact so 'done = zero' is auditable, not
asserted."*

**Rules.** A command counts as burned down only when its `routing.ts` entry
sends it to TS **ungated** and its story's flip checklist was green. A command
behind an opt-in gate is **not** burned down — the gate means production still
reaches Python. Coverage is per subcommand/branch, not per top-level command.

**Denominator.** The 35 top-level `python -m memory <command>` entries, minus
the three explicitly owned by later Delivery Stories: `mcp` (DS9), `web`
(DS10), and `eval` (DS8, live provider). Working denominator: **32**.

---

## Family status

| Family | Commands | On TS | Owner | Status |
|--------|----------|------:|-------|--------|
| Read-only deterministic | `detect-persona`, `journeys`, `memories` (listing) | 3/3 | DS2 | ✅ done |
| Deterministic writes | `identity set`, `journey set-path` | (subcommands) | DS4 | ✅ done |
| External under replay | `memories --search`, `consult` | 1/1 (+`consult`) | DS5 | ✅ done |
| Identity/journey reads & writes | `identity`, `journey`, `seed`, `init`, `descriptor`, `list`, `inspect`, `conversations`, `recall` | 9/9† | DS7.US1 | ✅ done |
| Content & planning writes | `journal`, `tasks`, `week` | 3/3 | DS7.US2 | ✅ done |
| Memory cultivation | `consolidate`, `shadow` | 2/2 | DS7.US3 | ✅ done |
| mirror-mode orchestration | `mirror`, `mode` | 2/2 | DS7.US4 | ✅ done |
| Extension context runtime | (`ext`/`extensions` context path) | — | DS7.TS2 | ✅ done |
| **Extraction lifecycle (deterministic core)** | **`conversation-logger`** | **partial** | **DS7.US5** | 🔵 **7/15 subcommands flipped; pending validation** |
| Extraction lifecycle (composites & LLM tail) | `conversation-logger` remainder | 0/8 | DS7.US10 | 🟡 planned |
| Soul Mode | `soul` | 0/1 | DS7.US6 | 🟡 planned |
| Explorer Mode | `explore` | 0/1 | DS7.US7 | 🟡 planned |
| Builder/Ariad | `build` | 0/1 | DS7.US8 | 🟡 planned |
| Ops/utility tail | `backup`, `repair-encoding`, `extensions`, `ext`, `welcome`, `migrate-legacy`, `runtime`, `journey-projection` | 0/8 | DS7.TS1 | 🟡 planned |

Deferred to later Delivery Stories (excluded from the denominator): `mcp`
(DS9), `web` (DS10), `eval` (DS8).

† `conversations` counts as ported for its **listing read only**. Its `append`
subcommand (v0.31.13) is Python-owned and tracked under DS7.US5 slice B. A
family marked done can still grow subcommands on main — which is exactly how
the 2026-09-02 routing defect happened — so "done" here means "the subcommands
that existed when it was ported", not "every argv shape forever".

---

## `conversation-logger` — per-subcommand detail (DS7.US5)

The family has 15 subcommands. Slice A ports the seven that are deterministic
end to end; the rest reach `end_conversation`, whose extraction and close-time
metadata finalization run through the LLM, so they cannot flip on slice A
evidence.

| Subcommand | TS ported | Routed to TS | Blocker |
|------------|:---------:|:------------:|---------|
| `mute` | ✅ | ✅ flipped | — |
| `unmute` | ✅ | ✅ flipped | — |
| `status` | ✅ | ✅ flipped | — |
| `log-user` | ✅ | ✅ flipped | — |
| `log-assistant` | ✅ | ✅ flipped | — |
| `user-prompt` (hook) | ✅ | ✅ flipped | — |
| `discard-current` | ✅ | ✅ flipped | — |
| `switch` | skeleton only | ❌ | LLM close tail (slice C/D) |
| `session-end-pi` | skeleton only | ❌ | LLM close tail (slice C/D) |
| `session-end` (hook) | skeleton only | ❌ | LLM close tail (slice C/D) |
| `session-start` | ❌ | ❌ | slice D |
| `session-maintenance` | ❌ | ❌ | slice D |
| `diagnose-journeys` | ❌ | ❌ | slice E |
| `repair-journeys` | ❌ | ❌ | slice E (mutating repair) |
| `backfill-codex-session` | ❌ | ❌ | slice E |

**Ported: 7/15. Routed to TS: 7/15** — flipped 2026-09-02.

**Revert control:** `MIRROR_TS_CONVERSATION_LOGGER=0` sends the whole family
back to Python with no code change and no data migration. The gate was
inverted rather than deleted precisely so this write path keeps an operational
escape hatch.

### Slice A flip checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Slice goldens (state + stdout + edge cases) | ✅ |
| 2 | Real-DB-copy probe | ✅ `write_parity.py --probe conversation_logger`, hashes match |
| 3 | Hook-inclusive E2E smoke | ✅ byte-identical vs Python on a disposable home |
| 4 | Regression pass over flipped families | ✅ front-door suite 270 green |
| 5 | Redaction check | ✅ no argument payloads in `front-door.log` |
| 6 | Revertibility exercised | ✅ gate off reaches Python, no data migration |
| 7 | Burn-down ledger updated | ✅ this entry |

All seven were green before the flip, and re-verified after it: the E2E and the
kill-switch route were both exercised with the gate absent and with
`MIRROR_TS_CONVERSATION_LOGGER=0`, producing identical observable behavior on
either engine.

**Flipped 2026-09-02 on Navigator authorization.** The seven deterministic
subcommands now answer from TS by default.

---

## History

| Date | Change |
|------|--------|
| 2026-09-02 | Ledger created (DS7 QA constraint). `conversation-logger` slice A: 7/15 subcommands ported, 0 routed, checklist green, flip pending Navigator approval. |
| 2026-09-02 | **Slice A flipped.** `conversation-logger` 7/15 subcommands routed to TS by default; `MIRROR_TS_CONVERSATION_LOGGER=0` retained as the revert control. First DS7.US5 burn-down movement. |
| 2026-09-02 | **Routing defect fixed:** `conversations append` (v0.31.13) inherited DS7.US1's listing route, rendered a listing, exited 0, and silently discarded the caller's messages. Now pinned to Python until slice B wires its TS route. Subcommands of a claimed family must be allowlisted, never inherited. |
| 2026-09-02 | Slice B: `conversations append` ported to TS (`ts/src/conversation/append.ts`) and oracle-registered; **not routed**. |
| 2026-09-02 | Slice C: budgeted extraction driver ported with AI-05 spend-bound and CV9.E2.S7 isolation properties pinned; model call injected, not yet wired to the replay orchestration. |
| 2026-09-02 | **US5 re-scoped** (Navigator-authorized) to slices A–C; slices D–F moved to the new **CV22.DS7.US10**. DS7 denominator 11 → 12 stories. |
