[< Story](index.md)

# Plan — CV22.DS7.US11 — Content & planning LLM tail

**Status:** drafted 2026-09-09 — awaiting multi-persona Plan review, then Navigator approval
**Driver:** the Mirror (engineer persona) · **Navigator:** Vinícius

## Objective

Move the four leaves US2 left behind — `journal`, `week plan`, `week save`,
`descriptor generate` — and the four ES-001 metadata-lifecycle CLI faces of
`conversations` onto the TypeScript core with rendered-output and
database-state parity to Python, so that after this story the only Python
answering a content, planning, or lifecycle command does so behind the DS8
replay gate, and the ledger's Remainder table has no US11 rows.

This is the last DS7 story before DS8. It exists so DS8 flips every remaining
replay-gated leaf in one review.

## Terrain (facts, read before planning)

Read from the code on 2026-09-09; every claim below has a file behind it.

| Leaf | Python entry | What it does | Seam | TS today |
|---|---|---|---|---|
| `journal <text…> [--journey]` | `cli/journal.py` (54 lines) → `MemoryService.add_journal` | joins argv, refuses empty; `classify_journal_entry` (LLM, `temperature=0.3`, role `journal_classification`) → title/layer/tags with **AI-24 layer coercion to `ego`** when the model returns a layer outside `VALID_MEMORY_LAYERS`; then `add_memory` (embedding); prints a 5–6 line receipt with the layer label and the 8-char id | 1 LLM + 1 embedding | none |
| `week plan <text>` | `cli/week.py:cmd_plan` → `TaskService.ingest_week_plan` | collects every `journey` identity as `{slug, description[:200]}` context; `extract_week_plan` builds its prompt with **`datetime.now()`** (today + weekday); per item, `find_tasks_by_title(title[:20])` filtered to same `due_date` and status ≠ done → `warning`; writes `tempfile.gettempdir()/mm_week_pending.json`; prints a JSON report | 1 LLM, clock-dependent prompt | none |
| `week save` | `cli/week.py:cmd_save` → `TaskService.save_week_items` | reads the pending file, `ExtractedWeekItem(**p)` each, `add_task(source="week_plan")`, unlinks the file, prints `✅ N items saved:` + one line per task with `HH:MM` or `(time_hint)` and `[journey]` | **none** | `add_task` ported (US2) |
| `descriptor generate [--layer --key]` | `cli/descriptor.py:_cmd_generate` | selects identity rows (one or all); per target `generate_descriptor(content, layer, key)` (LLM, **no `on_llm_call`** → no `llm_calls` row, unlike every other role); `store.upsert_descriptor`; prints progress lines and `N/M descriptors generated.` | 1 LLM per target | `descriptor list` ported (US1) |
| `conversations --metadata-lifecycle-dry-run <id>` | `cli/conversations.py` | `dry_run_metadata_lifecycle` → JSON | none | engine in `conversation/metadataLifecycle.ts` (US10); CLI face unwired |
| `conversations --metadata-lifecycle-demo` | same | `_metadata_lifecycle_demo_report()` → JSON | none | same |
| `conversations --metadata-lifecycle-preview-at-message <id> …` | same | `dry_run_metadata_lifecycle_at_message` → JSON | none | same |
| `conversations --metadata-lifecycle-apply <id> [--title --summary --tags]` | same | `apply_metadata_lifecycle` with Navigator-supplied values → write → JSON | none | same |

**Not this story, refused by name:** `--metadata-backfill-preview|-apply` (DS10
retirement, decision 2026-09-09). The Plan confirms from `routing.ts` that the
six `CONVERSATIONS_LIFECYCLE_FLAGS` are matched individually, so splitting four
from two is a routing edit, not a parser change.

**Prompt facts that shape the goldens.** `JOURNAL_CLASSIFICATION_PROMPT`,
`WEEK_PLAN_PROMPT`, `DESCRIPTOR_PROMPT` live in `intelligence/prompts.py`.
US10 established the pattern: the TS side assembles the *same bytes* and the
replay fixture pins a per-role SHA-256 (`promptDigests`) so a drifted prompt
fails deterministically in CI rather than at DS8 against real users. `week
plan`'s prompt embeds the clock, so its generator freezes `datetime.now()` and
the TS assembly takes an injected `now`.

**Fence facts.** CV9.E2.S25 fenced journal classification and title/tags;
CV9.E2.S23/AI-24 added the layer allowlist. The fence lives in the prompt
template and the coercion lives in `classify_journal_entry`. Both port: the
template byte-exact (digest-pinned) and the coercion as logic with its own
test. The S25 probe is an `eval`, live-only; it is not CI and not this story's
to run, but the assembled TS prompt must be byte-identical to the one the
probe measured.

**Routing facts.** `week` allowlists `view` and refuses `plan|save` with a
reason that is **wrong for `save`** ("LLM-gated"). `journal` falls to the
default "not ported". `descriptor generate` is refused by name. The four
lifecycle flags are refused as a group with the backfill flags.

**Skill facts** (verified 2026-09-09 after CR072). `mm-week` already invokes
the front door for `week plan` and `week save` in all three copies; the front
door falls back to Python for both today, so flipping their routes changes the
engine with **no skill edit**. `mm-journal` still invokes Python directly, by
`PYTHON_ALLOWLIST` entry (`journal` → US11); this story removes the entry and
rewrites the three copies in its flip commit, and the CR071/CR072 checker holds
them together.

**Parser facts.** All four Python parsers (`journal`, `week`, `descriptor`,
`conversations`) accept `--mirror-home`, so — unlike Soul and Explorer — this
story introduces no accepted `--mirror-home` superset.

**Stop-condition 3 pre-verified:** `services/conversation.py:
apply_metadata_lifecycle` makes no model, embedding, or classification call.
The `apply` face is deterministic and ships ungated.

## Scope

Six plateaus, dependency-ordered, each a resumable state with a written
handoff. Nothing routes by default until plateau 6.

### Plateau 1 — `week save` and the pending-file contract (deterministic, ungated)

1. `ts/src/planning/weekPending.ts`: the pending-file contract — path
   (`os.tmpdir()/mm_week_pending.json`, matching `tempfile.gettempdir()`),
   the JSON shape, read → `ExtractedWeekItem[]`, unlink-on-save.
2. `ts/src/planning/weekSave.ts`: `save_week_items` over the ported `addTask`,
   `source: "week_plan"`, and the rendered receipt (`HH:MM` from
   `scheduled_at`, `(time_hint)` fallback, `[journey]` suffix, the `○` glyph and
   backticked id).
3. Golden: `generate_week_save_golden.py` — pending files covering
   `scheduled_at`, `time_hint`, neither, with/without journey, an unparseable
   `scheduled_at` (Python's `except ValueError` path), and the no-pending-file
   path. Grades stdout + `tasks` rows + file removed.
4. **The cross-engine pending-file proof** (index evidence #4): Python
   `week plan` output → TS `week save`, and TS-written pending → Python
   `week save`, on a copy. This is what makes a half-flipped `week` safe
   during the transition.
5. Routing: `week save` → TS under `MIRROR_TS_WEEK` (default **off** until
   plateau 6); refusal reason for `plan` corrected to say what is true.

### Plateau 2 — provider roles and prompt assembly (no routing)

6. `LlmRole` gains `journal_classification`, `week_plan`, `descriptor`. Role
   names match Python's `build_llm_logger` roles so the `llm_calls` ledger
   agrees across engines — **except `descriptor`, which Python does not ledger
   at all.** Parity means TS does not ledger it either; recorded as a known
   Python gap for DS8's plan, not fixed here.
7. `ts/src/planning/prompts/`: the three templates vendored byte-exact from
   `intelligence/prompts.py` (the Soul pattern), with assembly functions
   `assembleJournalPrompt(content)`, `assembleWeekPlanPrompt(text, journeys,
   now)`, `assembleDescriptorPrompt(content, layer, key)`.
8. `generate_prompt_assembly_golden.py` extended (US10's generator) with the
   three roles; digests pinned. `week_plan`'s generator freezes the clock.

### Plateau 3 — `journal` (replay-gated)

9. `ts/src/planning/journal.ts`: argv join, empty refusal (exit 1, Python's
   message), `classifyJournalEntry` behind `LlmProvider` with `_parse_json_
   response` parity (the non-dict fallback `{title: content[:60], layer:
   "ego", tags: []}` — **by code point**, the `generateTitle` lesson), AI-24
   coercion, then the ported `addMemory` path with embedding; the receipt
   with layer labels `Self (identity)` / `Ego (operational)` / `Shadow
   (tension)` and the raw layer for anything else.
10. Golden: `generate_journal_golden.py` under replay — a well-formed
    response, an invalid-layer response (coerced), a non-JSON response
    (fallback), tags as a non-list, the `--journey` line present/absent,
    empty input refused. Grades stdout, the `memories` row, the embedding
    row, and the two `llm_calls` rows.
11. Real-DB-copy write probe `journal` on the demo copy.
12. Routing: `journal` → TS when `MIRROR_TS_JOURNAL` and the replay config
    (`MIRROR_TS_EXTERNAL_ROUTES=1` + `MIRROR_TS_JOURNAL_LLM_REPLAY` +
    `MIRROR_TS_JOURNAL_EMBEDDING_REPLAY`) are set; Python otherwise. Same
    convention as `soul harvest save`.

### Plateau 4 — `week plan` (replay-gated)

13. `ts/src/planning/weekPlan.ts`: journey context (every `journey` identity,
    `content[:200]` **by code point**), the frozen-`now` prompt, `extract_week_
    plan` parsing parity (`ExtractedWeekItem` shape; drop/coerce rules exactly
    as Python), the similarity check — `find_tasks_by_title(title[:20])` is a
    `LIKE` prefix query; port the SQL, not a reimplementation — the
    same-`due_date`-not-done filter, the pending-file write, the JSON report
    with `pending_file` path.
14. Golden: `generate_week_plan_golden.py` under replay with the clock frozen —
    no items, items with/without similar existing tasks, a similar task that is
    done (must not warn), a similar task on a different date (must not warn),
    a 21+-char title (prefix boundary), a non-ASCII title (code-point slicing).
    Grades stdout + the pending file bytes + `llm_calls` row.
15. Routing: `week plan` → TS under `MIRROR_TS_WEEK` + replay config.

### Plateau 5 — `descriptor generate` and the four lifecycle faces

16. `ts/src/identity/descriptorGenerate.ts`: target selection (one or all,
    the `No identity found` and `No entities found` paths), per-target LLM call
    behind `LlmProvider`, `upsert_descriptor` parity, the progress lines with
    the 80-char preview (**by code point**) and `skipped (empty response)`, the
    `N/M` summary. No `llm_calls` row, matching Python (item 6).
17. Golden under replay: one target, all targets, an empty response, a missing
    identity. Grades stdout + the descriptor rows.
18. `ts/src/frontDoor/conversationsLifecycleRoute.ts`: the four faces over the
    existing `metadataLifecycle.ts` engine — `dry-run`, `demo`,
    `preview-at-message`, `apply` (with `--title/--summary/--tags`) — JSON
    output byte-exact (`ensure_ascii=False, indent=2` → the TS serializer must
    match key order and spacing; US10 solved this for the close tail).
19. Golden: `generate_conversations_lifecycle_golden.py` — each face on a
    seeded conversation, plus `apply` proven on a copy.
20. Routing: `descriptor generate` → TS under `MIRROR_TS_DESCRIPTOR` + replay;
    the four lifecycle flags → TS under `MIRROR_TS_CONVERSATIONS_LIFECYCLE`
    (deterministic, no replay), with the two backfill flags **refused by name**
    with a reason naming DS10.

### Plateau 6 — the flip

21. Gates default **on**: `MIRROR_TS_WEEK`, `MIRROR_TS_JOURNAL`,
    `MIRROR_TS_DESCRIPTOR`, `MIRROR_TS_CONVERSATIONS_LIFECYCLE`; `=0` reverts
    each independently. The three LLM leaves stay replay-gated on top (DS8).
22. Lifecycle smoke extended: `week plan` (replay) → `week save` → `tasks
    list` shows the items; `journal` (replay) → `memories` shows it; each
    lifecycle face on a seeded conversation; `descriptor generate` (replay) →
    `descriptor list`. Run with **no gate in the environment**.
23. `PYTHON_ALLOWLIST`: remove `journal`. `mm-journal` copies rewritten to the
    front door (three copies; the CR071 checker holds them together).
24. Oracle tripwire: `cli/journal.py`, `cli/descriptor.py`,
    `cli/conversations.py`, `intelligence/prompts.py` registered (`cli/week.py`
    and `services/tasks.py` already are). Generators in the determinism gate.
25. Ledger: Content & planning row → 13/13 ported, per-leaf table updated,
    `descriptor` and ES-001 residuals closed in the ‡ note, Remainder rows for
    US11 removed, History entry. DS7 index row → Done.

## Non-Goals

- **No live provider call.** Every LLM leaf routes to TS only under replay;
  an unconfigured install keeps Python. Live is DS8.
- **No change to any prompt, classification rule, extraction rule, or the
  pending-file UX.** Parity, not redesign. If a prompt looks wrong, that is a
  finding for Debt Review, not a fix here.
- **No ledgering of `descriptor` calls.** Python does not; TS matches. Noted
  for DS8.
- **No backfill flags.** `--metadata-backfill-*` retire in DS10 and are refused
  by name so they cannot inherit the lifecycle route.
- **No `journal` argument-shape change**, no `--content` flag, no stdin
  sentinel — it takes positional words, as today.
- **No slug-existence check** anywhere; `week plan`'s `--journey` from the
  model is stored as the model returned it, as Python does.
- Sibling DS7 stories (US8, US9, TS4) and DS8–DS10.

## Acceptance Behavior

```text
Given a copy of a real memory.db, the committed replay fixtures, and no
      MIRROR_TS_* gate in the environment
When  the Navigator runs `week save` on a Python-written pending file,
      `journal` and `week plan` under the replay transport, `descriptor
      generate` under replay, and each of the four lifecycle faces on a
      seeded conversation, through the front door
Then  stdout is byte-identical to Python for every command
And   the memories/tasks/descriptor/conversation rows written are identical
      to Python's, including the llm_calls rows for journal and week_plan
And   the pending file written by TS week plan is byte-identical to Python's,
      and each engine's `week save` consumes the other's file
And   `--metadata-backfill-preview|-apply` are refused with a reason naming
      DS10, exit code identical to Python's refusal today
And   MIRROR_TS_WEEK=0, MIRROR_TS_JOURNAL=0, MIRROR_TS_DESCRIPTOR=0,
      MIRROR_TS_CONVERSATIONS_LIFECYCLE=0 each reach Python independently
And   front-door.log carries command and engine only — journal's argument IS
      identity text and must never appear
And   the routing reason for `week` no longer says "LLM-gated" for `save`
```

## Parity Contract And Known Divergence Classes

Pinned by golden, from the classes earlier stories paid for:

- **Code-point slicing** (`generateTitle`, US10): `content[:60]`,
  `content[:200]`, `title[:20]`, `descriptor[:80]`. Every one is a golden case
  with a non-BMP character.
- **Clock in the prompt** (`week plan`): frozen in the generator, injected in
  TS. The digest pins the frozen bytes; a TS assembly that reads the real
  clock fails the digest.
- **JSON output** (`ensure_ascii=False, indent=2`, key order): the lifecycle
  faces and `week plan` print JSON; US10's serializer is reused, not
  re-derived.
- **`tempfile.gettempdir()` vs `os.tmpdir()`**: identical on macOS/Linux for
  the default case; the cross-engine proof is the check, and `TMPDIR` is set
  explicitly in the smoke so both engines resolve the same directory.
- **Accepted divergence, same as Soul/Explorer:** Python's `journal` and
  `week` parsers accept `--mirror-home` (both do — checked), so **no** new
  superset here; if any leaf refuses it on Python, record and accept as before.

## Validation Route

Prediction-then-observation, the CR068 shape, three guards (log delta exact,
every `exit=0` except the intended refusals, engine column discriminates).

1. **Automated:** `cd ts && npm test`; `uv run python -m pytest tests/unit
   tests/integration -m "not live"`; the six new/extended goldens byte-identical
   on 3.10 and 3.12; the write probes on the demo copy; the lifecycle smoke with
   no gate in the environment; oracle drift clean; skill parity clean.
2. **Navigator, on the real home, replay-configured** (the fixtures ship in the
   repo; the route states the exact env):
   - `week plan "<a real plan sentence>"` → the JSON report; then `week save`
     → the receipt; then `/mm-tasks` shows the items. *Expected: identical to
     yesterday's Python behavior; new tasks appear.*
   - `journal "<a real one-line entry>"` → the receipt with a layer label and
     id; `memories --type journal` shows it. *Expected: identical shape; the
     classification is whatever the fixture replays, which the route names.*
   - `conversations --metadata-lifecycle-dry-run <a real conversation id>` →
     JSON. *Expected: byte-identical to Python's on the same id (run both).*
   - `conversations --metadata-backfill-preview` → refused, reason names DS10.
   - One revert: `MIRROR_TS_JOURNAL=0 journal "…"` → Python answers.
3. **E2E decision:** required — the lifecycle smoke through the real front
   door is the E2E, and the Navigator route above is the live acceptance.
   Pass: every expected observation holds and the log discriminates. Fail:
   any byte difference between engines on the same input, any refusal that
   writes, any gate that does not revert.

**Not covered, stated:** the live LLM/embedding call (DS8); the S25 injection
probe (live eval, not CI); `descriptor generate` against every identity row on
the real home (validated on one target — the all-targets path is golden-only).

## Implementation Contract

- TDD: Python-generated golden first, TS test red, port, green — per plateau.
- Python is the oracle. Any Python change is a parity-driven fix landed first
  with its own test, recorded in the plan as a scope amendment (the US10/US6
  shape), never a silent edit.
- One directory per family: `ts/src/planning/` for `week`/`journal`,
  `ts/src/identity/descriptorGenerate.ts` beside the US1 descriptor read,
  `ts/src/frontDoor/conversationsLifecycleRoute.ts` beside the US10 routes.
- Allowlist every subcommand and flag **by name** at the route (CR055); the
  backfill flags are refused by name, never by absence.
- `uv run` for every Python command; commit only story-scoped files; English
  commit messages that say why.
- Redaction test per newly routed command (RS005/CR026): `journal`'s argv is
  identity text.
- Each plateau ends with a handoff paragraph in this file's `## Handoff`
  section, written for the next session.

## Persona Review (plan stage)

_Pending. The story is above a small slice — four leaves across two seams plus
four CLI faces — so the collaboration strategy requires the review before
approval. Panel: engineer, quality-assurance, ai-engineer (model-in-the-loop:
three roles, digests, replay fixtures), security-engineer (journal writes
identity-classified memory; front-door redaction), database-architect
(memories + embedding + llm_calls in one write path; tasks rows)._

## Debt / CRs To Capture At Debt Review (candidates)

- Python does not ledger `descriptor` LLM calls (no `on_llm_call`). Every other
  role does. DS8 plan input or its own CR.
- `week plan`'s pending file lives in the system temp dir with a fixed name —
  two concurrent `week plan` calls on one machine overwrite each other. Pre-
  existing; parity preserves it.
- `week plan` stores the model's `journey` slug without checking it exists —
  the CR073 debt-2 family.

## Stop Conditions

Stop and return to the Navigator if:

- any leaf requires a Python change beyond a parity-driven fix with a test;
- the `week plan` prompt cannot be assembled byte-identically with a frozen
  clock (would mean Python's prompt has non-deterministic content beyond the
  date);
- the lifecycle `apply` face turns out to cross the LLM (it should not — it
  takes Navigator-supplied values — but the plan asserts it, so verify first);
- any golden requires a real provider call to generate;
- scope pressure to fix a prompt, a classification rule, or the pending-file
  UX appears — parity, not redesign.

## Approval Gate

Checkpoint `after_plan`, pending `navigator_approval`. Implementation is
blocked until the Navigator approves this Plan after the persona review. The
Plan authorizes local implementation of the six plateaus only; it does not
authorize push, release, or any DS8 live-mode work.

## Handoff

_No plateau completed yet._
