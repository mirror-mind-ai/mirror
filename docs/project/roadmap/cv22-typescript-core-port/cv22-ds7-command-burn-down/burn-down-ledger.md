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
| Identity/journey reads & writes | `identity`, `journey`, `seed`, `init`, `descriptor`, `list`, `inspect`, `conversations`, `recall` | 9/9 | DS7.US1 | ✅ done |
| Content & planning writes | `journal`, `tasks`, `week` | 3/3 | DS7.US2 | ✅ done |
| Memory cultivation | `consolidate`, `shadow` | 2/2 | DS7.US3 | ✅ done |
| mirror-mode orchestration | `mirror`, `mode` | 2/2 | DS7.US4 | ✅ done |
| Extension context runtime | (`ext`/`extensions` context path) | — | DS7.TS2 | ✅ done |
| **Extraction lifecycle** | **`conversation-logger`** | **0/1** | **DS7.US5** | 🟡 **in progress — gated, not flipped** |
| Soul Mode | `soul` | 0/1 | DS7.US6 | 🟡 planned |
| Explorer Mode | `explore` | 0/1 | DS7.US7 | 🟡 planned |
| Builder/Ariad | `build` | 0/1 | DS7.US8 | 🟡 planned |
| Ops/utility tail | `backup`, `repair-encoding`, `extensions`, `ext`, `welcome`, `migrate-legacy`, `runtime`, `journey-projection` | 0/8 | DS7.TS1 | 🟡 planned |

Deferred to later Delivery Stories (excluded from the denominator): `mcp`
(DS9), `web` (DS10), `eval` (DS8).

---

## `conversation-logger` — per-subcommand detail (DS7.US5)

The family has 15 subcommands. Slice A ports the seven that are deterministic
end to end; the rest reach `end_conversation`, whose extraction and close-time
metadata finalization run through the LLM, so they cannot flip on slice A
evidence.

| Subcommand | TS ported | Routed to TS | Blocker |
|------------|:---------:|:------------:|---------|
| `mute` | ✅ | ⛔ gated | flip checklist |
| `unmute` | ✅ | ⛔ gated | flip checklist |
| `status` | ✅ | ⛔ gated | flip checklist |
| `log-user` | ✅ | ⛔ gated | flip checklist |
| `log-assistant` | ✅ | ⛔ gated | flip checklist |
| `user-prompt` (hook) | ✅ | ⛔ gated | flip checklist |
| `discard-current` | ✅ | ⛔ gated | flip checklist |
| `switch` | skeleton only | ❌ | LLM close tail (slice C/D) |
| `session-end-pi` | skeleton only | ❌ | LLM close tail (slice C/D) |
| `session-end` (hook) | skeleton only | ❌ | LLM close tail (slice C/D) |
| `session-start` | ❌ | ❌ | slice D |
| `session-maintenance` | ❌ | ❌ | slice D |
| `diagnose-journeys` | ❌ | ❌ | slice E |
| `repair-journeys` | ❌ | ❌ | slice E (mutating repair) |
| `backfill-codex-session` | ❌ | ❌ | slice E |

**Ported: 7/15. Routed to TS: 0/15** — the route is behind
`MIRROR_TS_CONVERSATION_LOGGER=1`, so production still reaches Python.

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

All seven are green. The flip itself — removing the
`MIRROR_TS_CONVERSATION_LOGGER` gate — remains a separate Navigator decision,
because it changes the engine answering the product's highest-volume write
path.

---

## History

| Date | Change |
|------|--------|
| 2026-09-02 | Ledger created (DS7 QA constraint). `conversation-logger` slice A: 7/15 subcommands ported, 0 routed, checklist green, flip pending Navigator approval. |
