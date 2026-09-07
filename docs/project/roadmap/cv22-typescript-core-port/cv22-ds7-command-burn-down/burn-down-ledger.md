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
the five explicitly owned by later Delivery Stories: `mcp` (DS9), `web`
(DS10), `eval` (DS8, live provider), `runtime` (DS10 — its git-based
update/release half is redesigned under npm, not ported; TS1 ports the read
subcommands as branch coverage), and `migrate-legacy` (DS10 — retired with a
documented cutoff, not ported). Working denominator: **30** (32 until the
2026-09-07 decision; see History).

---

## Family status

| Family | Commands | On TS | Owner | Status |
|--------|----------|------:|-------|--------|
| Read-only deterministic | `detect-persona`, `journeys`, `memories` (listing) | 3/3 | DS2 | ✅ done |
| Deterministic writes | `identity set`, `journey set-path` | (subcommands) | DS4 | ✅ done |
| External under replay | `memories --search`, `consult` | 1/1 (+`consult`) | DS5 | ✅ done |
| Identity/journey reads & writes | `identity`, `journey`, `seed`, `init`, `descriptor`, `list`, `inspect`, `conversations`, `recall` | 9/9†‡ | DS7.US1 | ✅ done |
| Content & planning writes | `journal`, `tasks`, `week` | 3/3 | DS7.US2 | ✅ done |
| Memory cultivation | `consolidate`, `shadow` | 2/2 | DS7.US3 | ✅ done |
| mirror-mode orchestration | `mirror`, `mode` | 2/2 | DS7.US4 | ✅ done |
| Extension context runtime | (`ext`/`extensions` context path) | — | DS7.TS2 | ✅ done |
| **Extraction lifecycle (deterministic core)** | **`conversation-logger`** | **partial** | **DS7.US5** | ✅ **done — 7/15 subcommands flipped** |
| Extraction lifecycle (composites & LLM tail) | `conversation-logger` remainder | 8/8‡ | DS7.US10 | ✅ done (2026-09-07) — `repair-journeys --apply` route waits for TS1's `backup` |
| Soul Mode | `soul` | 0/1 | DS7.US6 | 🟡 planned |
| Explorer Mode | `explore` | 0/1 | DS7.US7 | 🟡 planned |
| Builder/Ariad | `build` | 0/1 | DS7.US8 | 🟡 planned |
| Ops/utility tail | `backup`, `repair-encoding`, `extensions`, `ext`, `welcome`, `journey-projection` (+ `runtime` reads§) | 0/6‡ | DS7.TS1 | 🟡 planned — sliced: 1 `backup`+`repair-encoding`; 2 `welcome`+`runtime` reads; 3 extension catalog+`journey-projection` |

Deferred to later Delivery Stories (excluded from the denominator): `mcp`
(DS9), `web` (DS10), `eval` (DS8), `runtime` (DS10, mutating half; reads are
TS1 branch coverage), `migrate-legacy` (DS10 retirement with cutoff).

† `conversations` covers its **listing read** (DS7.US1) and, since 2026-09-03,
`append` (DS7.US10 slice B′). A family marked done can still grow subcommands on
main — which is exactly how the 2026-09-02 routing defect happened — so "done"
here means "the subcommands that existed when it was ported", not "every argv
shape forever". `append` keeps its own explicit routing entry precisely so it
can never again be answered by inheritance.

‡ Branch residuals owed by TS1, not counted in the top-level numbers above: US1
deferred `list extensions|all` and
`inspect extension|runtime-catalog|llm-calls|embedding-provenance`
(`routing.ts` sends them to Python, bound to TS1), and US10 left
`repair-journeys --apply` on Python until TS1 ports `backup`. The family
counts are top-level commands; these branches are the per-branch remainder the
rule above requires to stay visible.

§ `runtime` is split by mutation (decision 2026-09-07). TS1 ports the read
subcommands `status|version|diagnose|latest|pending|release-notes` with
`welcome`, which imports them; Python's `diagnose` already misreports the
TS-owned schema (it flags the TS-authored `017_journey_parent_column` as
`core_migration_unknown`), so this is a live fix as well as burn-down. The
mutating subcommands `update|pull|stable|backup|release-doctor|release-promote`
are the git-based update/release workflow that npm distribution redesigns; DS10
owns them and they are not ported at parity. Because the ledger rule requires
an ungated TS route for the whole command, `runtime` leaves the denominator and
its reads are tracked here as branch coverage:

| `runtime` subcommand | Owner | TS ported | Routed to TS |
|----------------------|-------|:---------:|:------------:|
| `status`, `version`, `diagnose`, `latest`, `pending`, `release-notes` | TS1 slice 2 | — | — |
| `update`, `pull`, `stable`, `backup`, `release-doctor`, `release-promote` | DS10 (redesign under npm) | n/a | Python until DS10 |

Outside the denominator and retiring unported in DS10:
`memory-rehearse-migration` (`cli/migration_rehearsal.py`, a `pyproject.toml`
console script that rehearses the Python migration engine DS6 already retired
from custody; the 2026-04-17 open discussion is closed) and `migrate-legacy`
(Portuguese-era `travessia` → `journey` conversion; cutoff: such databases must
be migrated with a pre-DS10 release). `transcript-export` is **not** a command:
`cli/transcript_export.py` has no CLI entry, its only live consumer (the
transcript backfill's `parse_jsonl`/`_assistant_text`) was ported in US10, and
`export_transcript`/`export_last_turn` have no production caller — DS10 deletion
inventory, not TS1 scope.

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
| `switch` | ✅ | ✅ flipped (replay-gated) | — |
| `session-end-pi` | ✅ | ✅ flipped (replay-gated) | — |
| `session-end` (hook) | ✅ | ✅ flipped (replay-gated) | — |
| `session-start` | ✅ | ✅ flipped (`--fast` ungated; full run replay-gated) | — |
| `session-maintenance` | ✅ | ✅ flipped (replay-gated) | — |
| `diagnose-journeys` | ✅ | ✅ flipped | — |
| `repair-journeys` | ✅ | ✅ flipped (dry run) | `--apply` stays on Python until DS7.TS1 ports `backup` |
| `backfill-codex-session` | ✅ | ✅ flipped | — |

**Ported: 15/15. Routed to TS: 15/15** — slice A flipped 2026-09-02; US10
groups 1–3 flipped 2026-09-07 in the approved dependency order. The five
subcommands that cross the close tail answer from TS only under the replay
gate (unconfigured installs keep Python until DS8's live cutover), and
`repair-journeys --apply` is the one bounded exception: Python
gates the mutating repair behind the dated zip archive `backup` produces,
and the front door's fixed-name pre-write snapshot is a weaker property, so
the route waits for DS7.TS1 rather than trade safety for burn-down.

**Replay gate (US10):** the subcommands that cross the LLM close tail route
to TS only when `MIRROR_TS_EXTERNAL_ROUTES=1`,
`MIRROR_TS_CONVERSATION_LLM_REPLAY`, and
`MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY` are all set; an unconfigured
install keeps the Python fallback, so the live model call stays Python's
until DS8. Unsetting the replay config is a second, per-subcommand-family
revert for exactly those routes.

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
| 2026-09-02 | **CV22.DS7.US5 done.** Validation accepted by the Navigator; debt deferred with a revisit trigger; routing-inheritance audit captured as RS009/CR055. DS7 progress 5/12 → 6/12. |
| 2026-09-03 | **US10 slice C′ done.** Close-time metadata lifecycle engine, the three close-tail LLM surfaces with byte-exact assembled prompts, the replay prompt-digest assertion, and the close tail itself, graded as ordered call sequences. Prompt assembly retrofitted onto the DS5 surfaces (Navigator decision): TS had been sending a bare transcript with no system prompt, invisible under replay and a live-cutover defect for DS8. |
| 2026-09-03 | **US10 slice B′: `conversations append` flipped.** The US5 blocker is resolved — append idempotency is now value-semantics in both cores, so `1` and `1.0` are the same value and legacy rows replay instead of conflicting. Fixed in Python first, proven red-before-green on 3.10 and 3.12, contract text updated in the same commit. Seven-point checklist green, including a cross-core replay proof in both directions and legacy-byte tolerance. Revert control: `MIRROR_TS_CONVERSATION_APPEND=0`. |
| 2026-09-07 | **US10 slices D and E complete; nothing routed.** Session composites, diagnose/repair, the atomic session import (Python fixed first for the import-vs-hook race), the Pi/Codex backfills, the transcript assistant backfill TS never had, and the session-less `session-end` route are all ported and graded by state goldens. `conversation-logger` remains 7/15 routed; slice F flips begin next. Found on the way: `generateTitle` (US5) sliced by UTF-16 unit, not code point — fixed; and CI's determinism gate regenerated none of the US10 goldens — now all six. |
| 2026-09-07 | **Slice D generator was not hermetic.** The first CI run of the extended determinism gate showed `session-composite.golden.json` regenerating differently on Linux: `close_stale_orphans` runs the real extraction pipeline, whose summary embedding went live through the developer's `OPENROUTER_API_KEY` and quarantined in CI without one. The committed golden was correct but had been produced with network access. Generator now pops the key before import and stubs the embedding; golden byte-identical under 3.10 and 3.12 with no key. |
| 2026-09-07 | **US10 slice F, group 1 flipped: `switch`, `session-end-pi`, `session-end` route to TS under the replay gate.** Seven-point checklist: goldens green (1209 TS tests); the three new real-DB-copy write probes green (`close_tail`, `session_composites`, `journey_repair_apply` — plus the DS4 `journey` probe, found broken since DS6.US2 and repaired); the hook-inclusive lifecycle smoke green through the real front door (`ts/parity/conversation_lifecycle_smoke.ts`, 58 checks); read-side and write-side harnesses green over the already-flipped families; the front-door log carries no payloads and the ledger withholds bodies; `MIRROR_TS_CONVERSATION_LOGGER=0` exercised. `conversation-logger` 7/15 → 10/15. Every write probe and the smoke now run in the CI parity job. |
| 2026-09-07 | **US10 slice F, group 2 flipped: `diagnose-journeys`, `repair-journeys` (dry run), `backfill-codex-session` route to TS.** Deterministic, so no gate beyond the family switch. Checklist: journey-repair and backfill goldens green; `journey_repair_apply` probe green on the demo copy (dry run and `--apply` before/after); lifecycle smoke green with the three routes now on TS and `--apply` verified to stay on Python; redaction and revert exercised. `conversation-logger` 10/15 → 13/15. |
| 2026-09-07 | **US10 slice F, group 3 flipped: `session-start` and `session-maintenance` route to TS** (`--fast` ungated; the full run and maintenance under the replay gate). Checklist: session-composite golden green including the poison-pill accounting scenario; `session_composites` probe green on the demo copy (two orphans closed, one poisoned and carried over, one retitle, one extraction, fifteen ledger rows in order); lifecycle smoke green with every route now on TS and the maintenance re-run adding zero ledger rows; redaction and revert exercised. `conversation-logger` 13/15 → 15/15. The family's deterministic Python subcommands are at zero. |
| 2026-09-07 | **TS1 inventory reconciled** against `src/memory/__main__.py` dispatch and `routing.ts`. The DS7 index carried two stale lists (`conversation-logger` mute/switch — flipped in US5; `transcript-export` and `migration-rehearsal` — not top-level commands) and omitted `runtime` and `journey-projection`, which this ledger already counted. Index prose, candidate table, ledger, and the TS1 package now agree on the eight commands above plus the ‡ branch residuals. `runtime` flagged for an explicit port-or-DS10 decision (§); `memory-rehearse-migration` recorded as an out-of-denominator Python entry point needing an owner. US10 row status corrected to done. |
| 2026-09-07 | **TS1 decisions recorded; denominator 32 → 30.** `runtime` splits by mutation: reads (`status|version|diagnose|latest|pending|release-notes`) port in TS1 slice 2 with `welcome`; the git-based update/release half is DS10's to redesign under npm, not ported. `migrate-legacy` retires unported in DS10 with a documented cutoff; `memory-rehearse-migration` retires unported in DS10, closing its 2026-04-17 open discussion. TS1 is 0/6 and sliced (1 `backup`+`repair-encoding`, 2 `welcome`+`runtime` reads, 3 extension catalog+`journey-projection`); slices 1–2 pull before US6. Nothing routed or deleted today. |
