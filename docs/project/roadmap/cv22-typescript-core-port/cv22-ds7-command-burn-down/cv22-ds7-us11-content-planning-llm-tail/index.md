[< Parent](../index.md)

# CV22.DS7.US11 — Content & planning LLM tail

**Status:** 🟡 Planned — authored, not pulled
**Type:** User Story
**Created by:** [CR068](../../../../refinement/rs009-cv22-front-door-routing-correctness/cr068-stop-reporting-unported-llm-gated-leaves-as-burned-down.md) (2026-09-09)
**Depends on:** [CV22.DS7.US2](../cv22-ds7-us2-content-planning-writes/index.md) (done) for
`tasks add` and the `week view` read; [CV22.DS5](../../cv22-ds5-external-api-commands/index.md)
(done) for the replay-safe `LlmProvider`/`EmbeddingProvider` and the `llm_calls` ledger;
[CV22.DS7.US10](../cv22-ds7-us10-extraction-lifecycle-session-composites/index.md) (done)
for `conversation/metadataLifecycle.ts`

---

## Why This Story Exists

US2 ported the deterministic core of the content and planning family and, in its own
prose, sent the three leaves that cross the LLM or embedding seam to US5. US5 was then
re-scoped to the `conversation-logger` deterministic core, its LLM tail moved to US10,
and neither story named `journal`, `week plan`, or `week save`. The ledger kept the
family at `3/3 done` for a week. CR068 found it; this story is the disposition.

It has the same shape as US5 → US10: a deterministic core story spawns the story that
owns its LLM tail. Reading the routing table for the correction found two more leaves
of the same class with no owner, which this story also takes.

## Outcome

`journal`, `week plan`, `week save`, and `descriptor generate` are answered by the
TypeScript core with rendered-output and database-state parity to Python. `week save`
flips **ungated** — it is deterministic. The three LLM-crossing leaves route to TS under
the replay transport and go live with DS8, exactly as `soul harvest save` and the
`conversation-logger` close tail do. The ES-001 `conversations` metadata-lifecycle CLI
faces are wired to the engine US10 already ported, so the operator's dry-run and
preview stop answering from Python.

## Leaf Inventory

| Leaf | Python entry | Seam | TS state today | Flip |
|------|--------------|------|----------------|------|
| `journal <text> [--journey]` | `cli/journal.py` (54 lines) → `MemoryService.add_journal` | `classify_journal_entry` (LLM, role `journal_classification`) → `add_memory` (embedding) | no module | replay-gated until DS8 |
| `week plan <text>` | `cli/week.py:cmd_plan` → `TaskService.ingest_week_plan` | `extract_week_plan` (LLM, role `week_plan`) → `find_tasks_by_title` similarity → pending JSON file | no module | replay-gated until DS8 |
| `week save` | `cli/week.py:cmd_save` → `TaskService.save_week_items` | **none** — reads the pending file, `add_task` per item, unlinks the file | `tasks add` already on TS | **ungated** |
| `descriptor generate` | `cli/descriptor.py` → `generate_descriptor` | one LLM call | `descriptor list` on TS (US1) | replay-gated until DS8 |
| `conversations --metadata-lifecycle-dry-run\|-demo\|-preview-at-message\|-apply` | `cli/conversations.py` | none — the engine is deterministic | engine in `conversation/metadataLifecycle.ts` (US10); flags unwired | ungated |

**Not this story:** `conversations --metadata-backfill-preview|-apply` — a one-shot
backfill of pre-ES-001 rows, retired in DS10 with the other one-shot tools (decision
2026-09-09). The Plan must confirm from the code that the backfill flags share no
routing entry with the lifecycle faces, so retiring one cannot orphan the other.

## Seam Boundaries

| Boundary | US11 owns | US11 does not own |
|---|---|---|
| **DS8 live provider** | Orchestration and database work for the three LLM leaves behind the replay `LlmProvider`/`EmbeddingProvider`, with prompt digests pinned per role | The live call. Routing flips to `ts` under the replay gate; DS8 flips it live |
| **`week` pending file** | The file contract between `plan` and `save` — path, JSON shape, unlink-on-save — proven byte-identical so a `plan` on one engine can be `save`d on the other during the transition | — |
| **Injection fences** | `classify_journal_entry` runs under the CV9.E2.S25 journal fence; the port carries the fence and its CI-enforced guard, not just the prompt | Redesigning the fence |
| **Identity-write allowlist** | `journal` writes a `journal`-type memory in a classified layer (`self`/`ego`/`shadow`); the CV9.E2.S23/AI-24 layer allowlist applies to the TS write | — |
| **`llm_calls` ledger** | Rows written with the same `role` names Python uses (`journal_classification`, `week_plan`, the descriptor role) so the ledger agrees across engines | — |

## Open Decisions For Plan Review

- **D1 — `descriptor generate` port or retire.** No skill or hook calls it and the live
  ledger has no row for its role. It is small; porting is cheap. But if the Navigator
  says nobody uses it, retiring it in DS10 is cheaper than proving parity on a prompt
  nobody runs. Default: port, because the cost is an afternoon and retirement of a
  documented command needs its own cutoff notice.
- **D2 — `week plan` similarity check parity.** `find_tasks_by_title(item.title[:20])`
  is a `LIKE` query; the TS side must reproduce the same prefix semantics by code point,
  not UTF-16 unit (the `generateTitle` class of defect US10 found).

## Required Implementation Evidence

1. Goldens for `week save` (pending file → tasks rows → file unlinked) and for the
   four lifecycle CLI faces, generated from Python, byte-identical under 3.10 and 3.12.
2. Replay goldens for `journal`, `week plan`, and `descriptor generate` with per-role
   prompt digests pinned, so a drifted prompt fails in CI rather than at DS8.
3. Real-DB-copy write probes: `journal` (memory row + embedding row + `llm_calls` rows),
   `week save` (tasks rows), on the demo copy.
4. The cross-engine pending-file proof: Python `week plan` → TS `week save`, and the
   reverse.
5. Fence parity: the CV9.E2.S25 journal probe passes against the TS prompt assembly.
6. Two-level routing: `week` allowlists `view|plan|save` by name; `conversations`
   allowlists the four lifecycle flags by name and refuses the backfill flags by name.
7. Front-door redaction: `journal`'s argument *is* identity text — the log carries
   command and engine only.
8. The `mm-journal` and `mm-week` skill copies enter the front door (CR072 lands first;
   this story only has to not regress it).
9. Oracle registration for `cli/journal.py`, `cli/week.py`, `cli/descriptor.py`, and
   the `services/tasks.py` functions; generators in the determinism gate.

## Revert Contract

`MIRROR_TS_JOURNAL=0` and `MIRROR_TS_WEEK=0` return each command to Python with no code
change and no data migration; the replay gate is the second, per-leaf revert for the
LLM leaves, as elsewhere. `descriptor generate` follows `MIRROR_TS_DESCRIPTOR`.

## Done Condition

- `week save` and the four lifecycle faces answer from TS ungated; `journal`,
  `week plan`, `descriptor generate` answer from TS under the replay gate, flip checklist
  green, ledger's Content & planning row at 13/13 ported.
- The ledger's Remainder table has no US11 rows.
- The `routing.ts` reason for `week` no longer says "LLM-gated" for `save`.
- D1 resolved and recorded.

## Out Of Scope

- The live LLM/embedding call (DS8).
- Retiring the backfill flags (DS10).
- Any change to journal classification, week extraction prompts, or the pending-file
  UX. Parity, not redesign.
