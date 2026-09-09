[< Story](index.md)

# Plan — CV22.DS7.US7 — Explorer Mode

## Objective

Port the `explore` command — 14 leaves — to the TypeScript core with byte-exact
`transport=verbatim` surface parity, and route it to TS. Explorer is Soul's
shape at smaller scale: the same `WIDTH`-padded box drawing, the same
`[[MIRROR_REQUIRED_SURFACE_*]]` marker protocol, the same operating-mode
activation and sticky defaults. It inherits US6's primitives whole
(`ts/src/util/pythonText.ts`, `pythonJsonDumps`, `activateOperatingMode`,
`persistStickyDefaults`, the accepted `--mirror-home` superset), so the story is
mostly seam work with two genuinely new classes: a **durable table with a legacy
runtime-state read fallback**, and a **filesystem write into the user's project
directory carrying obfuscated conversation transcripts**.

One leaf does not flip in this story. `explore story promote` ends by calling
`build_cli.cmd_load(slug)` — the Builder tree, which is US8. It stays on Python
by name, exactly as US6 left `harvest save` behind the replay gate, with a ledger
row that says why and who unblocks it.

## Terrain (facts, read before planning)

- **Leaf inventory — `cli/explore.py` (564 lines), 14 leaves.**
  `load <slug> [--session-id]`; `deactivate [--session-id]`; and `story`
  with twelve actions: `show`, `list`, `archive`, `update`, `clear`, `open`,
  `thicken`, `snapshot`, `attractors`, `experiment`, `handoff`, `promote`.
  Only `story` is a nested subparser — a shape `soul` did not have, and the
  by-name allowlist must therefore be two levels deep.
- **Seam classification.**
  - *Pure renders, no DB:* the eleven renderers of
    `surfaces/explorer_story.py` (243 lines; `WIDTH = 56`, `_box`, `_line`,
    `_wrap`, `_chunk_word`) plus `render_explorer_mode_transition` and the two
    literal blocks in the CLI (`EXPLORER_GUIDANCE`,
    `EXPLORER_DEACTIVATED_SURFACE`).
  - *Deterministic DB:* `load` (operating-mode activation + US4 sticky
    defaults + mirror context), `deactivate`, and every `story` action that
    reads or writes `exploratory_stories` (`services/explorer_story.py`, 701
    lines; `storage/explorer_stories.py`, 131 lines).
  - *Filesystem write:* `story handoff` writes five Markdown documents under
    `<project_path>/docs/project/explorations/<kebab-slug>/`
    (`services/explorer_handoff.py`, 440 lines), reads source conversations and
    their messages, and obfuscates transcripts before writing.
  - *Cross-command:* `story promote` mutates state, then calls Builder `load`.
- **The durable store has a legacy read fallback.**
  `get_explorer_story` reads `exploratory_stories` first and falls back to a
  pre-DS8 runtime-state payload at session id
  `__explorer_story__:<journey>`, parsed leniently (bad JSON → `None`,
  non-dict → `None`). Any install that has not written a story since DS8 still
  reads through that path. Porting the table without the fallback silently
  empties those stories — the same class as the `conversations append` data
  loss, arriving through a read instead of a write.
- **Schema custody is already TS-side.** `exploratory_stories` is in
  `ts/src/db/schema.ts` (with the `idx_exploratory_stories_one_active_per_journey`
  partial unique index) and in `ts/src/db/migrations.ts`. DS6's gate is
  satisfied; no plateau stops on a schema gap. `ts/src/journey/journeyRemoval.ts`
  already queries the table, so a TS read path exists to follow.
- **The obfuscator is a regex divergence class.**
  `_obfuscate_sensitive_text` runs four `re.sub` passes over transcript text:
  `/Users/[^\s)\]]+`, an inline-`(?i)` secret assignment pattern, `sk-[A-Za-z0-9_-]{12,}`,
  and an email pattern. `\s` and `\S` differ between Python and JavaScript on
  Unicode whitespace, `(?i)` has no JS equivalent inline, and a `$`-carrying
  replacement string is interpreted by `String.replace`. This is the security
  boundary of the story: an under-matching port leaks a real path, key, or email
  into a document the user commits to their own repository.
- **Existing TS to reuse:** `util/pythonText.ts` (`pySplitWhitespace`,
  `pySplitLines`, `pyStrip`, code-point slicing — built by US6 for exactly this
  wrapping algorithm), `util/pythonJson.ts` (`pythonJsonDumps`,
  `ensure_ascii=False`), `mode/operatingMode.ts` (`activateOperatingMode`,
  `deactivateOperatingMode`; `MODE_ICONS` already carries `"Explorer Mode": "△"`),
  `mirror/orchestration.ts` (`persistStickyDefaults`), `mirror/context.ts`
  (`loadMirrorContext`), `journey/` (`kebab_slug`, project-path read),
  `conversation/` (conversation + message reads), `db/`. There is **no** Explorer
  renderer, no Explorer story module, and no Explorer mode-transition renderer in
  TS today.
- **Callers bypass the front door.** `.pi/skills/mm-explore/SKILL.md`,
  `.claude/skills/mm-explore/SKILL.md`, and
  `plugins/mirror-mind/skills/mm-explore/SKILL.md` carry 36 direct
  `uv run python -m memory explore …` invocations between them. Routing alone
  does not move a live Explorer session; the skill copies switch in the same
  story that flips the gate. This is the third story to pay that triplication
  cost — CR071 (RS010) is the standing record and is **not** absorbed here.
- **`cmd_load` reaches into a private.** `explore.py` imports
  `memory.skills.mirror._persist_global_sticky_defaults`, the same privacy
  violation US6 recorded for `soul`. TS calls the public `persistStickyDefaults`.

## Scope

**A. Explorer surfaces (`ts/src/explorer/render.ts`).**
1. The eleven renderers of `surfaces/explorer_story.py`:
   `render_exploratory_story_opened`, `_resumed`, `render_explorer_story_archived`,
   `render_explorer_story_list`, `render_story_thickened`,
   `render_narrative_field_snapshot`, `render_attractors_emerging`,
   `render_experiment_proposal`, `render_builder_handoff_proposed`,
   `render_no_builder_handoff`, `render_missing_exploratory_story`, plus the
   shared `_box`, `_line`, `_wrap`, `_chunk_word`, `_story_rows`, and
   `_handoff_path_label` helpers — over `util/pythonText.ts`, not new copies.
2. `render_explorer_mode_transition` (`ts/src/explorer/transition.ts`, the
   `soul/transition.ts` shape), and the two CLI literal blocks.
3. The `[[MIRROR_REQUIRED_SURFACE_BEGIN|END:<id>]]` wrapper with Python's exact
   surface ids: `exploratory_story_resumed`, `exploratory_stories`,
   `exploratory_story_archived`, `exploratory_story_opened`, `story_thickened`,
   `narrative_field_snapshot`, `attractors_emerging`, `experiment_proposal`,
   `builder_handoff_proposed`, `no_exploratory_story`, `no_builder_handoff`.

**B. Story state (`ts/src/explorer/story.ts`).**
4. `getExplorerStory` with **both** read paths: the durable
   `exploratory_stories` row and the legacy `__explorer_story__:<journey>`
   runtime-state payload, including the lenient parse rules (invalid JSON,
   non-dict, non-string fields → the documented `None`), and the active-first
   `list` ordering (`active` → `promoted` → `archived`, then `updated_at DESC`).
5. `updateExplorerStory`, `setExplorerAttractors`, `setExplorerExperimentProposal`,
   `setExplorerBuilderHandoff`, `setExplorerSourceConversations`,
   `archiveExplorerStory`, `clearExplorerStory`, `markExplorerStoryPromoted`,
   and `renderExplorerStoryContext`, preserving the `_UNSET`-vs-`None`
   distinction (absent argument keeps the existing value; explicit `None`
   clears it) and the `_clean` strip-to-null rule.
6. The upsert's identity rules: `id`/`created_at` preserved from the existing
   active row, `updated_at` refreshed, JSON columns written with
   `ensure_ascii=False` insertion order via `pythonJsonDumps`, `NULL` (not
   `"null"`) for absent proposal/handoff objects.

**C. Handoff artifacts (`ts/src/explorer/handoff.ts`).**
7. The five document renderers and the directory allocation: `kebab_slug` of
   title → story → journey with the `"exploration"` fallback, and the
   `-2`, `-3`, … collision loop with `mkdir(recursive, exist_ok=false)`
   semantics — a pre-existing TOCTOU that is reproduced, not fixed.
8. `_obfuscate_sensitive_text` with the four passes ported as explicit
   character classes and literal replacements, never `String.replace` with an
   unescaped `$`-bearing replacement.
9. Source-conversation loading: `id` then `id:role` parsing, the
   id-prefix lookup fallback, and the silent skip of an unknown id.
10. The no-project-path branch: when the journey has no `project_path`, Python
    writes nothing and records a bare `ExplorerBuilderHandoff`. Same in TS.

**D. Front door, routing, evidence, flip.**
11. `runExplore` dispatch (`ts/src/frontDoor/exploreRoute.ts`) plus a routing
    entry gated by `MIRROR_TS_EXPLORE`, with subcommands allowlisted **by name
    at both levels** — `explore <sub>` and `explore story <action>` — so a leaf
    Python grows later is refused rather than inherited.
12. `story promote` is **excluded from the TS route by name** and refused to
    Python, because its tail is Builder `load` (US8). The ledger row says so.
13. Goldens generated from Python: a surface corpus covering every renderer ×
    empty/absent optionals × multi-paragraph text × CJK, combining marks, and a
    200-character unbroken token; a story-state corpus covering the durable
    round-trip, the `_UNSET`/`None` matrix, and the legacy runtime-state
    fallback including its malformed inputs; a handoff-document corpus
    including an obfuscation row per pattern and per near-miss. All generators
    join the determinism gate and run under 3.10 and 3.12.
14. Real-DB-copy write probes: `explorer_story_state`, `explorer_handoff`.
    Lifecycle smoke runs a whole exploration in one session — `load` → `story
    open` → `thicken` → `attractors` → `experiment` → `snapshot` → `handoff`
    → `list` → `archive` → `deactivate` — through both engines on a disposable
    home with a disposable project directory.
15. Flip the gate, switch all three `mm-explore` skill copies to the front door,
    update the burn-down ledger with the per-leaf table and the flip checklist.

## Scope Amendment — the Journey projection refresh seam (Navigator-authorized, 2026-09-09)

Found while reading terrain for plateau 2 and accepted into this story on
explicit Navigator decision, after the plan's `scope_change_detected` stop
condition was raised rather than absorbed silently. Full reasoning:
[Decisions — Journey projection publication stays Python-owned](../../../../decisions.md#journey-projection-publication-stays-python-owned-until-the-retirement-window).

**What the original plan missed.** Every Explorer Story write calls
`store.request_projection_refresh(journey)` (`services/explorer_story.py` lines
265, 280, 366). That is not a no-op: it compiles and publishes an Ariad
operational projection into the user's project. A hermetic probe showed one
`update_explorer_story` creating `.mirror/projections/ariad/operational.json`,
`current.json`, a receipt, and `.publication.lock` where no files existed.

**Why TypeScript does not port the publisher here.** Publication is linearizable
per Journey through `filelock.FileLock` → `fcntl.flock`. Node has no `flock` in
core and mkdir-based JavaScript locks do not exclude against it, so a TS
publisher would be a second, unsynchronized writer for the whole transition
window. Python stays the single writer; TS5 ports the subsystem after the
retirement window closes it.

**Added to scope:**

16. `_projected_story` change detection, ported as a pure function. It compares
    `id`, `title`, `status`, `narrative_field_summary`, attractors, experiment,
    and handoff — deliberately **not** `current_story` or `last_story_card`.

    *(Corrected at plateau 5, from the oracle rather than from reading:* this
    plan originally added "although `title` is derived from `current_story`, so
    a story edit usually reaches it anyway". **It does not.** `_derive_title`
    runs only when the row has no title — `_store_story` passes `story.title or
    _derive_title(story)`, and `update_explorer_story` carries the existing
    title forward. The golden shows it plainly: a second write with story text
    `"second"` keeps title `"first"`. So after creation, editing the story text
    or the last card requests **no refresh at all**. The refresh fires on
    creation, on a narrative-summary change, on archive/promote, and on
    attractors, experiment, or handoff — a much smaller set than implied, and
    the reason the delegated spawn is not a hot path.)*

    Pinned by golden rows in both directions, and by an explicit test naming
    the title's stickiness, since the whole call frequency of the seam depends
    on it.
17. A named refresh seam, `ts/src/explorer/projectionRefresh.ts`, invoked at the
    same three points and only when 16 reports a change. It delegates to Python
    through a new `journey-projection refresh --journey <slug>` subcommand
    carrying **coordinator** semantics — compile, compare digest, publish only
    when changed. `rebuild-operational` is not reused: it always publishes, so
    it would emit snapshots and receipts where Python emits none.
18. That subcommand in `src/memory/cli/journey_projection.py`: ~15 lines over
    the existing `ProjectionRefreshCoordinator`, with **explicit deletion
    ownership recorded in DS10** beside TS2's compatibility host. Python surface
    added to a component being retired, knowingly and in writing.
19. Failure containment: Python's coordinator swallows refresh failure after the
    source commit by design — the store write is authoritative and the
    projection is best-effort. The TS seam reproduces exactly that: a failed or
    unavailable delegation must not fail the Explorer write, must not print to
    stdout, and must leave the same log signature. A test asserts the write
    survives a seam that cannot run at all.

**Still out of scope:** the projection subsystem itself, the
`journey-projection` command's existing operations, the extension projection
API, and any change to what the projection contains. Those are TS5's.

## Non-Goals

- **No Explorer behavior change.** Every surface is reproduced as Python renders
  it today, including the exact error strings, exit codes, and the
  `"No Exploratory Story for journey: <slug>"` / `"Exploratory Story cleared for
  journey: <slug>"` plain-text lines that are not boxed surfaces. If a surface
  looks wrong, that is a CR, not a port decision.
- **No `story promote` flip.** It is refused to Python by name until US8 owns
  Builder `load`. TS does not shell out to Python to complete the tail — that
  would create a cross-language call DS10 must then delete.
- **No obfuscation improvement.** The patterns are ported at their current
  strength, including their known gaps (`/home/...`, bearer tokens without an
  `=`). Strengthening them is a product decision and a CR, and it would break
  parity if done here.
  *(Corrected at plateau 3: the plan said "four patterns" and listed phone
  numbers as a gap. There are **five**, and the fifth is a phone-number pattern
  — `\b(?:\+?\d[\d .()-]{8,}\d)\b`. The claim was written from the terrain read
  rather than from the code, and the golden corrected it.)*
- **No CR071 payment.** The three skill copies are updated, not deduplicated.
  Deduplication is CR071's, due before US8.
- **No exploration-document schema change.** The five handoff documents keep
  their current headings and ordering.
- **No Builder, Workspace, or extension-catalog work** (US8, US9, TS4).
- **No projection publisher port.** TS does not write `.mirror/projections`.
  While both cores exist, Python holds the only lock that means anything.

## Acceptance Behavior

```text
Given a disposable mirror home and a fixed session id
When `explore load <journey>` runs through the front door
Then the Explorer transition surface, the mirror context, the resumed-story
  surface, and the guidance block equal Python's byte for byte
And the operating-mode row and the sticky journey default match Python's writes

Given the surface corpus (every renderer × absent optionals × multi-paragraph
  text × CJK, combining marks, and a 200-character unbroken token)
When each surface renders in TS
Then every line equals Python's, including truncation at WIDTH, padding, and
  the required-surface markers

Given a journey whose only Exploratory Story lives in the pre-DS8
  runtime-state payload
When `explore story show` runs
Then TS reads the legacy payload and renders exactly what Python renders
And a malformed legacy payload yields Python's "no story" result, not a crash

Given an active story with attractors and a handoff
When `explore story update --story "…"` runs without --summary
Then the summary keeps its existing value, the row id and created_at are
  preserved, updated_at moves, and the JSON columns match Python's bytes

Given a journey with a project path and two source conversations
When `explore story handoff --title "…" --include-full-conversation` runs
Then the five documents equal Python's byte for byte, the directory collision
  suffix matches, and every obfuscation pattern redacts identically

Given a transcript containing a local path, an api_key= assignment, an sk- key,
  and an email
When the full-conversation document is written
Then no unredacted secret, path, or address survives in the output, on either
  engine

Given a journey without a project path
When `explore story handoff` runs
Then no directory is created and the recorded handoff carries no paths

Given `explore story promote`
When it runs through the front door
Then it is refused to Python by name and Python answers unchanged

Given MIRROR_TS_EXPLORE=0
When any `explore` leaf runs
Then Python answers with identical output and the front-door log says python

Given an `explore` subcommand or `story` action that exists in Python but is
  not allowlisted
When it runs through the front door
Then it is refused to Python by name, never answered by inheritance

Given a live Pi Explorer Mode session after the flip
When the exploration runs load → open → thicken → attractors → snapshot
Then every surface renders as before and front-door.log shows `explore ts`
```

## Parity Contract And Known Divergence Classes (pinned by golden)

- **Text wrapping.** `_wrap` uses `text.split()` (Python whitespace semantics,
  not JS `/\s+/`) and slices by code point; `_line` truncates to `WIDTH` **then**
  pads. US6's `pySplitWhitespace` and code-point slicing are the fix; the corpus
  pins CJK, astral-plane emoji, combining marks, NBSP, and ideographic space.
- **Regex dialect in the obfuscator.** `[^\s)\]]`, `(?i)`, and the `\1=[SECRET]`
  backreference replacement each have a JS mistranslation that silently
  under-redacts. Pinned per pattern, plus near-miss rows that must **not** be
  redacted so the port cannot over-match either.
- **JSON bytes.** `attractors_json`, `experiment_proposal_json`,
  `builder_handoff_json`, and `source_conversations_json` are
  `ensure_ascii=False`, insertion-ordered, **not** sorted; absent objects are
  SQL `NULL`, not the string `"null"`.
- **`_UNSET` vs `None`.** Three of the CLI's optional flags distinguish "not
  passed" from "passed empty". The golden covers the full matrix.
- **Ordering.** The `list` ordering is a SQL `CASE` over status then
  `updated_at DESC`; ties are resolved by SQLite, so the corpus uses distinct
  timestamps rather than asserting a tie-break TS cannot own.
- **Slug and collision.** `kebab_slug` of a title with punctuation, accents, and
  emoji, plus the `-2`/`-3` suffix loop, are pinned against Python.
- **Timestamps and ids.** `_now()` and `_uuid()` are injected in tests, as in
  US6, so the goldens are deterministic.

## Validation Route

Automated: the three golden corpora under the determinism gate (3.10 and 3.12,
TZ=UTC, offline); unit tests for the `_UNSET` matrix, the legacy-fallback parse
rules, and the two-level allowlist including a refusal of a non-allowlisted
`story` action and the `MIRROR_TS_EXPLORE=0` revert; two write probes on the
redacted real-DB copy; the whole-exploration lifecycle smoke through both engines;
`.pi` typecheck; oracle registration of `cli/explore.py`,
`services/explorer_story.py`, `services/explorer_handoff.py`,
`storage/explorer_stories.py`, and `surfaces/explorer_story.py`.

Navigator route (real home):
1. Read-only surfaces first — `explore story show`, `list`, `snapshot` on a real
   journey through both engines. Expected: byte-identical output.
2. `explore load <journey>` through both engines on a **disposable session id**.
   Expected: identical transition surface, context, and guidance.
3. A real Pi Explorer Mode session after the flip: `/mm-explore <slug>`, thicken
   the story, surface an attractor, deactivate. Expected: the exploration feels
   unchanged and `front-door.log` shows `explore ts`, no `fell_back`.
4. `explore story handoff` — **on a database copy and a scratch project
   directory**, with the generated documents diffed against Python's. A
   real-project handoff happens only if the Navigator explicitly asks after
   seeing the diff.
5. `explore story promote` — expected: Python answers, log says python.
6. `MIRROR_TS_EXPLORE=0` on one surface — expected: identical output, Python in
   the log.

Pass: 1, 2, 5, 6 identical; 3 unchanged with `explore ts` in the log; 4
diff-clean on the copy. Fail: any surface difference, any write divergence, any
`fell_back` marker, any obfuscation difference.

E2E decision: **required** — Explorer is a lived mode, and both the rendering
regressions and the sticky-journey behavior are only observable in a real
session.

## Implementation Contract

Plateaus, one commit each; nothing routes until plateau 5:

1. `explorer/render.ts` + `explorer/transition.ts` and the surface golden
   generator (all renderers, Unicode corpus). Pure functions, no DB.
2. `explorer/story.ts` + the story-state golden, both read paths, and the
   `explorer_story_state` write probe.
3. `explorer/handoff.ts` + the handoff-document corpus and the obfuscation
   matrix. No front-door wiring yet.
4. The `explorer_handoff` write probe on a scratch project directory.
5. Front door + routing (gate default off), two-level allowlist, `promote`
   refusal, exploration lifecycle smoke, CI gate entries, ledger pre-flip entry.
6. Flip: gate default on, all three `mm-explore` skill copies to the front door,
   ledger flip checklist and per-leaf table.

Rules: `uv run` for Python commands and tests; TDD/characterization first — the
golden is generated from Python before the TS implementation exists; no
`git add .`; commits scoped to the story; descriptive English commit messages
explaining why. Each plateau ends resumable, with its state written into this
package or the ledger.

## Persona Review (plan stage — full panel; the story is above a small slice)

**◇ engineer** — Reuse, do not re-derive. `_wrap`/`_chunk_word`/`_line` are the
same algorithm US6 already ported; if the implementation is copied into
`explorer/render.ts` instead of called from `util/pythonText.ts`, US8 inherits a
third copy of a wrapping bug. Keep `explorer/` as four modules (`render`,
`transition`, `story`, `handoff`) rather than one file mirroring `cli/explore.py`
— the CLI's shape is argparse's. Do not reproduce the private-import violation:
call `persistStickyDefaults`. Flag: `_story_rows`'s `len(rows) == 1 or
(include_lifecycle and len(rows) <= 3)` placeholder rule is the kind of
condition a port silently simplifies; pin it with a row for each branch.

**◇ quality-assurance** — Blocking: 14 leaves, so the corpus is leaf-complete,
not renderer-complete, and the flip checklist enumerates leaves with a row each.
Second blocking item: the legacy runtime-state fallback needs its own test
family, including malformed JSON, a JSON array, and a dict with non-string
fields — that path has no coverage today on either side and it is the one an
older install actually runs. Third: the smoke must be one continuous session,
because the bugs in stateful narrative surfaces live in the transitions
(`open` → `thicken` → `attractors` → `handoff` → `archive`). Assert the negative
paths: `story show` with no story, `handoff` with no project path, `promote`
with no handoff, an unknown `--source-conversation` id.

**◇ database-architect** — `idx_exploratory_stories_one_active_per_journey` is a
partial unique index; the upsert's `ON CONFLICT(id)` does **not** target it, so
two concurrent inserts for the same journey raise a constraint error rather than
merging. Python has the same behavior, so parity holds, but do the read-then-upsert
inside one transaction TS-side and do not widen the window. Confirm the JSON
columns store SQL `NULL` and not `"null"` for absent objects — that distinction
is invisible in a parsed comparison and must be asserted at the cell level, as
US6's operating-mode metadata amendment showed. The `archive` and `promote`
paths re-read the row after `UPDATE`; keep that read in the same transaction.

**◇ devops-engineer** — One gate, `MIRROR_TS_EXPLORE`, for the whole family
minus `promote`, because Explorer is a single mode and a half-flipped mode is
unreviewable in a live session. `promote` is the documented exception and the
ledger row must say "blocked on US8", in the row, not in prose. Redaction:
Explorer stories carry unfinished thinking about real work — the front-door log
stays command/engine, the probes stay on redacted copies, and no golden may be
generated from the real home or a real project directory. The TS3 corpus leaked
a developer path; the generator clears and re-clears the environment after
`memory.config` re-applies `.env`.

**◇ security-engineer** — This story's security boundary is
`_obfuscate_sensitive_text`, and it is a **write to the user's own repository**.
An under-matching port does not fail a test — it writes a real secret into a
file the user then commits. Require: a redaction matrix with a positive and a
near-miss row per pattern; a test that fails if any pattern is dropped; explicit
character classes rather than `\s`/`\S`; and literal replacement strings, since
`$&`/`$1` in a JS replacement is interpreted. Second item: the handoff directory
is built from a caller-supplied `--title` through `kebab_slug`; confirm the slug
cannot produce `..` or an absolute segment, and that the write stays confined
under `<project_path>/docs/project/explorations/`. Third: `--source-conversation`
reads arbitrary conversations by id prefix — a prefix collision could pull the
wrong conversation into a handoff document. Python's behavior is the contract,
but pin the collision case so the port cannot broaden it.

**◇ ai-engineer** — Not applicable as a live seam: no leaf in this story calls a
model. Confirm it with a test that fails if `explore` acquires an embedding or
LLM call, because `story handoff` composes text and is the obvious place a future
"summarize the exploration" feature would attach one silently. Record that as a
DS8 input, not a TS-side live call.

Consolidated: proceed. Blocking inputs are the leaf-complete corpus, reuse of
the US6 wrapping primitives, the legacy-fallback test family, the redaction
matrix with near-miss rows, the cell-level `NULL`-vs-`"null"` assertion, the
single-transaction upsert, hermetic generators, the two-level by-name allowlist,
and the whole-exploration smoke.

## Debt / CRs To Capture At Debt Review (candidates)

- `story promote` remains on Python after this story; its flip is a named US8
  dependency and needs a ledger row, not a memory.
- CR071 (triplicated skill copies) is paid a third time here — 36 invocations
  across three `mm-explore` copies. Reinforces the CR; does not resolve it.
- Python's `cmd_load` importing `_persist_global_sticky_defaults`, a private of
  `memory.skills.mirror` — same finding US6 recorded for `soul`.
- The obfuscation patterns miss `/home/...` and bearer tokens without an `=`.
  Product decision, out of scope here, worth a CR under RS010. (Phone numbers
  are covered — the plan's original claim was wrong.)
- The handoff directory collision loop is a TOCTOU; reproduced deliberately.
- **A test budget with no headroom, found at plateau 6, not US7's:**
  `tests/unit/memory/web/test_server.py::test_operations_run_api_executes_runtime_diagnose_through_controlled_command`
  fails locally 2 runs in 3 with "Operation run did not finish".

  Measured rather than guessed: `wait_for_run` polls 40 times at 0.05s, so the
  budget is **2.00s**, and the subprocess it waits on —
  `<interpreter> -m memory runtime diagnose` — takes **2.29s, 2.50s, 2.87s** on
  three consecutive runs on this machine. The budget is not marginally tight;
  it is below the floor.

  It predates this story (reproduced on a stashed tree) and has NOT failed in
  CI — the two recent red runs were Biome import ordering, not this. So it is a
  fixed budget that happens to fit CI's runners and does not fit this one, which
  means it will start failing for whoever gets a slower machine or a slower
  `runtime diagnose`. Deliberately not fixed inside the flip commit: it is
  someone else's test, the repair is a judgement about how long a real
  subprocess may take, and folding it in would hide it. RS010 candidate.
- The delegated `journey-projection refresh` subcommand is a contract TS now
  depends on, but it is NOT in the oracle-drift tripwire, because the tripwire
  tracks *ported* oracles and this one is delegated-to. The lifecycle smoke's
  published-`operational.json` check is the guard instead — behavioral rather
  than byte-based. Deliberate, and worth confirming at Debt Review rather than
  leaving as an omission.

## Stop Conditions

- `scope_change_detected` — an Explorer surface is found to be wrong and someone
  wants it fixed in the port; or `promote`'s Builder tail is proposed as
  ride-along scope.
- `plan_rule_conflict` — the legacy runtime-state fallback turns out to be
  unreachable or already migrated, changing scope item 4's justification.
- `failing_required_check_without_clear_fix` — a wrapping or regex divergence
  that cannot be reproduced deterministically across 3.10 and 3.12.
- `navigator_decision_needed` — before any `story handoff` against a real
  project directory, and before flipping `promote` ahead of US8.
- `plan_rule_conflict` — if the delegated refresh turns out to need more than
  the coordinator entry point named in the amendment, or if any TS code path is
  found writing under `.mirror/projections`.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
