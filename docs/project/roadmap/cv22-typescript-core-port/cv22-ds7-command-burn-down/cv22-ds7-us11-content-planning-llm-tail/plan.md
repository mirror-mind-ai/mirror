[< Story](index.md)

# Plan — CV22.DS7.US11 — Content & planning LLM tail

**Status:** drafted 2026-09-09; **amended the same day after the five-persona Plan review** (recorded below) — awaiting Navigator approval
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
| `week plan <text>` | `cli/week.py:cmd_plan` → `TaskService.ingest_week_plan` | collects every `journey` identity as `{slug, description[:200]}` context; `extract_week_plan` builds its prompt with **`datetime.now()`** (today + weekday); per item, `find_tasks_by_title(title[:20])` — `LIKE '%fragment%'`, a **contains** match, **unescaped** (`%`/`_` in a title are wildcards), journey filter present in the store but **not passed** by `ingest_week_plan` — filtered to same `due_date` and status ≠ done → `warning`; writes `tempfile.gettempdir()/mm_week_pending.json`; prints a JSON report | 1 LLM, clock-dependent prompt | none |
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
   **`MIRROR_TS_WEEK` governs `plan` and `save` only.** `week view` was
   flipped ungated in US2 and stays ungated — a family gate would make a
   never-revertible route revertible as a side effect, and `=0` on a bad
   `plan` must not drag `view` back to Python (QA, review).

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
   three roles; digests pinned. `week_plan`'s generator freezes **both the
   clock and the journey set** — the prompt embeds every `journey` identity's
   first 200 characters, so the digest depends on DB content; the generator
   seeds a fixed set (ai-engineer, review; the CR065 hermetic class).
   `classify_journal_entry`'s `temperature=0.3` is carried on the
   `LlmRequest` now, so DS8's live mode inherits it instead of rediscovering
   it; replay ignores it.

### Plateau 3 — `journal` (replay-gated)

9. `ts/src/memory/journal.ts` (a memory write, beside the US2 listing read —
   not planning; one directory per family): argv join, empty refusal (exit 1, Python's
   message), `classifyJournalEntry` behind `LlmProvider` with `_parse_json_
   response` parity (the non-dict fallback `{title: content[:60], layer:
   "ego", tags: []}` — **by code point**, the `generateTitle` lesson), AI-24
   coercion, then the ported `addMemory` path with embedding; the receipt
   with layer labels `Self (identity)` / `Ego (operational)` / `Shadow
   (tension)` and the raw layer for anything else.
10. Golden: `generate_journal_golden.py` under replay — a well-formed
    response, an invalid-layer response (coerced), a non-JSON response
    (fallback), tags as a non-list, the `--journey` line present/absent,
    empty input refused, **and an embedding-provider failure**: Python's
    `add_memory` generates the embedding *before* it inserts, so a raising
    embedding leaves **zero** `memories` rows while the
    `journal_classification` `llm_calls` row already exists — the exact shape
    a naive insert-then-embed port gets wrong (database-architect, review).
    Grades stdout, the `memories` row, the embedding row, and the `llm_calls`
    rows. **Fixture text is synthetic by construction**; the generator pops
    provider keys and never reads real journal content (security, review).
11. Real-DB-copy write probe `journal` on the demo copy.
12. Routing: `journal` → TS when `MIRROR_TS_JOURNAL` and the replay config
    (`MIRROR_TS_EXTERNAL_ROUTES=1` + `MIRROR_TS_JOURNAL_LLM_REPLAY` +
    `MIRROR_TS_JOURNAL_EMBEDDING_REPLAY`) are set; Python otherwise. Same
    convention as `soul harvest save`.

### Plateau 4 — `week plan` (replay-gated)

13. `ts/src/planning/weekPlan.ts`: journey context (every `journey` identity,
    `content[:200]` **by code point**), the frozen-`now` prompt, `extract_week_
    plan` parsing parity (`ExtractedWeekItem` shape; drop/coerce rules exactly
    as Python), the similarity check — `find_tasks_by_title(title[:20])` is
    `LIKE '%fragment%'`, a contains match with **no wildcard escaping** and
    the journey argument **not passed**; port that SQL exactly, quirks
    included — the
    same-`due_date`-not-done filter, the pending-file write, the JSON report
    with `pending_file` path.
14. Golden: `generate_week_plan_golden.py` under replay with the clock frozen —
    no items, items with/without similar existing tasks, a similar task that is
    done (must not warn), a similar task on a different date (must not warn),
    a 21+-char title (fragment boundary), a non-ASCII title (code-point
    slicing), **a title containing `%` and one containing `_`** (unescaped
    wildcards — must over-match exactly as Python does).
    Grades stdout + the pending file bytes + `llm_calls` row.
15. Routing: `week plan` → TS under `MIRROR_TS_WEEK` + replay config.

### Plateau 5 — `descriptor generate` and the four lifecycle faces

16. `ts/src/identity/descriptorGenerate.ts`: target selection (one or all,
    the `No identity found` and `No entities found` paths), per-target LLM call
    behind `LlmProvider`, `upsert_descriptor` parity, the progress lines with
    the 80-char preview (**by code point**) and `skipped (empty response)`, the
    `N/M` summary. No `llm_calls` row, matching Python (item 6).
17. Golden under replay: one target, all targets, an empty response, a missing
    identity. Grades stdout + the descriptor rows. **Fixture limitation,
    stated:** replay resolves one response per role, so the all-targets case
    replays the *same* descriptor for every target; it asserts N upserts and
    the control flow, not N distinct strings.
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
2. **Navigator route — write leaves on a scratch home, reads on the real
   home.** Fixture-replayed classifications and extractions must not land in
   the production store (the `cr073-scratch` class, with content). The route
   as handed over will name the scratch path, the seed command
   (`generate_demo_memory_db.py`), and the exact env — no placeholders. Shape:
   - *(scratch home)* `week plan "<sentence>"` → the JSON report; `week save`
     → the receipt; `tasks list` shows the items. Then the same two commands
     through Python on a second copy of the same scratch home: **byte-identical
     stdout and identical `tasks` rows.**
   - *(scratch home)* `journal "<entry>"` → the receipt; `memories --type
     journal` shows it; same through Python on the second copy, identical.
   - *(real home, read-only)* `conversations --metadata-lifecycle-dry-run <a
     real conversation id>` → JSON. *Expected: byte-identical to Python's on
     the same id (run both).*
   - `conversations --metadata-backfill-preview` → refused, reason names DS10.
   - *(scratch home)* One revert: `MIRROR_TS_JOURNAL=0 journal "…"` → Python
     answers; `MIRROR_TS_WEEK=0 week view` still answers from **TS** (the gate
     does not cover `view`).
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

## Persona Review (plan stage — 2026-09-09, five lenses)

Run at the Navigator's request before approval. Findings recorded so no later
checkpoint can claim they were unknown; every blocker is folded into the plan
above.

**◇ engineer**
- *Blocker — similarity query misdescribed.* The plan said "`LIKE` prefix
  query"; the code is `LIKE '%fragment%'`, unescaped, journey not passed. A
  Driver following the plan would have written `LIKE 'x%'`. Terrain and
  plateau 4 corrected; `%`/`_` golden cases added.
- *Non-blocking — cohesion.* `journal` moved from `ts/src/planning/` to
  `ts/src/memory/`; it is a memory write.
- *Verified* — `addTask` carries `source/scheduled_at/time_hint/context`;
  `parseJsonResponse` exists. No hidden primitive scope in plateaus 1 and 3.

**◇ quality-assurance**
- *Blocker — the route wrote fixture-classified data to production.* Write
  leaves now validate on a scratch home seeded from the demo DB, compared
  against Python on a second copy; the real home is read-only faces and the
  revert.
- *Blocker — `MIRROR_TS_WEEK` would have newly gated `week view`.* Decided:
  the gate governs `plan|save` only; `view` stays ungated.
- *Non-blocking* — embedding-failure and wildcard golden cases added.
- *Accepted boundary* — all-targets `descriptor generate` is golden-only.

**◇ ai-engineer**
- *Non-blocking* — replay resolves one response per role; the all-targets
  descriptor case replays one string N times. Stated as a limitation.
- *Non-blocking* — `temperature=0.3` carried on the request now, for DS8.
- *Non-blocking* — the `week_plan` digest depends on journey rows; generator
  now freezes the journey set as well as the clock.
- *Converged* — `descriptor` unledgered is a DS8 input.

**◇ security-engineer**
- *Debt to capture* — the pending file (fixed name, shared temp, umask,
  symlink-following). Parity preserves; fix both engines together later.
- *Added to contract* — fixtures synthetic by construction; no real journal
  text in `ts/test/goldens/`. Redaction test already in scope.
- *Converged* — AI-24 coercion as tested logic; `apply` takes human values.

**◇ database-architect**
- *Golden case added* — embed-before-insert: a raising embedding leaves zero
  `memories` rows and one `llm_calls` row. The naive port inverts the order.
- *Accepted* — `week save` is N inserts, not one transaction; mid-loop failure
  leaves partial tasks and the file. Parity; not golden-injectable.
- *Verified* — `upsert_descriptor` has its TS table since US1. No schema scope.

**Converged, no dissent:** plateau order; replay-only boundary; no prompt or
rule changes; deterministic `week save` first with the cross-engine proof.

**Read after amendment:** ready for Navigator approval.

## Debt / CRs To Capture At Debt Review (candidates)

- Python does not ledger `descriptor` LLM calls (no `on_llm_call`). Every other
  role does. DS8 plan input or its own CR.
- `week plan`'s pending file lives in the system temp dir with a fixed name —
  two concurrent `week plan` calls on one machine overwrite each other. Pre-
  existing; parity preserves it.
- `week plan` stores the model's `journey` slug without checking it exists —
  the CR073 debt-2 family.
- **Capture at Debt Review (security, review):** the pending file — fixed
  name in the shared temp dir, default umask, personal plan text, `write_text`
  follows a pre-existing symlink. Parity preserves all of it here and must not
  tighten TS alone (a TS-only mode change breaks the cross-engine proof); fix
  both engines together under RS010 beside CR062.

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

### Plateau 1 complete — `week save` and the pending-file contract (2026-09-09)

**What is now true.** `week save` is ported, graded, and wired through the
front door behind `MIRROR_TS_WEEK`, **absent by default** — nothing routes to
TS yet. `week view` deliberately does not join the gate.

- `ts/src/planning/weekPending.ts` — the pending-file contract (path,
  serialization, read/write/unlink), written as the contract because both
  engines use it during the transition.
- `ts/src/planning/weekSave.ts` — the port. `timeSuffix` validates the
  timestamp shape explicitly rather than trusting `new Date(...)`: Node's
  parser is more permissive than `datetime.fromisoformat`, so a naive port
  renders a time where Python's `except ValueError` renders none.
- `ts/parity/generate_week_save_golden.py` → 10 cases. Ids are aliased in
  receipt order (the conversation-logger convention) **and their raw shape is
  recorded separately**, so aliasing cannot hide a port emitting wrong-format
  ids.
- `ts/parity/week_pending_cross_engine.py` — the plan's evidence item #4, both
  directions, plus a byte comparison of what each engine serializes.
- `routing.ts` — `save` gated, `plan` refused with a true reason, unknown
  subcommands refused by name.
- 11 TS golden tests, 3 routing tests; determinism gate registered.

**Findings worth carrying.**

1. **The receipt embeds generated task ids**, so the corpus could not be
   byte-pinned without aliasing. Discovered by the determinism check failing on
   the second run, not by reading the code.
2. **`week save` writes N rows and unlinks after the loop** — confirmed against
   the oracle. A mid-loop failure leaves partial tasks and the file. Parity
   preserved; noted for Debt Review.
3. **The cross-engine harness first failed with `no such table: tasks`** — it
   copied a WAL-mode database without checkpointing, so the schema was still in
   the `-wal` file. Harness defect, not a port defect, but the same trap will
   catch plateau 3's write probe; checkpoint before copying.
4. **A refusal reason I wrote said "disabled by MIRROR_TS_WEEK=0" for a
   default-OFF gate**, which is untrue when the variable is simply absent.
   Corrected to "needs MIRROR_TS_WEEK=1". Surfaces that describe state must
   describe the state that exists.

**What remains undone.** Plateaus 2–6, unchanged. Next is plateau 2: the three
provider roles, the vendored prompt templates, and the digest-pinned assembly
goldens — with `week_plan`'s generator freezing both the clock and the journey
set.

### Plateau 2 complete — provider roles and prompt assembly (2026-09-09)

**What is now true.** No routing changed. The three roles exist, the three
templates are vendored byte-exact, assembly is digest-pinned.

- `LlmRole` gains `journal_classification`, `week_plan`, `descriptor`, with the
  `descriptor` ledger gap documented at the type.
- The templates were **generated from the Python source**, never retyped, and
  appended to `ts/src/extraction/prompts.ts` — one TS module mirroring one
  Python module, which is the convention that file's header already states, so
  the `prompts.py` tripwire keeps mapping to exactly one TS file. Lengths match
  Python exactly: 809 / 894 / 1373.
- `ts/src/planning/promptAssembly.ts` — the three builders, the journeys-text
  renderer, an injected clock, and the three temperatures carried for DS8.
- `generate_prompt_assembly_golden.py` extended with 8 US11 scenarios; the
  clock AND the journey set are frozen.

**Findings worth carrying.**

1. **Python's `.format()` collapses `{{` to `{`, and `WEEK_PLAN_PROMPT`
   contains a JSON example written with doubled braces.** A `replaceAll`-based
   substitution left them doubled, changing the assembled bytes. Caught by the
   digest, not by review. Fixed with `pyFormat` in `#util/pythonText.ts`
   (raises on an unknown field rather than emitting the placeholder), tested
   directly — it is now a shared Python-semantics primitive beside
   `sliceCodePoints`.
2. **Journey descriptions are truncated TWICE** — 200 code points in
   `ingest_week_plan`, then 100 in `extract_week_plan`. Only the second cut
   reaches the model. The plan's terrain named only the first.
3. **Sharing the golden broke a sibling test.** `conversationMetadata.test.ts`
   looped over every scenario and asserted an exact surface list. Both are now
   scoped, and a new assertion proves the split stays exhaustive — a future
   surface cannot fall through both files ungraded.
4. **`weekPlanClock` reproduces two Python-isms**: local-time `datetime.now()`
   and Monday-indexed `weekday()` against JavaScript's Sunday-indexed
   `getDay()`. Tested on a Wednesday, a Sunday, and a zero-padded January date.

### Plateau 3 complete — `journal` behind replay (2026-09-09)

**What is now true.** `journal` is ported and routed behind
`MIRROR_TS_JOURNAL` **plus** the replay transport, both absent by default.
`ts/src/memory/journal.ts` reuses `createMemoryRow`, `memoryEmbedText`, and
`addEmbeddingProvenance` rather than duplicating US6's write path.

**The corpus pinned four Python behaviours a reasonable port gets wrong:**

1. **`", ".join(tags)` over a STRING iterates characters.** A model returning
   `"not-a-list"` makes Python's receipt read `n, o, t, -, a, -, l, i, s, t`.
   It looks like a defect and is reproduced deliberately.
2. **The non-JSON fallback cuts the title at 60 CODE POINTS**, proven with a
   non-BMP entry whose emoji must not split.
3. **AI-24 coercion** — an invalid layer becomes `ego` before the write.
4. **Embed-before-insert** — a failing embedding persists nothing, while the
   classification row AND an **unpriced** embedding row already exist in
   `llm_calls`.

**A generator defect caught before it could mislead.** The first draft stubbed
`generate_embedding` at the service level, which bypasses `_log_embedding_call`
and produced a corpus recording ONE ledger row where Python writes TWO. The
port would have been graded against a wrong number and DS8 would have found it
live. Fixed by stubbing the embedding CLIENT instead, so the real function —
and its ledger callback — still runs.

**Both mutation checks bite.** Removing AI-24 coercion fails three tests. A
genuine insert-then-embed port fails exactly the database-architect's case and
nothing else. The first attempt at that mutation was not a defect at all —
JavaScript evaluates call arguments before the call, so `embed` still threw
first; recorded because a mutation that does not mutate proves nothing.

**Also.** `tsc` caught a `string | null` narrowing the test run did not: node's
type stripping executes without typechecking, so a green suite is not a green
typecheck.

**What remains undone.** Plateaus 4–6. Next is plateau 4, `week plan`: the
frozen-clock prompt (plateau 2 built it), the `LIKE '%fragment%'` similarity
port with its unescaped wildcards, and the pending-file write.

**Checks at handoff.** TS 1777 pass / 0 fail; `cli/journal.py` added to the
drift tripwire (baseline gained exactly one line, no other sha moved); the
journal golden regenerates byte-identically; ruff and biome clean on CI's
scope. The Python failure remains CR058's wall-clock flake.

---

**Plateau 2 checks (superseded above).** TS 1752 pass / 0 fail; the two goldens regenerate
byte-identically; oracle drift clean; ruff and biome clean. The single Python
failure is **CR058's known wall-clock flake** in the web diagnose test —
verified by stashing every change and reproducing it on a clean tree.

---

**Plateau 1 checks (superseded above).** TS 1733 pass / 0 fail; Python unit+integration green
(the one failure seen is CR058's known wall-clock flake in the web diagnose
test); `tsc --noEmit` clean; biome clean; ruff clean on `src/` and `tests/`;
the golden regenerates byte-identically; the cross-engine proof clean; oracle
drift clean.
