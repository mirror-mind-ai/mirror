[< CV9.DS10](../index.md)

# Plan Review: The CV9 Re-Baseline, 2026-11-07

The plan reviewed here is the one the Driver drafted on 2026-11-07 to restructure CV9:
a rewritten done condition, the earlier epics re-stated, and Delivery Stories DS10 to
DS19 in place of the stale list. Seven personas reviewed it, each for the kind of
decision it makes. The prompt-engineer was left out, because the plan changes no
prompt. This file keeps what each persona found, what the Driver changed because of it,
and what the Navigator decided. Nothing in it ran against a person's data.

## What the Driver checked before drafting

- **The ranking of 2026-10-28** (conversation `94256606`) put "re-baseline what 1.0
  means" first. A follow-up (`a56727f4`) compared CV9's done condition with the code.
  The Driver re-checked both against the repository on 2026-11-07.
- **The ranking was made from index titles and the audit's gate table**, not from the
  status banners. Its item 8 (AI-20 and AI-21) was already settled: AI-20 by the
  [decision of 2026-07-17](../../../../decisions.md), AI-21 by documentation on
  2026-07-23.
- **`mirror build pull-candidates`** listed two candidates in CV9, and recommended one:
  `CV9.E2.S2` (External Extension Runtime Surface Parity, written for Gemini CLI and a
  Python projection command) and `CV9.E2`. Both are stale.
- **CI** has no coverage tool and no threshold (`.github/workflows/`, `package.json`).
- **`mirror web`** answers `Unknown command: web`. The console was retired on
  2026-09-17.
- **`src/`** does not exist. CV22.DS10.TS5 deleted the Python core.
- **The journey CLI** has the status read, `set-path`, and `update`. Create, move, and
  delete exist only as `mirror-mind/desktop` calls (CV24.DS8, CR200). Nothing renames.

## The panel

### product-designer

- **Mirror is already public.** It publishes to npm, has a stable channel, and ships a
  GitHub Release per promoted version. So 1.0 is not the day a stranger can get Mirror.
  It is the day the project promises something, and `versioning.md` never says what
  stays stable. Add a story that names what a person or a host can rely on: skill names,
  CLI verbs, `mirror-mind/desktop` under `DESKTOP_API_VERSION`, the extension contract,
  MCP tools, the migration of any 0.x home, and how a breaking change is announced. The
  cutoff record in `docs/releases/pending-cutoffs.md` is the format.
- **Name the main path.** Getting Started calls Pi the preferred harness and Codex Plus
  the best subscription path. The first-run promise should be excellent there, and
  honest at each other runtime's measured level. "First run on five runtimes" makes the
  gate five times bigger.
- **Keep the gate about users.** CR177 only happens to contributors working in a clone.
- **Journey reshaping should gate 1.0.** A story inside CV9 that does not gate 1.0 is
  parked. Phrase it as "a person can reshape their journeys without losing a record":
  today the only ways are delete-with-records or hand-written SQL, which is the data
  loss 1.0 exists to prevent. The Navigator's own reorganization validates the story;
  it is not the outcome.

### quality-assurance

- **Add a closing story: a stranger's first week, rehearsed on a release candidate.**
  Install, `init`, key, seed, a Mirror Mode conversation, session end, memories
  extracted and recalled the next day, backup, and update. Run it once on a fresh home
  and once as an update of a copy of a long-lived home, published as `1.0.0-next.N`.
  CI's package smoke already covers install from nothing on Linux; the rest is a
  recorded route in the style of CV9.E6.S6.
- **Make the done condition a table:** claim, story, how it is checked, evidence. Two
  current bullets could not be checked by anyone ("audited and confirmed", "high
  coverage"). E4 shows why it matters: its audit predates the system it vouches for.
- **Replace "CI remains green".** True of every merge. The release row should read:
  the release commit passes every CI gate and `eval --all`.
- **Give the recording story a regression path per runtime.** Pi has no standalone
  smoke (the parity matrix says so), so the fix for D-029 lands with the extension's own
  harness test.

### database-architect

- **The ids story's premise was wrong.** [CR097](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr097-new-ids-are-32-bits-because-the-oracle-s-were.md)
  says a collision fails the insert, the import rolls back, and the next session start
  retries with fresh ids: "nothing has been lost". There is nothing to repair. The one
  silent path is `ON CONFLICT(id) DO UPDATE` on exploratory stories
  (`ts/src/explorer/story.ts`). The fix is wider ids and a safe upsert, as one story
  inside the recording Delivery Story.
- **The list of tables a rename must touch already exists.**
  `JOURNEY_DELETION_INVENTORY` in `ts/src/journey/journeyDeletion.ts` names every core
  table that references a journey, and `ts/test/journey/journeyDeletion.test.ts` fails
  when a table gains a journey column with no decision recorded. Rename must read the
  same list, so no table is handled by one operation and forgotten by the other.
- **That test has a blind spot.** It skips tables whose names start with `_` and looks
  for columns whose names contain "journey". `_ext_bindings` stores a journey in
  `target_id`, with `target_kind = 'journey'`, and no journey code touches it. Reading
  the code, journey deletion leaves its bindings behind, and
  `selectExtensionBindings` matches by slug without checking that the journey exists, so
  a new journey with the same slug picks them up. A rename would silently orphan them.
  Captured as [CR202](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr202-a-deleted-journey-leaves-its-extension-bindings-behind.md).
  Found by reading, not yet reproduced.
- **A rename must also** move both identity rows (`journey` and `journey_path`, which
  [CR094](../../../../refinement/rs004-identity-resolution-fidelity/cr094-two-journey-identity-layers-drift-with-no-consistency-mechanism.md)
  shows already drift apart); update each child's `parent_journey`, in the metadata and
  the column; decide what to do with `ext_*` rows (show and rewrite them as CR200 shows
  and deletes them, or refuse and name the extension); and deal with seed files, which
  `mirror seed` reads from `identity/journeys/` by slug, so a later seed would recreate
  the old slug from its file.
- **The rename story also closes
  [CR063](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr063-keep-journey-slugs-consistent-across-tables-in-repair-encoding.md)**,
  which asks for the same operation: the key and every referencing column, changed in
  one transaction.

### security-engineer

- **The privacy story fixes leaks but never states where data goes.** REFERENCE has a
  "Data at rest" section and no counterpart for data that leaves the machine. Today
  that is the identity and memories sent to the runtime's model with each turn; every
  closed transcript sent to OpenRouter and the provider serving the pinned model;
  memory and search text sent for embeddings; and, with `consult`, the full identity
  sent to any model the person names (`ts/src/consult/core.ts` has no reduced mode).
  For someone trusting Mirror with intimate material, that statement is the
  protection, so it is the story's first outcome.
- **Order by severity.** [CR197](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr197-the-hook-wrappers-and-the-mcp-locator-accept-a-relative-mirror-bin.md)
  lets Node run a JavaScript file from the project a session was opened in, when
  `MIRROR_BIN` is a relative path: code execution from an untrusted directory, the class
  CR192 closed in v0.39.5. Ship it as a patch now, not inside a story. CR098 and D-028
  expose the prompt to other processes on the same machine; real, but lower.
- **CR182 and CR195 are not user privacy.** They are tests writing into the developer's
  real home, which is release hygiene.
- **CR136 is cheap.** It is mostly a repository setting, a branch policy on the
  `release` environment, plus a recorded decision. Do it early.

### devops-engineer

- **The extensions story's premise was out of date.** CV21.DS5 already delivered
  CV9.E2.S2: one generated plugin per home, with `review-copy` and a `command-skill`
  measured live on Claude Code, Codex, Antigravity, and Grok on 2026-10-20. Close S2 as
  superseded. What is left is CR146, an authoring feature already tracked in RS011, and
  CR177, which only affects contributors. Neither is in the gate.
- **Name the supported platforms.** REFERENCE says POSIX (macOS and Linux) on Node 24
  or newer, with Windows covered by the separate installer repository. CI runs Ubuntu,
  macOS, and a Windows install-kind job. Claim exactly that.
- **Pin the runtime claim to the parity matrix**, re-measured close to release. Each
  row already records the version and the date it was measured on.
- **Rehearse 1.0 as an update too.** Its first users are 0.x users.
- **Dissent: whether the journey story gates 1.0.** It depends on nothing else in CV9
  and is the Navigator's current need. Ship it first as a minor release; once it is
  done, whether 1.0 waits for it stops mattering.

### ai-engineer

- **The failures story is bigger than configuration typos.** Per
  [CR178](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr178-a-configuration-error-counts-as-an-extraction-attempt-and-nothing-releases-a-quarantine.md),
  any failure counts as an extraction attempt, and three attempts quarantine a
  conversation for good. A provider outage that lasts through three attempts therefore
  quarantines every conversation that closes during it. The outcome: only a failure
  caused by the conversation itself counts against it; configuration, authentication,
  timeout, rate-limit, and server errors leave it pending; a quarantine can be released.
  CR188 needs the same classification, and the transport already sorts failures by
  kind, so the two pair.
- **Do not build a fallback model for 1.0.** Record AI-08 as carried past 1.0. The
  audit also still listed AI-18 and AI-19 as open; the Driver then checked, and CV22.DS8
  and CV22.DS9 closed them.
- **Put CR184 next to D-022 in the release story.** The extraction eval's prompt hash
  leaves out the summary prompt its probe sends, so the upgrade playbook's prompt-hash
  check is incomplete. Both make a green `eval --all` mean less than it says.
- **Re-run `eval --all` on the pinned model at the release candidate.** Provider-side
  behavior can drift after a model is chosen.

### writer

- **Use one style for titles.** The draft mixed sentences with labels. A label names a
  topic; a sentence names what becomes true, and only that can be checked.
- **The CV's subtitle was out of date.** "Refactoring, Stabilization, and Release
  Preparation": the refactoring was E1, which CV22 superseded.
- **"Trusts it" is a feeling.** End the goal on what Mirror does: it does not lose,
  misfile, or leak what people tell it, and it says what it sends where.
- **The docs re-audit needs a method, or it repeats E4.** A claims list: each claim in
  README, Getting Started, and REFERENCE checked against code or a run, with a verdict.
  CR157, CR174, and CR130 are claims already known to be wrong.

## What the Driver changed

The Driver's first draft was wrong in three places, and the review corrected them:

1. The ids story assumed collisions needed repair. Nothing persisted, so it became a
   story inside the recording Delivery Story.
2. The extensions story assumed parity was open. CV21.DS5 delivered it, so it left the
   gate and S2 closed as superseded.
3. Some items sat in the wrong story. CR182 and CR195 moved to release trust, and CR157
   to the docs re-audit.

The revised list, in the order the Driver would do it, is the Delivery Stories table in
the [CV9 index](../../index.md#delivery-stories).

## What the Navigator decided

On 2026-11-07 the Navigator answered yes to all four questions the review left open:

1. The three corrections and the revised list stand.
2. The journey story gates 1.0, and runs second.
3. The story that states what 1.0 promises to keep is in.
4. CR197 ships now as a patch, outside the gate.

The decision is recorded in [Decisions](../../../../decisions.md#cv9-is-re-baselined-on-the-typescript-core).
