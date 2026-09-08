[< Story](index.md)

# Plan — CV22.DS7.US6 — Soul Mode

## Objective

Port the `soul` command — 10 subcommands, 17 leaves — to the TypeScript core
with byte-exact `transport=verbatim` surface parity, and route it to TS. Soul is
the smallest ritual surface that combines the three properties US8 will face at
ten times the size: hand-rendered box-drawing surfaces, session-scoped runtime
state, and an identity write. Porting it here builds the surface-grading harness
and the identity-write discipline against a bounded command, so US8 inherits
tooling instead of inventing it.

One live gap rides along: all three `mm-soul` skill copies invoke
`uv run python -m memory soul …` directly, so a flipped route would not reach a
live Soul Mode session. This story closes that for `soul`, the same way CR059
closed it for the Pi extension and the Gemini hooks.

## Terrain (facts, read before planning)

- **Surface inventory — `cli/soul.py` (518 lines), 17 leaves.**
  `load [slug] [--session-id]`; `listen [--matter] [--self] [--shadow]
  [--wisdom] [--beauty]`; `rite <self|shadow|wisdom|beauty> [--says]
  [--listening-for] [--question]`; `close [--harvested] [--echoes] [--open]
  [--integration]`; `review [--origin|--journal] [--self] [--shadow] [--ego]
  [--persona] [--open]`; `propose <layer> [--key] [--origin] [--current]
  [--proposed] [--why]`; `apply <layer> [--key] [--proposed] [--confirm]
  [--origin] [--conversation-id] [--journal-id]`; `fruit set|show|clear`;
  `harvest set|show|save|decline`; `prompt self|wisdom|beauty`.
- **Seam classification (the shape of the whole story).**
  - *Pure renders, no DB:* `listen`, `rite`, `close`, `review`, `propose`
    (`surfaces/soul.py`, 344 lines: `WIDTH`-padded box drawing, `_wrap`,
    `_wrap_blocks`, `_normalize_voice_text`).
  - *Deterministic DB:* `load` (operating-mode activation + the US4 sticky
    defaults + the Soul transition surface), `fruit set|show|clear`,
    `harvest set|show|decline` — all `runtime_sessions.metadata` JSON under
    the `soul` key (`fruit_in_maturation`, `harvested_fruit`).
  - *Identity write:* `apply` — inserts an `identity_integrations` row and
    appends a dated bullet into the identity document under a
    layer-specific section title (`services/soul.py`,
    `append_identity_integration_to_content`).
  - *External seam:* `harvest save` only. It calls `add_journal` with
    `title`, `layer="self"`, and `tags` **all supplied**, so
    `classify_journal_entry` never runs — there is no LLM call. But
    `add_memory` generates an embedding when none is passed, so this one leaf
    is embedding-gated and belongs behind the DS5 replay transport, exactly
    like US10's close tail. Live embedding stays DS8's.
- **Prompt templates are packaged Python resources.**
  `services/soul_prompt.py` reads `soul_self_voice.md` (219 lines),
  `soul_wisdom_voice.md` (121), `soul_beauty_voice.md` (103) through
  `importlib.resources` on `memory.prompts`, and `prompt self` replaces
  `{user_self_identity}` with identity `self/soul` or a fixed unavailable
  sentence. TS has no importlib; the templates must be read from the same
  files on disk, not copied (see Scope C).
- **Existing TS to reuse:** `ts/src/mode/operatingMode.ts`
  (`activateOperatingMode`, `MODE_ICONS` already carries `"Soul Mode": "☾"`),
  the US4 mirror sticky-default writer in `ts/src/mirror/`, the US3 identity
  write path and its allowlist/fences in `ts/src/cultivation/`, the DS5
  provider substrate for the embedding under replay, `ts/src/db/` for the
  read/write seam. There is **no** Soul renderer, no Soul session state, and
  no mode-transition renderer for Soul in TS today.
- **`soul listen` is a hot path.** The operating instructions require the
  renderer call at the end of every Soul Mode response carrying living matter,
  so `listen` runs on most turns of a ritual session — the same
  "most-executed surface" argument that governed TS3's status line.
- **Callers bypass the front door.** `.pi/skills/mm-soul/SKILL.md`,
  `.claude/skills/mm-soul/SKILL.md`, and
  `plugins/mirror-mind/skills/mm-soul/SKILL.md` all call
  `uv run python -m memory soul …` (32 invocations in the Pi copy). Routing
  alone does not move a live session; the skill copies must switch to the
  front door in the same story that flips the gate.
- **Denominator defect found while reading the terrain (not this story's to
  fix).** The ledger's *Content & planning writes* row reports
  `journal`, `tasks`, `week` as `3/3 ✅ done` under US2, but US2 explicitly
  excluded the LLM/embedding-gated leaves and reassigned them to US5, and
  neither US5 nor US10 ported them. `routeMemoryCommand(["journal", …])`
  returns `engine: "python", reason: "command not ported to TS"` and no TS
  journal module exists; `week plan|save` are likewise refused with a reason
  naming US5. Three leaves are counted as burned down while still answered by
  Python, and they currently have no owner. Recorded here as a risk because
  US6 reports into the same denominator and `harvest save` writes through that
  same unported `add_journal` path; recommended as a CR under RS009 rather
  than absorbed into this story's scope.

## Scope

**A. Soul surfaces (`ts/src/soul/render.ts`).**
1. The eight renderers of `surfaces/soul.py`: `render_possible_listenings`,
   `render_active_rite`, `render_closing_rite`, `render_integration_review`,
   `render_enrichment_proposal`, `render_identity_change_applied`,
   `render_fruit_in_maturation`, `render_harvested_fruit`, plus the shared
   `_line`, `_render_section_card`, `_wrap`, `_wrap_blocks`, and
   `_normalize_voice_text` helpers, and the voice/layer symbol tables.
2. The Soul mode-transition surface used by `load`.

**B. Session state (`ts/src/soul/state.ts`).**
3. `resolveSoulSessionId` (explicit → `MIRROR_SESSION_ID` → the
   `__global_soul_mode__` constant) composed with the operating-mode session
   resolver, matching `_resolve_cli_soul_session_id`'s precedence exactly.
4. Fruit and harvest read/set/clear over `runtime_sessions.metadata`,
   including Python's key-removal rule: `harvest set` moves the maturation
   fruit to the harvest key and pops the old one; clearing the last soul key
   removes the `soul` object, and an empty metadata object is written as
   `NULL`, not `{}`.

**C. Voice prompts (`ts/src/soul/prompts.ts`).**
5. Load the three templates **from the same `src/memory/prompts/*.md` files**
   by resolved path — one authority, no vendored copy, no drift class — and
   inject identity `self/soul` into the Self Voice placeholder with Python's
   exact unavailable fallback sentence. All three files join the oracle drift
   tripwire. Relocating them into the TS package is DS10's packaging work,
   recorded, not done here.

**D. Identity integration (`ts/src/soul/apply.ts`).**
6. `applyIdentityIntegration`: insert the `identity_integrations` row and
   append `- [YYYY-MM-DD] <content>` under the layer's section title,
   reproducing `append_identity_integration_to_content` — create the heading
   when absent, insert at the end of an existing section, and preserve the
   following sections' spacing byte for byte. Same transaction shape as
   Python.
7. Route the write through the US3 identity-write allowlist and fences; refuse
   any layer outside `self|shadow|ego|persona`; preserve
   `--confirm APPLY` as a hard precondition and the `persona` layer's required
   `--key`.

**E. Journal harvest behind the replay seam (`ts/src/soul/harvest.ts`).**
8. Port `compose_soul_harvest_journal` (title from the first sentence, the
   Markdown body, and the metadata JSON — insertion-ordered, `ensure_ascii`
   off, **not** sorted) and the `harvest save` write: journal memory insert
   with title/layer/tags supplied, then clear the harvested fruit.
9. Route `harvest save` to TS **only** under the DS5 embedding replay
   configuration, like US10's close tail. Unconfigured installs keep Python.
   The live embedding call is DS8's.

**F. Front door, routing, evidence, flip.**
10. `runSoul` dispatch plus a routing entry gated by `MIRROR_TS_SOUL`, with
    the subcommands **allowlisted by name** so a subcommand Python grows later
    is refused rather than inherited (the RS009 rule, and the `conversations
    append` lesson).
11. Goldens generated from Python: a surface corpus covering every renderer
    with empty/absent optionals, multi-paragraph blocks, CJK and combining
    characters, and long unbroken tokens; a session-state corpus; an
    identity-append corpus over the four layers × (no heading, existing
    heading, heading followed by another section); a harvest-journal corpus.
    All generators join the determinism gate and run under 3.10 and 3.12.
12. Real-DB-copy write probes: `soul_state`, `soul_apply`, `soul_harvest_save`.
    Lifecycle smoke extended to run a full ritual — load, listen, rite, fruit
    set/show, harvest set, close, review — through both engines on a
    disposable home.
13. Flip the gate, switch all three `mm-soul` skill copies to the front door,
    update the burn-down ledger with the per-leaf table and the flip checklist.

## Non-Goals

- **No ritual behavior change.** Every surface is reproduced as Python renders
  it today, including the legacy aliases (`rite --question`, `review
  --journal`) and the exact error strings and exit codes. If a surface looks
  wrong, that is a CR, not a port decision.
- **No live embedding.** `harvest save` answers from TS only under replay;
  the live call is DS8's. This is the single leaf that does not reach an
  ungated flip in this story, and the ledger records it that way.
- **No `journal` command port.** The orphaned `journal` / `week plan` /
  `week save` leaves are a denominator defect, not US6 scope.
- **No identity re-synthesis.** `apply` appends and audits, exactly as Python
  does. Synthesizing the identity document from `identity_integrations` rows
  is a product question nobody has asked for.
- **No Explorer or Builder work** (US7, US8), and no Soul-adjacent `mirror`
  or `mode` changes beyond reusing what US4 already ported.

## Acceptance Behavior

```text
Given a disposable mirror home and a fixed session id
When `soul load <journey>` runs through the front door
Then the Soul transition surface equals Python's byte for byte
And the operating-mode row and the sticky journey default match Python's writes

Given the surface corpus (every renderer × empty optionals, multi-paragraph
  blocks, CJK, combining marks, and a 200-character unbroken token)
When each surface renders in TS
Then every line equals Python's, including padding, wrapping, and box width

Given fruit in maturation set in session S
When `soul harvest set` runs with no argument
Then the maturation fruit becomes the harvested fruit, the maturation key is
  removed, and the rendered card equals Python's

Given an identity document whose layer section already exists and is followed
  by another section
When `soul apply <layer> --proposed "…" --confirm APPLY` runs
Then an identity_integrations row is inserted and the document equals Python's
  result byte for byte, including blank lines around the following section

Given `soul apply` without `--confirm APPLY`, or `soul propose persona`
  without `--key`
Then TS refuses with Python's exact message and exit code, and writes nothing

Given the embedding replay configuration and a harvested fruit in session S
When `soul harvest save --journey <slug>` runs
Then the journal memory, its metadata JSON bytes, and the cleared harvest
  state match Python's, and the harvest key is gone

Given MIRROR_TS_SOUL=0
When any `soul` leaf runs
Then Python answers with identical output and the front-door log says python

Given a `soul` subcommand that exists in Python but is not allowlisted
When it runs through the front door
Then it is refused to Python by name, never answered by inheritance

Given a live Pi Soul Mode session after the flip
When the ritual runs load → listen → fruit → harvest → close
Then every surface renders as before and front-door.log shows `soul ts`
```

## Parity Contract And Known Divergence Classes (pinned by golden)

- **Text wrapping.** Python's `_wrap`/`_wrap_blocks` slice by code point;
  JavaScript strings are UTF-16. This is the exact class that produced the
  `generateTitle` defect in US5 — the corpus pins CJK, emoji beyond the BMP,
  and combining marks, and the implementation iterates code points.
- **Sentence split in `_title_from_fruit`.** Python's
  `re.split(r"(?<=[.!?])\s+", fruit, maxsplit=1)` — `\s` differs between
  Python and JavaScript on Unicode whitespace; use an explicit class, pinned
  by corpus rows carrying NBSP and ideographic space.
- **JSON bytes.** `apply` metadata is `sort_keys=True`; the harvest journal
  metadata is **insertion-ordered** with `ensure_ascii=False`. Two different
  rules in one story — both pinned.
- **Date slice.** `integration.created_at[:10]` is a string slice of the
  stored timestamp, not a formatted date.
- **Empty-metadata rule.** `_clear_soul_key` writes `NULL` when the metadata
  object becomes empty, not `{}`.
- **Box geometry.** `WIDTH`, the `_line` padding rule, and the leading
  `"Soul Mode"` label line are pinned per renderer.

## Validation Route

Automated: the four golden corpora under the determinism gate (3.10 and 3.12,
TZ=UTC, offline); unit tests for session-id precedence and the metadata
removal rules; routing tests including the by-name refusal of a
non-allowlisted subcommand and the `MIRROR_TS_SOUL=0` revert; three write
probes on the redacted real-DB copy; the ritual lifecycle smoke through both
engines; `.pi` typecheck; oracle registration of `cli/soul.py`,
`services/soul.py`, `services/soul_journal.py`, `services/soul_prompt.py`,
`surfaces/soul.py`, and the three prompt templates.

Navigator route (real home):
1. Read-only surfaces first — `soul listen`, `rite`, `close`, `review`,
   `propose` through both engines; expected: byte-identical output.
2. `soul prompt self` through both engines — expected: identical, with the
   real Self identity injected.
3. A real Pi Soul Mode session after the flip: `soul load`, a listen surface
   on living matter, `fruit set`/`show`, `harvest set`, `close`. Expected:
   the ritual feels unchanged and `front-door.log` shows `soul ts`, no
   `fell_back`.
4. `soul apply` — **on a database copy, not the real home**, with the copy's
   identity document diffed against Python's result. A real-home identity
   integration happens only if the Navigator explicitly asks for it after
   seeing the copy diff.
5. `MIRROR_TS_SOUL=0` on one surface — expected: identical output, Python in
   the log.

Pass: 1, 2, 5 identical; 3 unchanged with `soul ts` in the log; 4 diff-clean
on the copy. Fail: any surface difference, any write divergence, any
`fell_back` marker.

E2E decision: **required** — Soul is a lived ritual, and a rendering
regression is only observable in a real session.

## Implementation Contract

Plateaus, one commit each; nothing routes until plateau 6:

1. `soul/render.ts` + the surface golden generator (all renderers, Unicode
   corpus). Pure functions, no DB.
2. `soul/state.ts` + session-state golden; the `soul_state` write probe.
3. `soul/prompts.ts` + template path resolution and oracle registration.
4. `soul/apply.ts` + identity-append corpus and the `soul_apply` probe, behind
   the US3 allowlist.
5. `soul/harvest.ts` + harvest-journal corpus and the `soul_harvest_save`
   probe under the replay transport.
6. Front door + routing (gate default off), ritual smoke, CI gate entries,
   ledger pre-flip entry.
7. Flip: gate default on, all three `mm-soul` skill copies to the front door,
   ledger flip checklist.

Rules: `uv run` for Python commands and tests; TDD/characterization first —
the golden is generated from Python before the TS implementation exists; no
`git add .`; commits scoped to the story; descriptive English commit messages
explaining why. Each plateau ends resumable, with its state written into this
package or the ledger.

## Persona Review (plan stage — full panel; the story is well above a small slice)

**◇ engineer** — Keep `soul/` as five small modules (`render`, `state`,
`prompts`, `apply`, `harvest`) rather than one file mirroring `cli/soul.py`;
the CLI's shape is argparse's, not the domain's. The wrapping helpers are the
only real algorithm here — extract them where US7 and US8 can reuse them,
because Explorer and Ariad surfaces wrap the same way. Do not re-implement the
operating-mode write; call US4's. Flag: `cmd_load` reaches into
`memory.skills.mirror._persist_global_sticky_defaults`, a private of another
module — TS calls the public sticky-default writer and does not reproduce the
privacy violation.

**◇ quality-assurance** — Blocking: 17 leaves, so the corpus must be
leaf-complete, not renderer-complete; the flip checklist enumerates leaves and
each one has a row. Second blocking item: the ritual smoke must run the whole
sequence in one session — the bugs in stateful ritual surfaces live in
transitions (`fruit set` → `harvest set` → `save` → `close`), not in single
renders. The Unicode corpus is not optional: US5 shipped a UTF-16 slicing
defect in exactly this class. Also assert the *negative* paths — missing
`--confirm`, `persona` without `--key`, `harvest show` with nothing harvested
— because Soul's error strings are user-visible ritual text.

**◇ database-architect** — `runtime_sessions.metadata` is a JSON blob mutated
read-modify-write; two Soul commands in the same session race by construction.
Python has the same race, so parity is preserved, but do the mutation in one
transaction and re-read inside it — do not widen the window TS-side. Confirm
`identity_integrations` exists in the TS-owned schema (DS6 custody) before
plateau 4; if the table is Python-created only, that is a schema gap and stops
the plateau. The `NULL`-vs-`{}` empty-metadata rule is a data-shape contract:
pin it in the probe, not only in the unit test.

**◇ devops-engineer** — One gate, `MIRROR_TS_SOUL`, with the whole family
under it, because Soul is a single ritual and a half-flipped ritual is
unreviewable in a live session. `harvest save` is the exception: replay-gated,
so an unconfigured install keeps Python for that leaf only, and the ledger
must say so in the same row rather than in prose. Redaction: Soul surfaces
carry the most intimate text in the product — the front-door log stays
command/engine, the probes stay on redacted copies, and no golden may be
generated from the real home (the TS3 corpus leaked the developer's mirror
home; the generator must clear and re-clear the environment after
`memory.config` re-applies `.env`).

**◇ security-engineer** — `soul apply` writes identity from text that
originated in an LLM-authored ritual proposal. `--confirm APPLY` is a
Navigator gate, not a content check: the write must go through the US3
allowlist and the same injection fences, and the appended bullet must be
treated as untrusted content — never interpolated into a later prompt without
fencing. `prompt self` injects the identity document into a prompt template:
the placeholder replacement must be a single literal replacement, not a regex
substitution where `$&`-class sequences in identity text could rewrite the
template. Reading prompt templates by resolved path must be confined to the
package directory — no caller-supplied path, no traversal.

**◇ ai-engineer** — `harvest save` is the only model-in-the-loop leaf and only
through the embedding. Confirm the assertion in this plan — that supplying
title, layer, and tags bypasses `classify_journal_entry` entirely — with a
test that fails if a future Python change reintroduces the classifier call;
otherwise a silent LLM cost appears in a ritual command. Record the embedding
divergence as a DS8 input, not a TS-side live call.

Consolidated: proceed. Blocking inputs are the leaf-complete corpus, the
Unicode wrapping cases, the single-transaction metadata mutation, the
`identity_integrations` schema check before plateau 4, the allowlist and
literal placeholder replacement on the write/prompt paths, hermetic
generators, and the whole-ritual smoke.

## Debt / CRs To Capture At Debt Review (candidates)

- The ledger's *Content & planning writes* row counts `journal`,
  `week plan`, and `week save` as burned down while the front door refuses
  them to Python and no TS module exists — denominator defect, RS009.
- The three `mm-soul` skill copies duplicate 32 invocations each; a shared
  command reference would remove the drift class this story pays for once.
- Python's `cmd_load` reaching into another module's private sticky-default
  writer.
- The read-modify-write race on `runtime_sessions.metadata` (pre-existing;
  worth a CR if two Soul commands can plausibly overlap in one session).

## Stop Conditions

- `scope_change_detected` — a Soul surface is found to be wrong and someone
  wants it fixed in the port; or `journal` is proposed as ride-along scope.
- `plan_rule_conflict` — `identity_integrations` turns out not to be in the
  TS-owned schema, or the prompt templates cannot be read without vendoring.
- `failing_required_check_without_clear_fix` — a wrapping divergence that
  cannot be reproduced deterministically across 3.10 and 3.12.
- `navigator_decision_needed` — before any `soul apply` against the real home,
  and before flipping `harvest save` beyond the replay gate.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
