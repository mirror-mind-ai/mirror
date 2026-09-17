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

**Reassignment rule (CR068, 2026-09-09).** When a story reassigns scope to
another story, the *receiving* story must name it in its own package, or the
scope has no owner. A reassignment recorded only in the sending story's prose
is not an owner — US2 sent `journal` and `week plan|save` to US5, US5 was
re-scoped without them, and the ledger kept the family at `3/3 done` for a
week while three leaves answered from Python. Every leaf that does not answer
from TS in an unconfigured install is listed in the [Remainder](#remainder)
below with a named owner; that table, not the family rows, is what "done =
zero" is audited against.

**Skill invocations were a second bypass (CR072, closed 2026-09-09).** A
flipped route reaches a live session only if the caller enters the front door.
CR059 routed the Pi extension and Gemini hooks; CR071 made the three skill
copies agree. Neither made every *skill* enter the front door: until
2026-09-09, `mm-tasks`, `mm-week`, `mm-consolidate`, `mm-shadow`,
`mm-consult`, `mm-mute`, `mm-new`, `mm-discard`, and `mm-mirror` invoked
`uv run python -m memory` directly while their routes pointed at TS — and the
checker written to close it found three more (`mm-soul`'s `identity get` and
`mode deactivate` lines, `mm-explore`'s `conversations`, `mm-build`'s `mirror
log`). CR072 moved 110 invocation lines across 36 files to the front door and
added a CI assertion: a skill may invoke Python only for a command on
`PYTHON_ALLOWLIST` in `scripts/check_skill_command_parity.py`, each entry
naming its owner (`build`→US8, `journal`→US11, `identity edit`→TS4, the
`runtime` update half→DS10). From here a family row's ✅ means the skill a
Navigator types, too — for any skill whose command is on the allowlist, the
row is honest by construction because the command is not ✅.

**What "routed to TS" reaches (RS009 CR059, 2026-09-08).** Until this date the
Pi extension and the Gemini hooks called `uv run python -m memory` directly and
never entered the front door, so a flipped route was exercised by the lifecycle
smoke and by the skills — not by a live session. Both runtimes now enter
`ts/src/frontDoor/cli.ts`, so from here "routed to TS" means live Pi and Gemini
sessions too, and a `MIRROR_TS_*=0` set before launching the runtime reverts
them. Flips recorded before this date were true of the routing table and the
smoke; they became true of daily sessions on 2026-09-08.

**Denominator.** The 35 top-level `python -m memory <command>` entries, minus
the six explicitly owned by later Delivery Stories: `mcp` (DS9), `web`
(DS10 — since 2026-09-17 retired with a cutoff rather than ported, together with
its DS7.US9 hierarchy rider), `eval` (DS10 — the harness transfers to `ts/evals/` as a retirement
gate; DS8.TS1 decided ownership, DS8 never ported it), `runtime` (DS10 — its git-based
update/release half is redesigned under npm, not ported; TS1 ports the read
subcommands as branch coverage), `migrate-legacy` (DS10 — retired with a
documented cutoff, not ported), and `journey-projection` (DS10 — TS5 was
reassigned there on 2026-09-09 because its publisher cannot land while both
cores write; see History). Working denominator: **29** (30 until 2026-09-09;
32 until the 2026-09-07 decision).

**Production reality (2026-09-13, superseding the 2026-09-12 note).** All
sixteen leaves that were replay-gated at the start of DS8 answer from
TypeScript against a real provider on an unconfigured install, each with a
single-variable revert. The last two — `consolidate scan` and `shadow scan` —
flipped with
[DS8.TS2](../cv22-ds8-live-provider-cutover/cv22-ds8-ts2-port-the-cultivation-prompt-templates/index.md)
once their prompts were ported and digest-pinned. The `MIRROR_TS_EXTERNAL_ROUTES`
gate is retired (US3). No ported leaf answers from Python in production; the
replay-gated section below is empty for the first time since DS5 created it.

---

## Family status

| Family | Commands | On TS | Owner | Status |
|--------|----------|------:|-------|--------|
| Read-only deterministic | `detect-persona`, `journeys`, `memories` (listing) | 3/3 | DS2 | ✅ done |
| Deterministic writes | `identity set`, `journey set-path` | (subcommands) | DS4 | ✅ done |
| External under replay | `memories --search`, `consult` | 1/1 (+`consult`) | DS5 / DS8.US1 | ✅ done — **`memories --search` flipped ungated 2026-09-11** (live provider; revert `MIRROR_TS_SEARCH=0`); **`consult credits|ask` flipped ungated 2026-09-12** with DS8.US3 (revert `MIRROR_TS_CONSULT=0`) |
| Identity/journey reads & writes | `identity`, `journey`, `seed`, `init`, `descriptor`, `list`, `inspect`, `conversations`, `recall` | 9/9†‡ | DS7.US1 | ✅ done — **`descriptor generate` flipped ungated 2026-09-12** with DS8.US3 (revert `MIRROR_TS_DESCRIPTOR=0`) |
| Content & planning writes | `journal`, `tasks`, `week` | 3/3¶ | DS7.US2 / US11 | ✅ done — US2 ported the deterministic core; US11 flipped 2026-09-09; **`journal` and `week plan` flipped ungated 2026-09-12** with DS8.US3 (reverts `MIRROR_TS_JOURNAL=0`, `MIRROR_TS_WEEK=0`). 13/13 leaves ported |
| Memory cultivation | `consolidate`, `shadow` | 2/2 | DS7.US3 | ✅ done — **`consolidate apply` flipped ungated 2026-09-12** (DS8.US3); **`consolidate scan` and `shadow scan` flipped ungated 2026-09-13** (DS8.TS2); one revert for the tail, `MIRROR_TS_CULTIVATION=0` |
| mirror-mode orchestration | `mirror`, `mode` | 2/2 | DS7.US4 | ✅ done — **`mirror load --query` flipped ungated 2026-09-12** with DS8.US3 (revert `MIRROR_TS_MIRROR_QUERY=0`; the deterministic `mirror load` is outside that gate) |
| Extension context runtime | (`ext`/`extensions` context path) | — | DS7.TS2 | ✅ done |
| **Extraction lifecycle (deterministic core)** | **`conversation-logger`** | **partial** | **DS7.US5** | ✅ **done — 7/15 subcommands flipped** |
| Extraction lifecycle (composites & LLM tail) | `conversation-logger` remainder | 8/8‡ | DS7.US10 | ✅ done (2026-09-07) — `repair-journeys --apply` route waits for TS1's `backup` |
| Soul Mode | `soul` | 1/1 | DS7.US6 | ✅ done — flipped 2026-09-08; **`harvest save` flipped ungated 2026-09-12** with DS8.US3, which also gave it the provider the front door had never wired |
| Explorer Mode | `explore` | 1/1 | DS7.US7 | ✅ done — flipped 2026-09-09; **`story promote` flipped 2026-09-14** with DS7.US8 plateau 7, following the composed Builder revert; projection refresh delegated behind a DS10-owned seam |
| Builder/Ariad | `build` | 1/1 | DS7.US8 | ✅ **flipped 2026-09-16** — all 27 in-scope leaves answer from TS by default (revert `MIRROR_TS_BUILD=0`; `load` also follows `MIRROR_TS_SEARCH=0` and `MIRROR_TS_CONVERSATION_LLM_TAIL=0` through its composed decision); the twenty SQLite Workbench leaves stay on Python by name until DS10 retires them; **story closed 2026-09-16 through the TS front door itself** (self-hosting) |
| Ops/utility tail | `backup`, `repair-encoding`, `extensions`, `ext`, `welcome` (+ `runtime` reads§) | 5/5‡ | DS7.TS1 / TS3 / TS4 | ✅ **done — TS4 flipped 2026-09-16** — TS1 `backup`+`repair-encoding` flipped 2026-09-07; TS3 `welcome` flipped 2026-09-08 (+ `runtime` reads as branch coverage); TS4 `extensions`+`ext` flipped 2026-09-16 with the US1-deferred `list`/`inspect` branches, `identity edit`, and the two ES-001 write faces (reverts `MIRROR_TS_EXTENSIONS=0`, `MIRROR_TS_IDENTITY_EDIT=0`, `MIRROR_TS_CONVERSATIONS_LIFECYCLE=0`). See the [extension catalog per-leaf detail](#extension-catalog--per-leaf-detail-ds7ts4). `journey-projection` left this row for DS10 on 2026-09-09 with TS5 |

Deferred to later Delivery Stories (excluded from the denominator): `mcp`
(DS9), `web` (DS10), `eval` (DS10 — ownership decided by DS8.TS1), `runtime` (DS10, mutating half; reads are
TS1 branch coverage), `migrate-legacy` (DS10 retirement with cutoff),
`journey-projection` (DS10 — TS5, ported and cut over in the same act that
retires the Python publisher, so the `fcntl.flock` dual-writer window never
opens).

¶ The Content & planning row is counted per leaf since CR068. `tasks` is
9/9 routed; `week` is 1/3 (`view` on TS; `plan` is one LLM extraction and
`save` is **deterministic** — it reads the pending file and calls `add_task`,
which is already on TS — so the routing table's "LLM-gated" reason is wrong for
`save`); `journal` is 0/1 (one LLM classification plus one embedding, the
same shape as `soul harvest save`; no TS module exists). All four are owned by
DS7.US11.

† `conversations` covers its **listing read** (DS7.US1) and, since 2026-09-03,
`append` (DS7.US10 slice B′). A family marked done can still grow subcommands on
main — which is exactly how the 2026-09-02 routing defect happened — so "done"
here means "the subcommands that existed when it was ported", not "every argv
shape forever". `append` keeps its own explicit routing entry precisely so it
can never again be answered by inheritance.

‡ Branch residuals not counted in the top-level numbers above. Owed by
**TS4**: US1 deferred `list extensions|all` and
`inspect extension|runtime-catalog|llm-calls|embedding-provenance`, and
`identity edit` (US1 "kept it on Python" as an interactive `$EDITOR` seam —
but Python is deleted in DS10, so "keep" was never a disposition; it is a
`spawnSync($EDITOR)` port, assigned to TS4 on 2026-09-09). Owed by **US11**:
`descriptor generate` (US1 kept it "as the DS7↔DS8 live seam", but DS8 flips
live mode and ports nothing — its orchestration is US11's, same shape as
`journal`), and the ES-001 `conversations` metadata-lifecycle CLI faces
(`--metadata-lifecycle-dry-run|-demo|-preview-at-message|-apply`) whose
*engine* US10 already ported to `conversation/metadataLifecycle.ts` — only the
flags are unwired. Retiring in **DS10**: the one-shot
`--metadata-backfill-preview|-apply` flags. US10's `repair-journeys --apply`
residual closed with TS1 on 2026-09-07. The family counts are top-level
commands; these branches are the per-branch remainder the rule above requires
to stay visible, and the [Remainder](#remainder) consolidates them.

§ `runtime` is split by mutation (decision 2026-09-07). TS1 ports the read
subcommands `status|version|diagnose|release-notes` with
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
| `status`, `version`, `diagnose`, `release-notes` | DS7.TS3 | ✅ | ✅ default since 2026-09-08 (`MIRROR_TS_RUNTIME_READS=0` reverts) |
| `update`, `pull`, `stable`, `backup`, `release-doctor`, `release-promote` | DS10 (redesign under npm) | n/a | Python by explicit refusal, never by inheritance |

**Correction (2026-09-08, DS7.TS3).** The row above previously listed `latest`
and `pending` as `runtime` subcommands. They are **positional arguments of
`release-notes`** (`runtime release-notes [latest|<version>|pending]`), not
subcommands — the 2026-09-07 decision entry carried the same error. There are
exactly four read subcommands, and the routing table allowlists those four by
name: a subcommand Python grows later must not acquire a TS route because
`runtime` already has one.

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

## Remainder

Every leaf that does **not** answer from TypeScript in an unconfigured install,
with its owner. Built from `routing.ts` refusal reasons on 2026-09-09 (CR068).
When this table is empty except for the DS8 block, DS7 is done; when the DS8
block is empty too, the strangler has no Python fallback left on the command
surface. Additions here require an owner in the same edit — an unowned row is
the defect this ledger exists to prevent.

### Unported — deterministic

| Leaf | Owner | Note |
|------|-------|------|
| ~~`build` — 27 in-scope leaves (29 subcommands, **47** leaves in Python)~~ | DS7.US8 | ✅ **Answered by TS since 2026-09-16** (plateau 9), after the Navigator validated the gated route on the real home. Plateaus 1–7 ported all 27 leaves behind no route; plateau 8 put them through the production front door under a temporary `MIRROR_TS_BUILD=1` opt-in; plateau 9 made TS the default with `MIRROR_TS_BUILD=0` as the whole-family revert. See the [`build` per-leaf detail](#build--per-leaf-detail-ds7us8) below and the [US8 package](cv22-ds7-us8-builder-ariad-tree/index.md) |
| `build refinement-story create\|overview\|pull\|review\|coherence\|close\|park` (7), `build change-request` × 13 | DS10 (retire, cutoff) | The SQLite Refinement Workbench, superseded by CV20.DS12's document-first Workbench (US8 D1, decided 2026-09-09). **Twenty** leaves, not fifteen — `refinement-story review\|coherence\|close` and `change-request select\|confirm` were omitted from the earlier count. US8 refuses all twenty by name; `load`'s read-only `get_workbench_snapshot` is ported by US8 and deleted here |
| ~~`explore story promote`~~ | DS7.US8 | ✅ **Answered by TS since 2026-09-14** (plateau 7). Renderer ported in US7; the tail is Builder `load`, wired through `buildLoadRuntime.ts`, which plateau 8's `build` route reuses |
| ~~`extensions install\|uninstall\|expose-claude\|clean-claude`~~ | DS7.TS4 | ✅ **Answered by TS since 2026-09-16.** Graded by 26 recorded cases carrying the complete file tree of the home, the runtime target root, and the Claude project root, plus a live both-engine `extension_install` probe on a real-database copy |
| ~~`ext list`, `ext <id>`, `ext <id> bind\|unbind\|bindings\|migrate`~~ | DS7.TS4 | ✅ **Answered by TS since 2026-09-16.** 40 recorded dispatch cases and 24 binding/migration cases, plus the `ext_bindings` write probe |
| ~~`ext <id> <extension-subcommand>`~~ | DS7.TS4 | ✅ **Answered by TS since 2026-09-16.** The plan input was decided by the Navigator (D1, 2026-09-16): **both halves** — a declared `mirror-cli-v1` runtime on the manifest's existing `cli.subcommands[]` is executed directly, and anything else falls per-SUBCOMMAND to a `cli` mode of TS2's existing compat host, under DS10's single deletion gate. Validated against all seven installed extensions on a copy of the real home, and one real read-only subcommand on the real home |
| ~~`list extensions\|all`~~ | DS7.TS4 | ✅ **Answered by TS since 2026-09-16.** `all` composes DS7.US1's persona and journey renderers with this story's extension listing |
| ~~`inspect extension\|runtime-catalog\|llm-calls\|embedding-provenance`~~ | DS7.TS4 | ✅ **Answered by TS since 2026-09-16.** One command, two refusal classes: the catalog pair prints usage on stdout at exit 1, the ledger pair is argparse and exits 2 on stderr |
| ~~`identity edit`~~ | DS7.TS4 | ✅ **Answered by TS since 2026-09-16.** The 0600 buffer is removed on every path including the refusals; the save goes through the same `applyIdentitySet` as `identity set`. Left `PYTHON_ALLOWLIST` in the flip commit, so CI now fails if a skill reaches Python for it |
| ~~`conversations --metadata-lifecycle-apply\|-demo`~~ | DS7.TS4 | ✅ **Answered by TS since 2026-09-16.** `apply_metadata_lifecycle` ported over the engine US10 already had; graded on the report AND the row, including on real conversations from a copy of the Navigator's home. One `MIRROR_TS_CONVERSATIONS_LIFECYCLE=0` now reverts the whole ES-001 family, reads and writes together |
| `conversations --metadata-backfill-preview\|-apply` | DS10 (retire) | One-shot backfill of pre-ES-001 rows |
| `journey-projection` (all) | DS10 (TS5) | Publisher cannot land while both cores write (`fcntl.flock`) |

### Unported — LLM orchestration (port under replay; live is DS8's)

| Leaf | Owner | Note |
|------|-------|------|
| _(none — US11 closed this section on 2026-09-09)_ | — | `journal`, `week plan`, and `descriptor generate` are ported and now sit in the replay-gated block below |

### Ported and graded — replay-gated, Python in production until DS8

| Leaf | Ported by | Why it is still here |
|------|-----------|----------------------|
| _(none — DS8.TS2 emptied this section on 2026-09-13)_ | — | sixteen leaves at the start of DS8; every one now sits in the flipped table below with its revert variable |

How it emptied: `memories --search` with US1 (2026-09-11); the five close-tail
subcommands with US2 (2026-09-11); eight with US3 (2026-09-12) — `consult
credits|ask`, `mirror load --query`, `journal`, `week plan`, `descriptor
generate`, `soul harvest save`, `consolidate apply`; and the last two,
`consolidate scan` and `shadow scan`, with TS2 (2026-09-13).

The two scan leaves were the only ones that could not flip with their family.
TypeScript had never ported `CONSOLIDATION_PROMPT` or `SHADOW_SCAN_PROMPT`:
until TS2, `propose.ts` sent a fenced Markdown dump of the memories — 121 and
209 bytes against Python's 2,247 and 1,598 — with no task statement, no
untrusted-input guard, and no JSON output contract. Replay resolves by role and
never reads a prompt, so nothing caught it. US3 refused the two leaves live BY
NAME (`live blocked by DS8.TS2`) so the dependency could not be forgotten, and
TS2 ported the templates, pinned every assembled branch against bytes captured
from the real Python builders, deleted the block, and proved the flip live —
see that story's
[validation](../cv22-ds8-live-provider-cutover/cv22-ds8-ts2-port-the-cultivation-prompt-templates/validation.md).

**This table is what "DS8 done = zero" is audited against.** It cannot be
emptied before TS2 closes.

### Live in production — answered by TS against a real provider

| Leaf | Cut over by | Revert control | Evidence |
|------|-------------|----------------|----------|
| `memories --search` | DS8.US1 (2026-09-11) | `MIRROR_TS_SEARCH=0` | vector-space parity `cos=1.000000` against a stored Python-era vector; ledger row identical to Python's for the same query (`11` tokens, `2.2e-07`); unconfigured install degrades with **zero** ledger rows and logs `kind=config` |
| `consult credits\|ask` | DS8.US3 (2026-09-12) | `MIRROR_TS_CONSULT=0` | live `/credits` and `/generation` GETs on a new `getJson`; one priced `consult` row with the fetched cost, falling back to `computeCost` as Python's logger does; the two-message envelope reaches the model as an ARRAY, not as JSON text in one user turn |
| `mirror load --query` | DS8.US3 (2026-09-12) | `MIRROR_TS_MIRROR_QUERY=0` (the deterministic `mirror load` is untouched) | reception bounded by its own 10s tier, not the 60s extraction one; row priced (it was written unpriced before); front-door log carries `reception calls=1 answered=1` |
| `journal` | DS8.US3 (2026-09-12) | `MIRROR_TS_JOURNAL=0` | `journal_classification` + `embedding`, both priced; the embedding goes through `generateEmbeddingSafely` (CR075), so the retry, the AI-07 guard, and the ledger hook all apply |
| `week plan` | DS8.US3 (2026-09-12) | `MIRROR_TS_WEEK=0` (`week view` stays outside the gate) | one priced `week_plan` row; two items parsed and journey-attributed on the real home |
| `descriptor generate` | DS8.US3 (2026-09-12) | `MIRROR_TS_DESCRIPTOR=0` | one priced `descriptor` row per entity — a DELIBERATE divergence, since Python's `generate_descriptor` passes no `on_llm_call` and neither engine recorded this spend before; `calls=N` in the front-door log bounds the fan-out |
| `soul harvest save` | DS8.US3 (2026-09-12) | `MIRROR_TS_SOUL=0` | the leaf had NO provider on the front-door path at all before this; now embeds through the wrapper, and the fruit is cleared only after a successful write |
| `consolidate apply` | DS8.US3 (2026-09-12) | `MIRROR_TS_CULTIVATION=0` | a `merge` embeds through the wrapper with the ledger hook that had always existed and never been passed |
| `consolidate scan` | DS8.TS2 (2026-09-13) | `MIRROR_TS_CULTIVATION=0` | Python's real `CONSOLIDATION_PROMPT` assembled through `pyFormat`, byte-identical and digest-pinned; `prompt_tokens` 1362/1232/1186 live on a copy where the dump it replaced was ~50 (the smoke now asserts a floor of 400); a merge it produced was consumed by TS's own `apply`; the first live run hit a slow-provider window (2 transport failures beside a 28 s answer) and cleared on re-run |
| `shadow scan` | DS8.TS2 (2026-09-13) | `MIRROR_TS_CULTIVATION=0` | Python's real `SHADOW_SCAN_PROMPT`, same discipline; `prompt_tokens` 1251 (5 candidates) and 8285 (50 candidates) live; an observation it produced was applied by TS to `shadow/profile` |
| `conversation-logger switch\|session-end-pi\|session-end\|session-start (full)\|session-maintenance` | DS8.US2 (2026-09-11) | `MIRROR_TS_CONVERSATION_LLM_TAIL=0` (tail only; `MIRROR_TS_CONVERSATION_LOGGER=0` still reverts all fifteen) | live close tail on a real-DB copy: `extraction_status=ok`, 4 memories at 1536 dims, title/tags/summary within Python's caps, 10/10 ledger rows priced with bodies withheld, role sequence `extraction → task_extraction → embedding ×5 → conversation_title → conversation_summary → conversation_tags` |
| `build load` | DS7.US8 (2026-09-16) | `MIRROR_TS_BUILD=0`, and — because `load` COMPOSES the search family and the conversation close tail — `MIRROR_TS_SEARCH=0` or `MIRROR_TS_CONVERSATION_LLM_TAIL=0` each send the whole session start to Python; replay pair `MIRROR_TS_BUILD_LLM_REPLAY` + `MIRROR_TS_BUILD_EMBEDDING_REPLAY`, half a pair refused by name | live on two fresh copies of the real database, one per engine: stdout 39,250 B byte-identical INCLUDING the ranked block, two `embedding` rows each (`openai/text-embedding-3-small`, 102 tokens, $0.000002), the same 7 memories bumped and 10 access rows written; the close tail is graded by DS8.US2's evidence and fires only when the session has a previous conversation |

The first leaf in CV22 where TypeScript spends real money. `embedding` was the
highest-volume role in this home's ledger (171 rows, more than every other
role combined), which is why it went first: the substrate it required — the
fetch-based OpenRouter client, the AI-18 taxonomy, per-role timeouts, the cost
authority, and the one revert→replay→live precedence — is now built and reused
by DS8.US2/US3 for the remaining fifteen leaves.

### Out of the denominator (owned elsewhere, unported by decision)

`mcp` (DS9); **`web` (DS10 — retired with cutoff, not ported; Navigator decision 2026-09-17, which also retired the DS7.US9 hierarchy rider unported)**; `eval` (DS10 — DS8.TS1 decided the harness transfers to `ts/evals/` as a deletion gate rather than being ported at parity or retired); `runtime update|pull|stable|backup|release-doctor|release-promote` (DS10, redesigned under npm); `migrate-legacy` and `memory-rehearse-migration` (DS10, retired with cutoff); `journey-projection` (DS10, TS5).

---

## Content & planning writes — per-leaf detail (DS7.US2 / US11)

Three commands, thirteen leaves. US2 ported and flipped the ten deterministic
ones on 2026-08 under the family's routes; the three that cross the LLM or
embedding seam were reassigned to US5 in US2's prose, US5 was re-scoped
without them, and nothing inherited the work until CR068 (2026-09-09).

| Leaf | TS ported | Routed to TS | Owner | Note |
|------|:---------:|:------------:|-------|------|
| `tasks list\|add\|done\|doing\|block\|import\|delete\|sync\|sync-config` | ✅ | ✅ | US2 | nine leaves, allowlisted by name |
| `week view` (and bare `week`) | ✅ | ✅ | US2 | — |
| `week plan` | ✅ | ✅ flipped (replay-gated) | US11 | `extract_week_plan` (LLM) → similarity check → pending JSON file. The `LIKE '%fragment%'` contains-match is ported with its unescaped wildcards |
| `week save` | ✅ | ✅ flipped **ungated** | US11 | **no LLM** — the "LLM-gated" refusal reason CR068 found was wrong, and is corrected. Cross-engine pending-file proof: either engine writes, either consumes |
| `journal` | ✅ | ✅ flipped (replay-gated) | US11 | `classify_journal_entry` (LLM) → `add_memory` (embedding). AI-24 coercion, the 60-code-point fallback, and embed-before-insert all graded |

**Routed to TS: 13/13** since the US11 flip (2026-09-09). `journal` and
`week plan` reach TS only under the replay transport, so an unconfigured
install still answers them from Python until DS8 — the same DS7↔DS8 boundary
`soul harvest save` and the conversation close tail sit on. `mm-journal` now
enters the front door and its `PYTHON_ALLOWLIST` entry is removed, so CI would
fail if it regressed to Python.

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
| `repair-journeys` | ✅ | ✅ flipped (dry run 2026-09-07; `--apply` 2026-09-07 with TS1's `backup`) | — |
| `backfill-codex-session` | ✅ | ✅ flipped | — |

**Ported: 15/15. Routed to TS: 15/15** — slice A flipped 2026-09-02; US10
groups 1–3 flipped 2026-09-07 in the approved dependency order. The five
subcommands that cross the close tail answer from TS only under the replay
gate (unconfigured installs keep Python until DS8's live cutover).
`repair-journeys --apply` was the one bounded exception — Python gates the
mutating repair behind the dated zip archive `backup` produces, and the front
door's fixed-name pre-write snapshot is a weaker property — until DS7.TS1
ported `backup` on 2026-09-07; it now follows `MIRROR_TS_BACKUP` and answers
from TS with the dated zip taken first.

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

## `soul` — per-subcommand detail (DS7.US6)

Ten subcommands, seventeen leaves, **flipped 2026-09-08**: the family answers
from TS by default and `MIRROR_TS_SOUL=0` is the revert control, with no code
change and no data migration. The gate covers the whole family deliberately —
Soul is one ritual, and a half-flipped ritual cannot be reviewed in a live
session.

| Subcommand | TS ported | Routed to TS | Note |
|------------|:---------:|:------------:|------|
| `load` | ✅ | ✅ flipped | mode activation + sticky journey default |
| `listen` | ✅ | ✅ flipped | the per-turn ritual surface |
| `rite` | ✅ | ✅ flipped | four voices; `--question` legacy alias |
| `close` | ✅ | ✅ flipped | — |
| `review` | ✅ | ✅ flipped | `--origin`/`--journal` share one dest |
| `propose` | ✅ | ✅ flipped | proposal only; writes nothing |
| `apply` | ✅ | ✅ flipped | identity write; `--confirm APPLY` |
| `fruit set\|show\|clear` | ✅ | ✅ flipped | `runtime_sessions.metadata` |
| `harvest set\|show\|decline` | ✅ | ✅ flipped | promote-and-pop in one write |
| `harvest save` | ✅ | ✅ flipped (replay-gated) | the only leaf crossing the provider seam |
| `prompt self\|wisdom\|beauty` | ✅ | ✅ flipped | templates vendored into `ts/src/soul/prompts/` |

**The provider seam is one leaf, not the family.** `harvest save` calls
`add_journal` with title, layer, and tags all supplied, so Python's journal
classifier is unreachable and the embedding is the only external call. It
routes to TS only when `MIRROR_TS_SOUL_EMBEDDING_REPLAY` is configured; an
unconfigured install keeps Python for that leaf alone, exactly as US10's close
tail does. The live call is DS8's.

**Subcommands are allowlisted by name** (`TS_SOUL_SUBCOMMANDS` in
`routing.ts`), so a subcommand Python grows later reaches Python instead of
inheriting the route — the rule RS009/CR055 exists for.

### Flip checklist (2026-09-08)

| # | Check | Status |
|---|-------|--------|
| 1 | Goldens (surfaces, state, prompts, apply, harvest; 3.10 and 3.12) | ✅ five corpora, byte-identical |
| 2 | Real-DB-copy probes | ✅ `soul_state`, `soul_apply`, `soul_harvest_save` on the demo copy |
| 3 | Ritual E2E smoke through the front door | ✅ 161 checks, run with NO gate in its environment, so it proves the shipped default; both engines byte-identical on every read-only surface |
| 4 | Regression pass over flipped families | ✅ TS suite 1502; all eleven write probes green |
| 5 | Redaction check | ✅ `front-door.log` carries command and engine only — no ritual text |
| 6 | Revertibility exercised | ✅ `MIRROR_TS_SOUL=0` reaches Python on the real home, and wins over the embedding replay variable |
| 7 | Burn-down ledger updated | ✅ this entry |

**Navigator validation on the real home (2026-09-08).** Ten comparisons through
both engines byte-identical with matching exit codes, including two refusal
paths (`rite wisdom` without `--says`, `apply` without `--confirm`); the
identity write proven on two copies of the live database with the document and
the audit row identical; the revert exercised; `front-door.log` showing `soul
ts` with zero `fell_back` markers. The live Pi Soul Mode session is the
remaining acceptance and runs after this flip.

The first validation sheet handed to the Navigator was defective: a `read -ra`
loop is bash-only, so under zsh it compared two identical FAILURES of a bare
`soul` (which the allowlist routes to Python) and printed five passes while
measuring nothing. Recorded because it is the exact failure class this ledger
exists to prevent, and because it was caught by reading the output — `✓ soul :
identical`, with an empty subcommand — rather than by any automated check.

**Accepted divergence (Navigator decision, 2026-09-08).** Python's `soul`
parser accepts no `--mirror-home` and refuses it with argparse's exit 2; the TS
route accepts it like every other front-door command. The superset is accepted
rather than reproduced: the flag is an ERROR on Python today, so no caller can
depend on it, and every skill and hook invokes `soul` without it. Asserted on
both sides in the smoke so it stays visible. The same decision covers `explore`
when US7 reaches it. Recorded in
[decisions.md](../../../decisions.md#the-typescript-front-door-may-accept---mirror-home-where-a-python-command-refuses-it).

---

## `explore` — per-leaf detail (DS7.US7)

Three subcommands, fourteen leaves, **flipped 2026-09-09**: the family answers
from TS by default and `MIRROR_TS_EXPLORE=0` is the revert control, with no code
change and no data migration. The gate covers the family for the same reason
Soul's does: Explorer is one lived mode, and a half-flipped mode cannot be
reviewed in a live session.

| Leaf | TS ported | Routed to TS | Note |
|------|:---------:|:------------:|------|
| `load` | ✅ | ✅ flipped | mode activation + sticky journey default; calls the PUBLIC sticky writer, not Python's private one |
| `deactivate` | ✅ | ✅ flipped | — |
| `story show` | ✅ | ✅ flipped | plain-text context, not a boxed card |
| `story list` | ✅ | ✅ flipped | active → promoted → archived, then `updated_at DESC` |
| `story archive` | ✅ | ✅ flipped | deactivates the legacy runtime payload |
| `story clear` | ✅ | ✅ flipped | archive under the pre-DS8 command's name |
| `story update` | ✅ | ✅ flipped | `_UNSET` vs explicit clear |
| `story open` | ✅ | ✅ flipped | — |
| `story thicken` | ✅ | ✅ flipped | — |
| `story snapshot` | ✅ | ✅ flipped | — |
| `story attractors` | ✅ | ✅ flipped | — |
| `story experiment` | ✅ | ✅ flipped | — |
| `story handoff` | ✅ | ✅ flipped | writes five documents into the user's project |
| `story promote` | ✅ | ✅ **flipped 2026-09-14** (DS7.US8 plateau 7) | the one leaf whose engine follows the COMPOSED Builder decision |

**12 of 14 leaves answer from TS.** `story promote` was never a missing port:
`cmd_story_promote` ends by calling `build_cli.cmd_load`, so it could not leave
Python before the Builder tree did, and its surface renderer
(`render_no_builder_handoff`) was ported and graded in US7. It flipped at US8
plateau 7 with the leaf its tail depends on — as a route entry, plus the one
thing the earlier note did not anticipate: because the tail is a Builder session
start, `MIRROR_TS_BUILD=0`, `MIRROR_TS_SEARCH=0`, and
`MIRROR_TS_CONVERSATION_LLM_TAIL=0` each send this leaf back to Python too. The
decision is taken in `routing.ts`, **before** the route's first write, because
promote is not idempotent: promoting ends the story's activeness, so a second
run finds none and renders `no_builder_handoff`.

**Two-level allowlist.** `explore` is the first family with a nested subparser,
so `routing.ts` refuses an unknown `explore <sub>` and an unknown `explore story
<action>` separately. A single-level allowlist would claim `explore story
<anything>` — the `conversations append` defect (CR055) that exited 0 and
discarded the caller's data.

**The projection seam.** Every Explorer Story write asks Python to refresh the
Journey projection, because publication is linearizable through an `fcntl.flock`
lock Node cannot share. TypeScript ports the *decision* (`_projected_story`) and
delegates the *publication* to `journey-projection refresh`, whose deletion is
owned by [DS10's gate](../cv22-ds10-python-retirement-npm-distribution/index.md#journey-projection-refresh-seam-deletion-gate).
The delegation is best-effort by contract, so a broken seam is SILENT — which is
why the lifecycle smoke asserts a published `operational.json` file rather than a
log line, and why that check caught the seam resolving `--mirror-home` from the
command line only while every real runtime passes it through the environment.

**Accepted divergence.** Python's `explore` parser accepts no `--mirror-home`
and refuses it with argparse's exit 2; the TS route accepts it like every other
front-door command. The same superset Soul accepted on 2026-09-08, asserted on
both sides in the smoke so it stays visible.

### Flip checklist (2026-09-09)

| # | Check | Status |
|---|-------|--------|
| 1 | Three golden corpora byte-identical, regenerated under the determinism gate | ✅ |
| 2 | `explorer_story` write probe green on a real-database copy | ✅ |
| 3 | `explorer_handoff` write probe green — project trees byte-identical | ✅ |
| 4 | Lifecycle smoke: whole exploration, 200 checks, one disposable home | ✅ |
| 5 | Two-level allowlist refuses unknown subcommand and unknown story action | ✅ |
| 6 | `story promote` refused by name, routed to Python | ✅ |
| 7 | Projection refresh proven to publish, and proven NOT to on an unrelated edit | ✅ |
| 8 | Three `mm-explore` skill copies switched to the front door (12 invocations each) | ✅ |
| 9 | Oracle-drift tripwire clean with four `explore` oracles registered | ✅ |
| 10 | Navigator validation on the real home | ✅ |
| 11 | Gate default on (`MIRROR_TS_EXPLORE` absent → TS) | ✅ |

**Navigator validation, 2026-09-09.** Nine comparisons across the three real
journeys that actually carry Exploratory Stories — `mirror` (active, 3.3 KB
legacy payload, project path), `mirror-gui` (active, 2.1 KB payload, no project
path), and `finances` (promoted, payload inactive) — `show`, `list`, and
`snapshot` on both engines, all byte-identical, on populated surfaces of 13–75
lines. `finances show` returning the empty card on both engines is the
promoted-story path: an INACTIVE legacy payload must not be resurrected, and
neither engine resurrects it. Timing on the real home: TS 0.55s against Python
0.80s, with the TS path also taking a 49 MB pre-write snapshot.

**The first validation run was void and is recorded because it is the failure
class this ledger exists to catch.** The sheet's placeholder journey slug was
left literal, so all three comparisons hit the missing-journey path and printed
three PASSes for two identical empty responses. The sheet's own "confirm the
comparison ran something" step caught it — the same defect shape as US6's
bash-only `read -ra` sheet, arriving through a placeholder instead of a shell
builtin.

**Not covered by real-home evidence:** the legacy runtime-payload READ fallback.
All three journeys have durable rows, which win, and `finances`'s payload is
inactive. The fallback fires only when a durable row is absent while an active
payload exists, and no journey on the validated home is in that state. It is
covered by 20 golden scenarios and by nothing else — recorded rather than
implied.

---

## Extension catalog — per-leaf detail (DS7.TS4)

The family the ops tail closes on: the catalog, the dispatcher, the two
US1-deferred `list`/`inspect` branches, the editor seam, and the two ES-001
write faces US11 refused by name. **Flipped 2026-09-16** after accepted
Navigator validation.

| Leaf | Corpus | Status |
|------|--------|--------|
| `extensions list\|validate` | 32 recorded cases | ✅ TS |
| `extensions sync` | file trees in a disposable home and target root | ✅ TS |
| `extensions install` | trees + rows + a live both-engine probe on a real-DB copy | ✅ TS |
| `extensions uninstall` | trees + rows; data tables preserved (D4) | ✅ TS |
| `extensions expose-claude\|clean-claude` | project-root trees, overlay bytes | ✅ TS |
| `ext list` | recorded with the catalog reads | ✅ TS |
| `ext <id>` (subcommand listing) | 40 dispatch cases | ✅ TS |
| `ext <id> bind\|unbind\|bindings` | 24 cases + `ext_bindings` probe | ✅ TS |
| `ext <id> migrate` | 24 cases + `ext_migrations` rows | ✅ TS |
| `ext <id> <extension-subcommand>` | 40 cases; declared runtime executed directly, otherwise the compat host | ✅ TS |
| `list extensions` | recorded with the catalog reads | ✅ TS |
| `list all` | composed at the front door from three ported renderers | ✅ TS |
| `inspect extension\|runtime-catalog` | 32 cases (usage on stdout, exit 1) | ✅ TS |
| `inspect llm-calls\|embedding-provenance` | 21 cases (argparse, exit 2 on stderr) | ✅ TS |
| `identity edit` | 9 cases with scripted `sh` editors, streams + rows | ✅ TS |
| `conversations --metadata-lifecycle-apply` | 12 cases, report + row | ✅ TS |
| `conversations --metadata-lifecycle-demo` | whole document, ids aliased | ✅ TS |

**17 leaves, three reverts.** `MIRROR_TS_EXTENSIONS=0` returns the catalog,
the dispatcher, and both `list`/`inspect` branches; `MIRROR_TS_IDENTITY_EDIT=0`
returns the editor seam; `MIRROR_TS_CONVERSATIONS_LIFECYCLE=0` returns the
whole ES-001 family, reads included. The ledger reads ride the catalog gate
rather than being ungated as decision D2 wrote them, so that reverting "the
extension catalog work" does not leave two of its leaves on the new engine;
unhooking them is a one-line change if the Navigator prefers D2 literally.

### Flip checklist (2026-09-16)

| # | Check | Status |
|---|-------|--------|
| 1 | Four new golden corpora (`ext-dispatch`, `ext-catalog-writes`, `lifecycle-write`, `identity-edit`) byte-identical under the determinism gate, and verified identical under BOTH CI interpreters | ✅ |
| 2 | `ext_bindings` and `extension_install` write probes green on the demo copy in CI | ✅ |
| 3 | Both-engine catalog smoke — install through uninstall, twelve steps, streams, exit codes, and file trees — through the real front door with **no gate in the environment** | ✅ |
| 4 | Allowlists audited against Python itself: `TS4_EXTENSIONS_VERBS` against `cli/extensions.py`, `TS4_EXT_TOP_LEVEL_VERBS` against `cli/ext.py`, so a verb Python grows fails the build | ✅ |
| 5 | Redaction: account id, campaign name, and folder path sentinels absent from `front-door.log`, which records `leaf=<id>` and stops | ✅ |
| 6 | Revert drills: all three variables, one leaf each, Python in the log | ✅ |
| 7 | Regression: full TS suite (2,255), Python extension suite, oracle drift, skill parity | ✅ |
| 8 | Three skill copies switched to the front door; `identity edit` removed from the skill parity checker's Python allowlist | ✅ |
| 9 | Oracle-drift tripwire clean with `cli/ext.py`, `cli/inspect.py`, `cli/identity_cmd.py`, and `extensions/compat_host.py` registered | ✅ |
| 10 | Navigator validation accepted 2026-09-16 (steps 1, 3, 5 on the real home; the rest on copies of it and in CI) | ✅ |
| 11 | Gate defaults on (all three variables absent → TS) | ✅ |

**Navigator validation, 2026-09-16.** Step 1: `extensions list`, `ext list`,
`list all`, and `inspect llm-calls --summary` on the real home, byte-identical
on both engines. Step 3: `ext session-export folder list` on the real home,
identical output, with `ext ts exit=0 leaf=session-export` in the log and no
argument text. Step 5: `identity edit ego behavior` with the Navigator's own
editor — the save landed (`✓ ego/behavior updated`, confirmed at the row), an
unchanged buffer wrote nothing, and empty content was refused. Steps 2, 6, and 7
ran on copies of the same home through
[`ts/parity/ts4_home_copy_route.ts`](../../../../../ts/parity/ts4_home_copy_route.ts),
including `ext <id>` for all SEVEN installed extensions and real
`--metadata-lifecycle-apply` on one conversation per available decision state;
step 4 is the CI smoke. One state could not be exercised on real data and is
recorded rather than skipped: the home holds zero manually locked titles.

---

## `build` — per-leaf detail (DS7.US8)

Twenty-nine subcommands, forty-seven leaves in Python; **27 in scope, flipped
2026-09-16**: the family answers from TS by default and `MIRROR_TS_BUILD=0` is
the revert control, with no code change and no data migration. ONE gate for the
family, like Soul and Explorer: Builder is a lived mode whose whole lifecycle
writes one cursor row, and a half-flipped lifecycle cannot be reviewed. The
twenty SQLite Workbench leaves are outside the port and retire in DS10.

| Leaf | TS ported | Routed to TS | Note |
|------|:---------:|:------------:|------|
| `load` | ✅ | ✅ flipped | the only leaf that crosses the provider seam; composed decision before any byte; clone-role guard; `calls=N` and a degraded kind in the log, never the briefing-derived query |
| `inspect-method` | ✅ | ✅ flipped | read-only handle, no pre-write backup |
| `adopt` | ✅ | ✅ flipped | — |
| `prepare-templates` | ✅ | ✅ flipped | `if not path.exists()` preservation rule |
| `sync-cursor` | ✅ | ✅ flipped | cursor bytes are the contract (CAS on the serialized metadata) |
| `pull-candidates` | ✅ | ✅ flipped | read-only handle; `sorted(rglob)` component order reproduced |
| `pull-item` | ✅ | ✅ flipped | with Expand and the candidate-table grammar |
| `prepare-item` | ✅ | ✅ flipped | overwrites the event unconditionally, as Python does — see the plan's debt list |
| `plan-item` | ✅ | ✅ flipped | story package materialization; prints absolute paths raw (reproduced) |
| `approve-plan` | ✅ | ✅ flipped | story Plan authority, sha256 over canonical sorted-compact ASCII JSON |
| `cancel-plan-preauthorization` | ✅ | ✅ flipped | — |
| `check-implementation` | ✅ | ✅ flipped | read-only handle; exit 1 when blocked, on both engines |
| `validate-item` | ✅ | ✅ flipped | closure artifact `validation.md` |
| `review-item` | ✅ | ✅ flipped | closure artifact `review.md` |
| `coherence-item` | ✅ | ✅ flipped | closure artifact `coherence.md` |
| `done-item` | ✅ | ✅ flipped | closure artifact `done.md`; requests the Journey projection refresh through the DS10-owned seam |
| `set-flow-unit` | ✅ | ✅ flipped | absent `--unit` is the inspect face |
| `plan-delivery-story` | ✅ | ✅ flipped | the broader DS unfilled-section rule, kept separate on purpose |
| `approve-delivery-story-plan` | ✅ | ✅ flipped | — |
| `cancel-delivery-story-plan-preauthorization` | ✅ | ✅ flipped | — |
| `validate-delivery-story` | ✅ | ✅ flipped | — |
| `review-delivery-story` | ✅ | ✅ flipped | — |
| `coherence-delivery-story` | ✅ | ✅ flipped | — |
| `done-delivery-story` | ✅ | ✅ flipped | authored-roadmap Done preflight, walking `legacy/` like Python |
| `set-cadence` | ✅ | ✅ flipped | validates the profile BEFORE resolving the journey, unlike every other leaf |
| `release-intent` | ✅ | ✅ flipped | absent `--intent` is the inspect face |
| `continue-lifecycle` | ✅ | ✅ flipped | one surface per path; takes Coherence's evidence without running Coherence |
| `refinement-story` × 7, `change-request` × 13 | — | Python by name | DS10 retirement; refused with the owner in the reason, never inherited |

**27 of 27 in-scope leaves answer from TS.** The route is two-level: an unknown
`build <sub>` and an unknown `build refinement-story|change-request <action>`
are refused separately, and each of the twenty Workbench actions is named, so a
leaf Python grows later cannot acquire a TS route by inheritance (CR055's
class).

**Lazy by construction.** The whole Builder tree sits behind `builder/index.ts`,
imported only after routing has chosen TS. A loader-hook drill in CI answers
that module with a throwing one and proves `MIRROR_TS_BUILD=0` still reaches
Python while an unrelated TS command still answers — the general "eager front
door" case is a CR under RS009.

**Accepted spellings and divergences.** Python is the contract for what is
accepted as well as what is refused: `--option=value` and unambiguous
long-option prefixes parse as argparse parses them, and argparse's own refusals
(ambiguous prefix, inline value on a flag) exit 2. Two recorded divergences,
both the class Soul and Explorer established: argparse refusals carry a
one-line TS message rather than the `usage: __main__.py …` block, and the TS
route accepts `--mirror-home` / `--db-path` where Python's `build` parser does
not. Domain refusals keep Python's byte-exact `Error:` text at exit 1.

### Flip checklist (2026-09-16)

| # | Check | Status |
|---|-------|--------|
| 1 | Seven golden corpora plus the lifecycle, load, and command corpora byte-identical under the determinism gate (3.10 and 3.12) | ✅ |
| 2 | `builder_cursor_state` and `builder_artifacts` write probes green on the portable demo copy in CI; `builder_load` green on a copy of the real database (1536-wide corpus) | ✅ |
| 3 | Lifecycle smoke, three flows, 331 checks, TS through the real front-door process with **no gate in the environment** | ✅ |
| 4 | Two-level allowlist: 27 leaves on TS, twenty Workbench leaves refused by name, unknown additions to neither | ✅ |
| 5 | Redaction: every prose-bearing option and the briefing-derived `load` query absent from `front-door.log` | ✅ |
| 6 | Broken-core drill: `MIRROR_TS_BUILD=0` reaches Python when the Builder boundary throws | ✅ |
| 7 | Regression: conversation lifecycle smoke, Explorer smoke, `welcome --status-line` after a `load` | ✅ |
| 8 | Nine skill copies switched to the front door: `mm-build` ×3 (55 + 1 + 1 invocations), `mm-explore` ×3 and `mm-soul` ×3 (`build load`); `build` removed from the skill parity checker's Python allowlist | ✅ |
| 9 | Oracle-drift tripwire clean with `cli/build.py` and every in-scope Builder module registered | ✅ |
| 10 | Navigator validation on the real home (steps 1–3 and 6), accepted 2026-09-16 | ✅ |
| 11 | Gate default on (`MIRROR_TS_BUILD` absent → TS) | ✅ |

**Navigator validation, 2026-09-16.** Step 1: the four read-only leaves on the
real home, byte-identical on both engines. Step 2: a live `build load` on two
fresh copies of the real database, one per engine — 39,250 bytes of stdout
identical including the ranked block, the same ledger rows, the same access
rows. Step 3: a full story lifecycle on real-database copies and scratch clones
of this repository (`scripts/smoke_builder_real_copy.sh`), eight steps,
diff-clean on streams, cursor bytes, closure artifacts, and projection
receipts, with the harness proven to bite by a mutant. Step 6: the revert
identical with Python in the log, and CI's drill reviewed. Steps 4 (the
self-hosting closure) and 5 (a live Pi Builder session) run on the flipped
route and close the story.

---

## DB safety tools — per-command detail (DS7.TS1)

`backup` and `repair-encoding` are ported and wired through the front door
behind two independent gates, `MIRROR_TS_BACKUP` and
`MIRROR_TS_REPAIR_ENCODING`, **flipped on 2026-09-07**: both default on, and
`=0` is the per-command revert control with no code change and no data
migration. The backup gate also governs `conversation-logger repair-journeys
--apply`, whose only TS dependency is the dated zip: reverting the backup
reverts the repair with it.

| Command | TS ported | Routed to TS | Revert control |
|---------|:---------:|:------------:|----------------|
| `backup` | ✅ | ✅ flipped 2026-09-07 | `MIRROR_TS_BACKUP=0` |
| `repair-encoding` | ✅ | ✅ flipped 2026-09-07 | `MIRROR_TS_REPAIR_ENCODING=0` |
| `conversation-logger repair-journeys --apply` | ✅ (US10) | ✅ flipped 2026-09-07 | `MIRROR_TS_BACKUP=0` (or the family switch) |

**Runtime callers.** The Pi extension's session-shutdown `backup --silent`
now enters the front door (`runFrontDoor` in `.pi/extensions/mirror-logger.ts`)
and the `mm-backup` skill calls the front door; the Gemini hook's shutdown
backup and every other extension/hook call still go to Python directly
(RS009 CR). `runtime backup`, `repair-journeys --apply` on the Python side,
and `web/operations.py` keep calling Python's `backup()` in-process, which is
correct: Python is compatibility-only for this command now.

### Flip checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Goldens (`backup`, `repair-encoding`; determinism gate; 3.10 and 3.12) | ✅ |
| 2 | Real-DB-copy probe | ✅ `write_parity.py --probe repair_encoding`: 7 hits across five tables, one transaction, clean row untouched; `journey_repair_apply` still green |
| 3 | E2E smoke through the real front door | ✅ `conversation_lifecycle_smoke.ts` 87 checks: both engines' `backup` on the same file, Python's `zipfile` verifies both archives and reads the same restore image (names, sizes, CRC-32) from the TS one; `repair-encoding` dry run byte-identical across engines, TS apply, Python sees nothing left; `--apply` route on TS under the gate |
| 4 | Regression pass over flipped families | ✅ TS suite 1241 green; write probes green |
| 5 | Redaction check | ✅ `front-door.log` carries command and engine only — no path, no preview line, no payload |
| 6 | Revertibility exercised | ✅ `MIRROR_TS_BACKUP=0` and `MIRROR_TS_REPAIR_ENCODING=0` reach Python with identical output; the family switch still wins for `--apply` |
| 7 | Burn-down ledger updated | ✅ this entry |

All seven were green before the flip and re-verified after it: the smoke now
runs the TS steps with **no gate in the environment**, so it proves the
default route, and the `=0` steps prove the revert.

---

## History

| Date | Change |
|------|--------|
| 2026-09-16 | **US8 plateau 9: `build` flipped — all 27 in-scope leaves answer from TypeScript by default; `MIRROR_TS_BUILD=0` reverts the family.** After the Navigator ran and accepted validation steps 1–3 and 6 on the real home (four read-only leaves byte-identical; a live `load` on two real-database copies identical on all four faces including the ranked block; a full lifecycle on real-database copies and scratch clones diff-clean at every step through `scripts/smoke_builder_real_copy.sh`, whose harness was proven to bite; the revert identical with Python in the log). The flip commit changes the gate predicate, deletes the lifecycle smoke's internal opt-in so the same 331 checks now prove the shipped default, switches nine skill copies to the front door (`mm-build` ×3 with 55 + 1 + 1 invocations, and the `build load` line in `mm-explore` ×3 and `mm-soul` ×3), removes `build` from the skill parity checker's Python allowlist, and records the per-leaf table and this checklist. Landed just before it: the TS route now accepts argparse's `--option=value` and unambiguous-prefix spellings, a narrowing of the accepted grammar the plateau-8 panel caught. Found on the way and recorded rather than fixed: the real cursor read `prepare`, not `plan_approved`, because a resume session's `prepare-item` overwrote the approved Plan — Python's Prepare writes the event unconditionally, and TypeScript reproduces it. The story closed the same day through the route it validates: `plan-item`, `approve-plan`, `validate-item`, `review-item`, `coherence-item`, and `done-item` on the real cursor, all answered by TypeScript, with a fresh `backup` first and the dated zip restored into a scratch home and loaded before the first real write. **DS7 progress 12/15 → 13/15.** |
| 2026-09-14 | **US8 plateau 8 complete: all 27 `build` leaves enter the production front door under `MIRROR_TS_BUILD=1`; shipped default still Python.** The route adds honest TypeScript exit-2 argv refusals, a 27-leaf allowlist, explicit DS10 ownership for all twenty legacy Workbench leaves, lazy loading behind a `builder/index.ts` boundary, and metadata-only `leaf=` / `calls=` diagnostics. A half-configured composed replay now reaches the TypeScript refusal rather than falling into live Python, for both `build load` and `explore story promote`. The existing three-flow lifecycle smoke now drives TypeScript through the real front-door process and remains 331/331; a loader-hook drill proves `MIRROR_TS_BUILD=0` still reaches Python when the Builder boundary throws. `builder_cursor_state` and `builder_artifacts` joined the portable-demo CI loop; `builder_load` stays a real-1536-corpus probe by design. All in-scope Builder Python files are now on the oracle-drift tripwire. Next: Navigator validation, then the isolated plateau-9 flip. |
| 2026-09-14 | **US8 plateau 7 in flight: `build load` ported and graded — all 27 leaves now answer from TypeScript, still 0 routed.** The last leaf, and the only one crossing the provider seam. Graded in two halves: the pure one (the `■ BUILDER MODE ACTIVE` card and the query extractor, 21 + 10 cases) and the composition (six recorded invocations × four faces — streams and exit code, the `runtime_sessions` rows, the access the read left behind, and the `llm_calls` ledger). Its oracle needed a seam Python does not have: `build_load_oracle.py` runs the real `cmd_load` in a subprocess with every provider entry point patched to a fixture TypeScript also reads, behind a socket tripwire. That tripwire exists because the first version MADE LIVE CALLS — two modules patched, `intelligence/search.py` missed, and a repository `.env` supplied the key, so the golden briefly encoded real token counts. Three defects found in `_extract_query` while writing the pure half, all silent and all reproduced rather than repaired: a body line containing a section name is DROPPED from the query (and if it is the only line, the query collapses to the journey slug — a slug search where a briefing search was intended); the Portuguese section names are matched without Unicode normalization, so an NFD `Descrição` falls back the same way; and `[:500]` is code points, so a naive UTF-16 slice halves an astral briefing and silently changes the ranking. CI caught a fourth class the local run could not: the corpus staged its projects inside this checkout, so the clone-role guard read the developer's `.mirror-clone-role` and every case refused on a runner that has none — cases now stage a neutral checkout marker, verified by regenerating with the marker moved away. Recorded for Debt Review: exactly tied search scores are ordered differently by the two engines (numpy's argmax against the TypeScript loop — a SEARCH-family divergence the DS2 corpus never exercised), and `load`'s ordering depends on a live clock through the recency term. Nine mutants killed, one of which forced the merge out into a pure graded function because its first-occurrence rule is not observable through the command. |
| 2026-09-14 | **US8 plateau 6: 26 of 27 `build` leaves ported, 0 routed — one left.** `set-cadence`, `release-intent`, and `continue-lifecycle` answer from TypeScript; only `load` remains. Corpus at 112 sequences / 494 steps and 121 command cases, and the lifecycle smoke gained a third sequence (331 checks) covering release intent, a stepwise continuation refusal, autonomous cadence refused without limits, an unbypassable-event refusal under checkpoint, and bounded story authority recorded then withdrawn with the ordinary Plan gate surviving. Two plan corrections of the "written from reading rather than from code" class: `set-cadence` and `continue-lifecycle` have **no module at all** (both live entirely in `cli/build.py`, so the command corpus is their only oracle), and `continue-lifecycle` has **no multi-surface output** — every path prints exactly one surface, against the plan's and the skill's description. Three behaviors pinned that a port would otherwise invent: `set-cadence` validates its profile BEFORE resolving the journey, unlike every other leaf; `continue-lifecycle` accepts `--process`/`--project`/`--product`/`--difference` and ignores all four, taking Coherence's evidence without ever running Coherence; and it crosses Done printing nothing after its checkpoint where `done-item` prints the roadmap snapshot. Mutation testing earned its keep again — seven of eight mutants died at once, and the survivor exposed a case that could not fail: the guard-order case passed an explicit `--journey`, which always resolves, so it could not distinguish the two orders. Also fixed: the replay seeded `release_intent` as `null` where Python's `_KEEP` sentinel PRESERVES it, invisible until a scenario recorded an intent and then re-seeded. The Plan-stage panel was skipped for this plateau as a recorded decision — two leaves with no module, one 197-line module, and every renderer and guard idiom already ported and graded is a small slice by the collaboration strategy's own definition. |
| 2026-09-14 | **US8 plateau 5: 23 of 27 `build` leaves ported, 0 routed — the aggregate lifecycle joins the story one.** The six Delivery Story leaves plus `set-flow-unit` and the DS preauthorization cancel answer from TypeScript, with DS package and closure artifact materialization, DS Plan authority, and the **authored-roadmap Done preflight** — the first Builder guard that refuses on the CONTENT of the Navigator's repository rather than on cursor state. Corpus at 107 sequences / 469 steps / 244 surfaces / 57 refusals and 102 command cases; `PENDING_OPS` and `PENDING_LEAVES` empty again. A Plan-stage persona panel ran first and all four dissents changed the plan, not the code: two re-sequenced work into this plateau, two named corpus cases that did not exist. The three near-duplicates it protected are the plateau's real content — the preflight walks `legacy/` where every other roadmap reader excludes it (so `roadmapScan` takes the exclusion as a parameter); the DS unfilled-section rule is broader than the story one, so reusing the story helper would consume a preauthorization receipt against a Plan Python still calls unfilled; and `_replace_status` appends, so replacing a status reorders the bytes compare-and-swap matches. Evidence: seven mutants killed from a verified-green baseline, and the lifecycle smoke extended to a second sequence (215 checks) covering DS Plan through a `done-delivery-story` **refused by the preflight**, a graded authored edit that must publish nothing, and the close that then succeeds. Two harness defects found and fixed, both of the false-green class: `git checkout` cannot revert an untracked file, so a plateau's own new modules kept their mutants and two SURVIVED verdicts were fiction; and the replay recorded the preflight's issue list without ever asserting it. Recorded for Debt Review: `_is_done` is `casefold().endswith("done")`, so the dated `✅ Done (2026-09-14)` form this repository's own roadmap uses would BLOCK a DS closure. |
| 2026-09-14 | **US8 plateaus 3–4: 15 of 27 `build` leaves ported, 0 routed — and a whole Ariad lifecycle agrees on both engines.** The story lifecycle (`pull-item` with Expand, `prepare-item`, `plan-item`, `approve-plan`, `cancel-plan-preauthorization`) and story closure (`validate-item`, `review-item`, `coherence-item`, `done-item`) answer from TypeScript, with story-package and closure artifact materialization, the `if not path.exists()` preservation rule, and story Plan authority (sha256 over canonical sorted-compact ASCII JSON). Graded by `builder-lifecycle.golden.json` — 86 sequences / 274 steps / 161 surfaces / 40 refusals, generated from Python before the port existed — 80 command cases across the 15 leaves, and the new **`builder_artifacts` write probe** grading FILES on a copy of a real database. Closed by the **unrouted both-engine lifecycle smoke** (`ts/parity/builder_lifecycle_smoke.ts`, 18 steps, 131 checks, in CI): two disposable worlds, streams compared per step, the Builder runtime rows compared with `metadata` **byte for byte** (the probe canonicalizes that cell; compare-and-swap does not), every authored artifact compared, and the Journey projection compared as published documents plus receipt count through the real Python seam. It found no composition defect — the per-step corpora had already closed the gaps — and it was proven red first with three mutants (cursor key order, a closure-artifact heading, Done's dropped projection request). Two traps recorded rather than fixed silently: CR079's authored-artifact overwrite is pinned in BOTH directions, so adding the "obvious" existence guard to closure fails the corpus; and a deleted `MIRROR_USER` is restored by `memory.config`'s `.env` re-application, which made the smoke's first run compare TypeScript against a Python side that never started — a failure that presents as a pass. |
| 2026-09-13 | **US8 plateaus 1–2: 6 of 27 `build` leaves ported, 0 routed.** Card primitives, roadmap parsing, the Ariad DSL as data, the three activation surfaces, the delivery cursor, resume state, the surviving Workbench read, template generation, and the implementation guard — with `inspect-method`, `pull-candidates`, `adopt`, `prepare-templates`, `sync-cursor`, and `check-implementation` answering end to end behind no route. Graded by seven golden corpora (2137 TS tests) and the new **`builder_cursor_state` write probe, green on a copy of a real database** through the harness's fourteenth probe. The probe earns its place over the synthetic corpus by starting from a cursor the database already carried: a generation above zero, which is the only way to exercise carry-forward against a row this harness did not write. Byte parity of the cursor `metadata` is NOT what the probe proves — the harness canonicalizes that cell — and is pinned by `builder-cursor.golden.json` instead, because compare-and-swap matches on that exact string and a divergence would make `MIRROR_TS_BUILD=0` fail on its first write. Corrections recorded along the way: the leaf inventory (42 → 47, Workbench 15 → 20), and Python's Workbench-read asymmetry — Builder Home swallows a missing-tables error where `■ BUILDER RESUME` raises. |
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
| 2026-09-07 | **TS1 decisions recorded; denominator 32 → 30.** `runtime` splits by mutation: reads (`status|version|diagnose|release-notes`) port in TS1 slice 2 with `welcome` (**corrected 2026-09-08**: this entry originally listed `latest` and `pending` as subcommands; they are positional arguments of `release-notes`); the git-based update/release half is DS10's to redesign under npm, not ported. `migrate-legacy` retires unported in DS10 with a documented cutoff; `memory-rehearse-migration` retires unported in DS10, closing its 2026-04-17 open discussion. TS1 is 0/6 and sliced (1 `backup`+`repair-encoding`, 2 `welcome`+`runtime` reads, 3 extension catalog+`journey-projection`); slices 1–2 pull before US6. Nothing routed or deleted today. |
| 2026-09-07 | **Ops tail split into three technical stories** so each slice is its own Ariad pull under the one-active-item rule: TS1 (`backup`, `repair-encoding`), TS3 (`welcome`, `runtime` reads), TS4 (extension catalog, `journey-projection`, US1-deferred branches). DS7 story denominator 12 → 14; command denominator unchanged at 30. TS1 pulled. |
| 2026-09-07 | **TS1 plateaus 1–4 complete; nothing routed by default.** `repair-encoding` (text repair, scan, apply) and `backup` (dated zip via a ~120-line deterministic ZIP writer, staging + rename, retention) ported and graded by Python-generated goldens that pin the Unicode, whitespace, rounding, and retention-boundary divergence classes; both wired through the front door behind `MIRROR_TS_BACKUP` / `MIRROR_TS_REPAIR_ENCODING` (default off); `repair-journeys --apply` gets the zip through the logger runtime and prints the backup's lines before the findings, as Python does. Evidence: `repair_encoding` write probe on the demo copy, the lifecycle smoke extended to 87 checks with Python's `zipfile` reading the TS archive, both oracles in the drift tripwire, generators in the determinism gate. Found while planning and recorded in the TS1 plan: the Pi extension and Gemini hooks call Python directly and never enter the front door — flipped hook routes are reached by the smoke and by skills, not by live Pi sessions (RS009 CR at Debt Review). |
| 2026-09-07 | **TS1 flipped: `backup`, `repair-encoding`, and `repair-journeys --apply` route to TS by default.** `MIRROR_TS_BACKUP=0` / `MIRROR_TS_REPAIR_ENCODING=0` are the revert controls. The Pi extension's session-shutdown `backup --silent` and the `mm-backup` skill now enter the front door — the first hot-path extension call to do so; the smoke proves the defaults with no gate in its environment. Ops tail 0/6 → 2/6; the last recorded `conversation-logger` exception is closed. |
| 2026-09-08 | **TS3 flipped: `welcome` and the four read-only `runtime` subcommands route to TS by default.** `MIRROR_TS_WELCOME=0` / `MIRROR_TS_RUNTIME_READS=0` are the revert controls, and they revert independently — a bad per-turn status line must not drag diagnostics back with it. The per-turn status line now answers from TS on every turn without a Python start: the Pi extension has entered the front door since CR059, so the hot path flipped with the gate and needed no extension change. `runtime diagnose` stops reporting `core_migration_unknown: 017_journey_parent_column` on every install that has run the TS engine — the false alarm this story exists to remove, and the one intended divergence from the oracle. Checklist: 1296 TS tests; five goldens byte-identical under 3.10 and 3.12; stats-line and status-line probes green on the demo copy; the lifecycle smoke green at 110 checks proving the SHIPPED default with no gate in its environment, both engines compared side by side, and each gate reverted independently; a PATH-shim spawn spy proving the status line shells out to nothing; front-door log carries command/engine only. `mm-welcome` and `mm-release-notes` now invoke the front door. Ops tail 2/6 → 3/6; DS7 stays 8/14 until TS3 is done. |
| 2026-09-08 | **TS3 plateaus 1–5 complete; nothing routed by default.** The daily-visible tail — `welcome` (card and per-turn status line) and the read-only `runtime` subcommands — is ported and wired through the front door behind `MIRROR_TS_WELCOME` / `MIRROR_TS_RUNTIME_READS`, both default off. Graded by four new corpora (git/version, release notes, status, diagnose, welcome) covering the intended `017_journey_parent_column` divergence, the extension manifest and migration read side, and the update cache's exact bytes. Evidence: two new real-DB-copy probes (stats line, status line) green on the demo copy; the lifecycle smoke extended to 108 checks running both engines side by side; a PATH-shim spawn spy proving the per-turn status line shells out to nothing; `cli/runtime.py`, `cli/welcome.py`, and `extensions/migrations.py` in the drift tripwire; all five generators in the determinism gate. The `runtime` read routes are allowlisted by subcommand, so DS10's updater and release machinery are refused **by name**, never by inheritance. Two corpus defects found and fixed in the generators, not the assertions: the status generator baked the developer's real mirror home into a committed golden (`.env` is re-applied by `memory.config` at import with `setdefault`, restoring anything cleared before it), and the welcome generator recorded a TTL boundary the oracle cannot observe because it reads its own clock. |
| 2026-09-08 | **CV22.DS7.TS3 done.** Validation accepted by the Navigator on the real home and on a live Pi session: `welcome` and `runtime release-notes latest` byte-identical across engines, `runtime diagnose` reporting `Findings: 0` (exit 0) where Python still reports the `017_journey_parent_column` false alarm (exit 1), and `front-door.log` showing every unattended `welcome` on `ts` with zero `fell_back` markers. Debt Review deferred two findings: parity generators leaking the ambient environment into committed artifacts became **CR065**, and the oracle's uncaught `TypeError` on a naive front-door-log timestamp became **CR066**, both under RS010. Coherence found and fixed five authored-state drifts, including the canonical 2026-09-07 decision entry in `docs/project/decisions.md` still calling `latest`/`pending` subcommands. Captured separately after closure: **CR067** under RS001, a refused checkpoint rendering a hardcoded `Implement` stage across four lifecycle commands. DS7 progress 8/14 → 9/14; ops tail 3/6; command denominator 30. |
| 2026-09-08 | **US6 flipped: the whole `soul` family routes to TS by default.** `MIRROR_TS_SOUL=0` is the revert control and wins over the embedding replay variable. All three `mm-soul` skill copies (`.pi`, `.claude`, `plugins/mirror-mind`) now invoke the front door, 20 invocations each, so the flipped route reaches live sessions rather than only the smoke. `harvest save` remains replay-gated: it is the only leaf crossing the provider seam, and an unconfigured install keeps Python for that leaf alone until DS8. Checklist green with the smoke run with NO gate in its environment (161 checks), eleven write probes, and Navigator validation on the real home. Soul Mode 0/1 -> 1/1; DS7 command denominator 30. |
| 2026-09-08 | **US6 ported; nothing routed.** The Soul ritual -- 10 subcommands, 17 leaves -- is ported across five plateaus and wired through the front door behind `MIRROR_TS_SOUL`, absent by default. Five golden corpora byte-identical under 3.10/3.12/3.14; three real-DB-copy probes (`soul_state`, `soul_apply`, `soul_harvest_save`); the lifecycle smoke extended to 157 checks running the whole ritual through both engines on one disposable home, byte-identical on every read-only surface. Found and fixed on the way, as a Navigator-authorized scope amendment: US4's `activateOperatingMode` wrote `runtime_sessions.metadata` in JavaScript's JSON dialect where Python writes its own -- invisible because both the mirror-state golden and the write-parity harness compare that column by value, and Soul shares the same row. Found and left for Debt Review: `soul apply` with an unknown `--conversation-id` raises `sqlite3.IntegrityError` through a CLI that catches only `ValueError`; and Python's `soul` parser accepts no `--mirror-home`. |
| 2026-09-09 | **US7 flipped: the whole `explore` family routes to TS by default.** `MIRROR_TS_EXPLORE=0` is the revert control and wins over everything. All three `mm-explore` skill copies (`.pi`, `.claude`, `plugins/mirror-mind`) already entered through the front door before the flip — 12 invocations each, behavior-preserving while the gate was off — so the flip changed one predicate rather than 36 call sites and the engine at once. **11 of 14 leaves answer from TS**; `story promote` stays on Python by name until US8 owns Builder `load`, and its surface renderer is already ported and graded so that flip is a route entry and nothing else. Checklist green with the smoke run with NO gate in its environment (200 checks), two write probes, and Navigator validation on the real home: nine populated surfaces across `mirror`, `mirror-gui`, and `finances`, byte-identical on both engines, including the promoted-story path where an inactive legacy payload must not be resurrected. Explorer Mode 0/1 → 1/1; DS7 command denominator 30. |
| 2026-09-09 | **US7 ported behind `MIRROR_TS_EXPLORE`; nothing routed.** Explorer Mode — 3 subcommands, 14 leaves — is ported across five plateaus and wired through the front door behind a gate that is **absent by default**. Three golden corpora (52 surface scenarios, 12 story-state families, 35 redaction rows + 10 artifact writes) byte-identical under 3.10 and 3.12; two real-DB-copy probes (`explorer_story`, `explorer_handoff`, the latter grading FILESYSTEM state on a scratch project); the lifecycle smoke extended to 200 checks running a whole exploration — open, thicken, attractors, experiment, snapshot, handoff, list, archive, load — through the front door on one disposable home. **11 of 14 leaves reach TS.** `story promote` is refused by name (its tail is Builder `load`, US8); the two-level allowlist refuses an unknown subcommand and an unknown `story` action separately, because `explore` is the first family with a nested subparser. Found and fixed by the smoke on its first run: the projection seam resolved `--mirror-home` only from the command line, so under an ambient `MIRROR_HOME` — how every real runtime invokes it — it silently stopped publishing. Best-effort delegation means a broken seam is invisible, which is why the smoke asserts the published `operational.json` rather than a log line. Recorded divergence, same as Soul's: Python's `explore` parser refuses `--mirror-home` with argparse's exit 2 where the TS route accepts it. |
| 2026-09-09 | **Reorder reversed the same session: projection publication stays Python-owned until retirement; US7 resumes.** The dependency in the entry below is real, but the remedy was chosen before reading the subsystem's concurrency contract. `docs/product/architecture.md` states projection publication is *linearizable per Journey* through one cross-process lock; that lock is `filelock.FileLock` → `fcntl.flock` on `.mirror/projections/.publication.lock`. **Node has no `flock` in core**, and mkdir-based JavaScript lock libraries do not exclude against `fcntl.flock` at all, so a TS publisher and the Python publisher would write the same tree with no mutual exclusion for the entire transition — breaking the merge-after-lock manifest guarantee in a git-tracked directory. After Python is deleted there is one writer and no problem, so an early port buys nothing and costs a concurrency hole. Decision: publication stays Python-owned; TS5 keeps its identity but returns to the ops tail as its **last** item; US7 and later US8 request the refresh through one named Python seam that DS10 deletes with the rest. Needs a small `journey-projection` subcommand carrying coordinator semantics, because `rebuild-operational` always publishes where the coordinator skips an unchanged digest (probe: `status='unchanged'` on the second consecutive write) — Python surface knowingly added to a component being retired. US7 resumes at plateau 2 with a Navigator-authorized Scope B amendment. Denominators unchanged: 15 stories, 30 commands. |
| 2026-09-09 | *(superseded by the entry above the same day — evidence retained)* **DS7 reordered: the Journey projection seam moves ahead of Explorer and the Builder tree.** US7 plateau 1 landed (`d469a8f`) — the eleven Explorer Story renderers and the `△ EXPLORER MODE ACTIVE` card, 52 scenarios generated from Python, 54 tests green, `surfaces/explorer_story.py` on the drift tripwire, nothing routed. Reading terrain for plateau 2 found that **every Explorer Story write calls `store.request_projection_refresh(journey)`**, which compiles and publishes an Ariad operational projection into the user's project: a hermetic probe showed one `update_explorer_story` creating `.mirror/projections/ariad/operational.json`, `current.json`, a receipt, and the publication lock where nothing existed before. The subsystem is 2,221 lines under `src/memory/journey_projections/`, assigned to TS4 — scheduled *after* US7. The callers make the inversion explicit: `request_projection_refresh` has exactly two producer families, `services/explorer_story.py` (3 sites, US7) and `builder/` (20 sites, US8), and both were scheduled before the story that owns the seam. Navigator chose to split the projection contract out of TS4 into **TS5** and port it first, over absorbing 2,221 lines into US7, half-flipping Explorer to its read-only leaves, shelling into Python per write, or accepting silent projection staleness — the last being the `conversations append` class (CR055) the ledger exists to prevent. US7 pauses at its plateau-1 boundary with a written [handoff](cv22-ds7-us7-explorer-mode/handoff.md); its approved plan needs one Scope B addition on resume, the `_projected_story` change-detection comparison. Story denominator 14 → 15; command denominator unchanged at 30, since `journey-projection` was already counted in the ops tail. |
| 2026-09-08 | **CV22.DS7.TS1 done.** Validation accepted by the Navigator on the real home, including a real Pi session shutdown whose backup entered the front door (`memory_20260908_095020.zip`, `backup / ts / exit=0`). Debt Review deferred five findings with revisit triggers: the extension/hook front-door bypass became **CR059** under RS009; silent-failure exit code, torn-snapshot backup, 0644 archives, and cross-table slug repair became **CR060–CR063** under RS010. DS7 progress 7/14 → 8/14; ops tail 2/6. |
| 2026-09-09 | **US11 flipped: the content & planning tail routes to TS.** `week save` and the two ES-001 lifecycle READ faces answer from TS **ungated**; `journal`, `week plan`, and `descriptor generate` answer from TS **under the replay transport**, so an unconfigured install keeps Python until DS8 — the boundary `soul harvest save` and the close tail already sit on. Revert controls: `MIRROR_TS_WEEK=0`, `MIRROR_TS_JOURNAL=0`, `MIRROR_TS_DESCRIPTOR=0`, `MIRROR_TS_CONVERSATIONS_LIFECYCLE=0`, each independent; `week view` deliberately stays outside the `week` gate because US2 flipped it ungated and reverting `save`/`plan` must not drag it back. `mm-journal`'s three copies enter the front door and `journal` leaves `PYTHON_ALLOWLIST`, so CI fails if it regresses. Content & planning 10/13 → **13/13**. **Scope amendment (Navigator, option B):** `--metadata-lifecycle-apply` and `--metadata-lifecycle-demo` need the unported `apply_metadata_lifecycle` and are refused **by name** for **DS7.TS4**; the two `--metadata-backfill-*` flags stay DS10 retirements, also by name. Six ES-001 flags, six owners, no inheritance. Command denominator 29; DS7 stories 12/15. |
| 2026-09-09 | **CR068 paid: the ledger stops over-reporting, and the remainder gets owners.** The *Content & planning writes* row read `3/3 done` while `journal`, `week plan`, and `week save` answered from Python — reassigned to US5 in US2's prose, dropped when US5 was re-scoped, inherited by nobody. Corrected to per-leaf (`tasks` 9/9, `week` 1/3, `journal` 0/1) with a detail table in the shape the `conversation-logger` and `runtime` sections use. Reading `routing.ts` end to end for the correction found more of the same class: `descriptor generate` (US1 "kept it as the DS8 seam" — DS8 ports nothing), `identity edit` ("kept on Python" — Python is deleted in DS10), and the ES-001 `conversations` metadata-lifecycle flags ("own slice" — no slice claimed them; the engine is already in TS). And `week save` is not LLM-gated at all: it reads the pending file and calls `add_task`, which is on TS. Dispositions (Navigator, 2026-09-09): **DS7.US11** owns `journal`, `week plan|save`, `descriptor generate`, and the lifecycle dry-run/demo/preview/apply faces; **TS4** takes `identity edit` as a `spawnSync($EDITOR)` port; **DS10** retires the one-shot backfill flags. A consolidated **Remainder** table now lists every leaf that does not answer from TS in an unconfigured install with its owner — including the thirteen ported leaves that sit behind the opt-in `MIRROR_TS_EXTERNAL_ROUTES` gate and therefore answer from Python in production until DS8. New rule: the receiving story must name reassigned scope, or the scope has no owner. Two more decisions recorded the same day: **TS5 leaves DS7 for DS10** (its publisher cannot land while both cores write, so DS7 could never have closed on it) — command denominator 30 → 29, story denominator stays 15 after US11 joins; and **US8's D1 resolves to retire** the SQLite Refinement Workbench in DS10 (15 of 42 leaves). Captured separately: **CR072** (RS009) — nine skills whose routes are on TS still invoke Python directly. See [Decisions — CV22 makes the ported work real before porting more](../../../decisions.md#cv22-makes-the-ported-work-real-before-porting-more). |
| 2026-09-11 | **DS8.US1: the first live-provider cutover. `memories --search` answers from TS against a real OpenRouter call in an unconfigured install.** Sixteen replay-gated leaves → fifteen. The substrate the remaining fifteen reuse landed with it: a fetch-based OpenRouter client porting the OpenAI SDK's retry *policy* rather than the package (no SDK on the path of every paid call), the AI-18 taxonomy `timeout\|auth\|rate_limit\|malformed_output\|provider_error` with an error object whose enumerable surface is `kind/status/retryable` and nothing else, per-role timeouts under Python's env names, `compute_cost` ported at last (CR040 skipped it because consult fetches a real generation cost — an embedding call has no generation id, so Python prices that row from the static table and TS had to as well), and one `resolveProviderTransport` precedence (revert → replay → live) that US2/US3 consume instead of re-deriving per leaf. Replay stops requiring `MIRROR_TS_EXTERNAL_ROUTES` for this leaf: that gate was DS5's safety catch while replay was the *production* transport, and after the cutover replay is a test transport. **Navigator validation 2026-09-11:** vector-space parity `cos=1.000000` against a stored Python-era vector — the check that would have aborted the cutover had it failed; ledger rows identical to Python's for the same query (`11` tokens, `2.2e-07`, bodies withheld); unconfigured install degrades to lexical with **zero** ledger rows and logs `embedding_degraded kind=config`, so an expired key is now distinguishable from an outage without a re-run. Revert: `MIRROR_TS_SEARCH=0`. Two defects found were both in the *harness*, not the product — the cross-check embedded a null `context` where Python appends `Context: …` (it would have reported a low cosine and looked exactly like the failure whose documented response is to abort), and the smoke asserted ledger rows while calling the provider directly, bypassing the layer that writes them. Accepted known risk: Node's `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1`, so a proxied install degrades where Python would not. |
| 2026-09-11 | **DS8.US2 group 1 live: the conversation close tail answers from TS against a real model.** `switch`, `session-end-pi`, and `session-end` — the last of which fires **unattended from the Pi hook** — now reach a live provider on an install that configures nothing. Sixteen replay-gated leaves at the start of DS8 → twelve. Staged in US10's own dependency order: group 2 (`session-start` full, `session-maintenance`) keeps the replay transport until group 1 has been observed live on the real home, because those compose the close tail *with* backfill and orphan handling and can close several conversations in one run, multiplying any defect. Revert is tail-only (`MIRROR_TS_CONVERSATION_LLM_TAIL=0`), so the seven deterministic subcommands that have answered from TS since 2026-09-02 stay put during a live-provider scare. **Four defects surfaced during this story, none by the existing suite:** (1) the port had dropped Python's embed-all-then-insert ordering (AI-03/CV9.E2.S9), so a live embedding failure mid-extraction left partial memories the retry would duplicate — invisible under replay, where embeddings never fail; (2) extraction's embedding rows were never priced, because US1 priced the *search* hook only and pricing is a per-call-site decision; (3) the close-tail **metadata** roles (title/tags/summary) log through a different ledger than extraction and were still unpriced after (2) — found by the live smoke on real data, 7/10 rows priced; (4) a half-configured replay fixture used to fall back to Python, which is *not* safe once TS can go live, because Python has no replay transport and would spend on the live provider anyway — it now refuses by name. Also corrected: the conversation title cap is 160 (`_clean_title_suggestion`), not the 60 code points the plan claimed — that is the journal fallback from US11. |
| 2026-09-11 | **DS8.US2 group 2 live: the whole close-tail family answers from TS.** `session-start` (full run) and `session-maintenance` follow group 1 after it was observed live on the real home. Sixteen replay-gated leaves at the start of DS8 → **ten**, all of them DS8.US3's low-traffic tail. Group 2 validated on a real-DB copy with the multi-conversation case its staging existed for: one `session-maintenance` run extracted two conversations, 11 ledger rows, every one priced with bodies withheld, both `extraction_status=ok`, and the per-conversation embedding counts matching the memory deltas exactly (1 summary + n memory embeddings → n new memories) — which is the plateau-1 atomicity contract holding under a real run rather than a fixture. Run cost: $0.0032. `session-start --fast` deliberately stays outside the revert: it makes no model call, so a close-tail scare must not drag it back, exactly as `week view` sits outside the `week` gate. A first maintenance run on an untouched copy was a no-op (no work due) and made zero live calls — worth recording because "exit 0" alone would have looked like evidence and was not. |
| 2026-09-13 | **DS8.TS2: the replay-gated table is empty.** `consolidate scan` and `shadow scan` — the two leaves US3 refused live by name because TypeScript sent a fenced memory dump where Python sends a 2–3k-character instruction — now send Python's real `CONSOLIDATION_PROMPT` and `SHADOW_SCAN_PROMPT`, assembled through `pyFormat` and graded against bytes **captured** from the real Python builders (`send_to_model` stubbed) rather than re-composed. Three pins: raw template bytes, per-branch SHA-256, and replay fixtures that refuse one byte of drift for both roles. The owner-name and identity-context inputs `cmd_scan` resolves are ported with Unicode `\w` and code-point slicing; the `consolidate_cmd` hardcoded owner name is deliberately not ported (D1, CR014). A four-lens plan review added the live witness the hermetic pins cannot give — a `prompt_tokens` floor in the smoke — and a hard stop where the prompt engineer reads the assembled text before it spends. Live on copies: both leaves answered, rows they produced were consumed by TS's `apply`, the tail reverts with `MIRROR_TS_CULTIVATION=0`. Sixteen replay-gated leaves at the start of DS8 → **zero**. Captured: **CR080** (the consolidation prompt's identity-context block) and **CR081** (typecheck `ts/parity`). Remaining in DS8: TS1, the `eval` ownership decision. |
| 2026-09-13 | **DS8.TS1: `eval` gets an owner, and the release gate gets a defect report.** The candidate row asked whether the harness is ported or retired; measured, it is neither — the instrument's subject moved. Every live eval module imports a Python pipeline function while TypeScript answers eight of those nine surfaces in production, and DS10's index did not mention `eval` at all, so retirement would have deleted the model-behavior release gate without a decision. Ownership transfers to `ts/evals/` as a **DS10 deletion gate** (six items: the Python contract, the live transport, a recorded disposition per module, injection probes made individually blocking, the doc updates, and deletion only after those). `eval` is re-attributed from DS8 to DS10 here in all three places. The Navigator-run `eval --all` — this home's first, 11/12 with `routing` the only failing module, matching D-005's recorded score exactly — confirmed the Python harness remains a valid interim gate and left sixteen JSONL records as the baseline the TS harness will diff. It also surfaced **D-017**: `scene` reported `5/6 passed ✓ PASS` with its injection probe **obeyed**, because a security probe is averaged with quality probes against one threshold — so a fence regression on any of the six fenced surfaces cannot trip the gate. An authorized n=5 confirmed AI-22's documented residual rather than a regression (5/5 resisted, pin unchanged). **DS8 is 5/5 with every done condition met**; the parent collapse and the release-intent decision are the Navigator's. |
| 2026-09-16 | **TS4 flipped: the extension catalog family answers from TS, and the ops tail closes.** Seventeen leaves — `extensions` ×7, `ext` ×5 including the dynamic `<id> <subcommand>`, `list extensions|all`, `inspect extension|runtime-catalog|llm-calls|embedding-provenance`, `identity edit`, and the two ES-001 write faces — answer from TypeScript by default. Three independent reverts: `MIRROR_TS_EXTENSIONS=0`, `MIRROR_TS_IDENTITY_EDIT=0`, `MIRROR_TS_CONVERSATIONS_LIFECYCLE=0` (which now returns the whole ES-001 family, reads included). D1 was decided by the Navigator and amended at implementation: a declared `mirror-cli-v1` runtime hangs off the manifest's EXISTING `cli.subcommands[]` rather than a new `commands[]` array, and the fallback to the compat host is per SUBCOMMAND, so an author migrates one command at a time. `identity edit` left `PYTHON_ALLOWLIST`, and four Python modules joined the drift tripwire. Two defects were found in already-flipped code while doing it: the US11 lifecycle READ face selected three of the five columns its engine reads (every field disagreed for any conversation with a summary or tags), and plateau 3's `runMigrate` normalized a path Python prints raw. Ops/utility tail 3/5 → **5/5**; the *Unported — deterministic* table now holds only DS10's retirements. |
