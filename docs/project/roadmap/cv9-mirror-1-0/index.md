[< Roadmap](../index.md)

# CV9 — Mirror Mind 1.0: Stabilization and Release Preparation

**Status:** 🟢 In Progress — re-baselined 2026-11-07 by [CV9.DS10](cv9-ds10-the-1-0-done-condition-describes-the-system-that-exists/index.md)
**Goal:** Make Mirror Mind something a person can rely on: it does not lose, misfile, or leak what they tell it, it says what it sends where, and every release that reaches them is one the project can vouch for. 1.0 is the day the project starts promising that, and says what else it will keep stable.

---

## What This Is

CV9 was written on 2026-04-30 as a refactoring of the Python core and a hardening of its
runtimes. Since then CV21 packaged Mirror once as a plugin plus an MCP server, CV22
replaced the Python core with TypeScript and deleted `src/`, and CV24 opened the core to
Mirror Desktop as a library. The old done condition described a system that no longer
exists, and ticking every bullet would still have left known ways to lose data. It was
rewritten on 2026-11-07 ([the decision](../../decisions.md#cv9-is-re-baselined-on-the-typescript-core),
[the plan review](cv9-ds10-the-1-0-done-condition-describes-the-system-that-exists/evidence/2026-11-07-plan-review.md)).

Mirror can already be installed by anyone: it publishes to npm, has a stable release
channel, and ships a GitHub Release for each promoted stable version. So 1.0 is not the
day Mirror becomes available. It is the day the project promises something, and the work
left is whatever stands between today's Mirror and that promise.

The promise has five parts, and each Delivery Story below belongs to one:

1. **Memory integrity.** Every conversation is recorded completely and in the right
   place, a failure never loses a person's text or silently stops learning, and a
   journey can be reshaped without losing a record (DS11, DS12, DS13).
2. **Privacy.** A person can read what Mirror sends where, and nothing leaks on the way
   (DS14).
3. **First run.** A first run uses the home it is given and fails in one sentence
   (DS15).
4. **Release trust.** Every release is one the project can vouch for, and a stranger's
   first week was rehearsed before 1.0 shipped (DS16, DS19).
5. **What stays stable.** 1.0 names the surfaces it promises to keep and how a breaking
   change is announced, and the docs say what the system does (DS17, DS18).

---

## Scope of the Promise

- **Runtimes.** Pi, Claude Code, Codex, Antigravity, and Grok Build. The first run is
  built for the main path: Pi, the preferred harness in Getting Started. On the other
  four, Mirror behaves as the
  [parity matrix](../../../product/specs/runtime-interface/index.md#parity-matrix) says
  it does, at the level measured there, and DS19 re-measures it before 1.0.
- **Platforms.** macOS and Linux on Node.js 24 or newer. Windows goes through the
  separate installer, which owns its own support
  ([REFERENCE](../../../../REFERENCE.md#platform-envelope)). CI runs Ubuntu and macOS,
  and a Windows job for the install kind.
- **Channel.** The npm package, and the `stable` release channel.
- **Homes.** What 1.0 promises about a home made by an earlier version is DS17's to
  state, and DS19 rehearses it on a copy of a long-lived home.

---

## Earlier Epics

Written before CV21, CV22, and CV24. Each row says what is true of the epic today.

| Code | Epic | Status today |
|------|------|--------------|
| CV9.E1 | Boundary Hardening | ⚪ Superseded by CV22. Its targets were the `store.conn` calls in `src/memory/cli` and the SQL in `RuntimeSessionService`, both in the Python core that CV22.DS10.TS5 deleted. Whether the TypeScript core has a layering problem of its own is a separate question, and this CV does not assume the answer |
| [CV9.E2](cv9-e2-stabilization/index.md) | Stabilization & Robustness | ✅ Closed as a container on 2026-11-07. S1 and S3 to S32 are done, and S2 was delivered by CV21.DS5. The part of its done condition still unmet, actionable errors for external failures, is carried by DS13 and DS15 |
| [CV9.E3](cv9-e3-distribution-tooling/index.md) | Distribution & Tooling | ✅ Done. It shipped the updater on the Python core, and CV22.DS10 rebuilt install and update on npm. First-run gaps are DS15's |
| [CV9.E4](cv9-e4-documentation-polish/index.md) | Documentation & Polish | ✅ Done on 2026-05-15, before the TypeScript rewrite changed the CLI, the install, and the runtimes. DS18 re-audits the docs against the system that exists |
| [CV9.E5](cv9-e5-process-versioning-alignment/index.md) | Process & Versioning Alignment | ✅ Done |
| [CV9.E6](cv9-e6-web-visibility/index.md) | Web Visibility | ✅ Done, then retired: the web console was not ported to TypeScript (decision of 2026-09-17), and Mirror Desktop (CV24) is its successor. It is not part of the 1.0 done condition |

---

## Delivery Stories

| Code | Delivery Story | User-visible outcome | Status |
|------|----------------|----------------------|--------|
| [CV9.DS7](cv9-ds7-conversation-metadata-lifecycle/index.md) | Conversation Metadata Lifecycle | Conversation title, summary, tags, and metadata state follow a lifecycle instead of one narrow retitle trigger | ✅ Done |
| [CV9.DS8](cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/index.md) | One Doorman: Mirror's Context Before the Model on Every Runtime | On every runtime that can carry it, the runtime puts Mirror's context before the model: the full folder once on an explicit turn, and on each ordinary turn in Mirror Mode the persona the question newly calls for and the memories relevant to it; the voice and the `◇ persona-name` signature hold across a conversation; Pi reaches L4. Promoted from CR165 on 2026-10-24 | ✅ Done |
| [CV9.DS9](cv9-ds9-the-extraction-model-chosen-by-measurement/index.md) | The Extraction Model, Chosen by Measurement | The model behind extraction, titles, summaries, tags, reception, journal, shadow, and consolidation is the one that measured best on the eval suite and on the Navigator's own conversations, and its reasoning can be turned off or down. Opened 2026-10-26 from a baseline of Flash Lite against GPT-6 Luna and Claude Haiku 5.5. Done 2026-10-28: the pin moved to Claude Haiku 5.5 at reasoning `none`, on the Navigator's own blind rankings and the suite at reasoning off; release intent planned | ✅ Done |
| [CV9.DS10](cv9-ds10-the-1-0-done-condition-describes-the-system-that-exists/index.md) | The 1.0 Done Condition Describes the System That Exists | A reader can tell from this page alone when 1.0 is done: every claim in the done condition is true of the TypeScript core today or is owned by a named story, and each says how it is checked. Documents only. Done 2026-11-07, validated by the Navigator | ✅ Done |
| CV9.DS11 | A Journey Can Be Reshaped Without Losing a Record | A person can create a journey, move it under another, rename it, point it at a new folder, and delete it, from the CLI, without losing a conversation, memory, task, attachment, or extension row. Today the CLI has the status read, `set-path`, and `update`; create, move, and delete exist only as `mirror-mind/desktop` calls, and nothing renames. Carries the journey-reorganization handoff of 2026-11-07, [CR063](../../refinement/rs010-cv22-oracle-and-port-hygiene/cr063-keep-journey-slugs-consistent-across-tables-in-repair-encoding.md), and [CR202](../../refinement/rs010-cv22-oracle-and-port-hygiene/cr202-a-deleted-journey-leaves-its-extension-bindings-behind.md). Runs second, and gates 1.0. Validated by the Navigator's own reorganization | 🟡 Planned |
| CV9.DS12 | Every Conversation Is Recorded Where It Belongs | No known path drops a prompt, files a turn in another conversation, or guesses the session, and a new record's id is wide enough that a collision is not a practical event. Carries D-029, D-030, CR100, CR101, CR201, and CR097. CR151 and CR166, two causes of a misfiled turn, are done. CR097's collision is loud and recoverable today; the one silent path is the upsert of exploratory stories, which a wider id and a safe upsert close | 🟡 Planned |
| CV9.DS13 | Only a Failure Caused by the Conversation Counts Against It, and No Entry Is Lost | A configuration, authentication, timeout, rate-limit, or server failure leaves a conversation pending instead of counting toward its quarantine, a quarantined conversation can be released, and a failed model call ends a command in one line that keeps what the person wrote, `journal` included. Carries CR178 and CR188. AI-08, a fallback model, is carried past 1.0 by decision | 🟡 Planned |
| CV9.DS14 | A Person Can See What Mirror Sends Where, and Nothing Leaks on the Way | REFERENCE says in one place what leaves the machine: identity and memories to the runtime's model on each turn, every closed transcript to OpenRouter and the provider serving the pinned model, memory and search text for embeddings, and, with `consult`, the full identity to any model the person names. No prompt text sits in a log or a process listing, and `consult` has a reduced-context mode. Carries CR098, D-028, and AI-17 | 🟡 Planned |
| CV9.DS15 | A First Run Uses the Home It Is Given | `init`, `runtime update`, `mcp`, and `install` honor the home they are told, name the one they used, and fail in one sentence instead of a stack trace or a guess. Carries CR124, CR085, CR175, CR129, and CR150 | 🟡 Planned |
| CV9.DS16 | Every Release Is One the Project Can Vouch For | Only the release ref can stage a publish; a docs-only push cannot pass CI carrying what the publish gate refuses; a probe the provider never answered reads inconclusive, not resisted; the extraction eval's prompt hash covers the prompts its probes send; the Pi extension is type-checked; and no test writes into a real home. Carries CR136, CR126, D-022, CR184, CR161, CR182, and CR195 | 🟡 Planned |
| CV9.DS17 | 1.0 States What It Promises to Keep | One document names what a person or a host can rely on across 1.x: skill names and CLI verbs, `mirror-mind/desktop` under `DESKTOP_API_VERSION`, the extension contract, MCP tools, the migration of an earlier home, and how a breaking change is announced, in the form of the cutoff record. A test fails when a named surface changes. Follows DS11 to DS16, because it names what they leave stable | 🟡 Planned |
| CV9.DS18 | The Docs Say What the System Does | A claims list for README, Getting Started, and REFERENCE: each claim checked against the code or a run, with a verdict. Carries CR157, CR174, and CR130, three claims already known to be wrong. E4's audit predates the TypeScript rewrite | 🟡 Planned |
| CV9.DS19 | A Stranger's First Week Is Rehearsed Before 1.0 Ships | On a release candidate (`1.0.0-next.N`): install, `init`, key, seed, a Mirror Mode conversation, session end, memories extracted and recalled the next day, backup, and update, once on a fresh home and once as an update of a copy of a long-lived home. The parity matrix is re-measured on the runtimes' current versions, and `eval --all` runs on the pinned model. CI's package smoke covers install from nothing on Linux; the rest is a recorded route in the style of CV9.E6.S6 | 🟡 Planned |

---

## Done Condition

CV9 is done when every row below is true and its evidence is linked. A bullet that is
true only because the thing it named was deleted does not count, so it is not here.

### Still to be made true

| Claim | Story | How it is checked | Evidence |
|-------|-------|-------------------|----------|
| No known path loses, misfiles, or double-keys a conversation: every prompt is recorded, every turn lands in its own conversation, the session is never guessed, and a record id cannot collide | DS12 | A regression test for each fix, in the runtime's own harness (Pi has no standalone smoke, so its extension's harness test is its proof), and the conversation lifecycle smoke | — |
| A failure that belongs to the configuration, the provider, or the network does not count against a conversation, a quarantined conversation can be released, and a failed model call ends a command in one line that keeps what the person wrote | DS13 | A test for each failure kind the transport classifies, and a `journal` run against a refused provider that keeps the entry | — |
| A person can reshape their journeys (create, move, rename, re-path, delete) without losing a conversation, memory, task, attachment, or extension row | DS11 | A schema inventory test, in the style of `JOURNEY_DELETION_INVENTORY`, that fails when a table names a journey and has no rename decision; the Navigator's own reorganization as the personal-Mirror validation | — |
| One page says what leaves the machine, no prompt text sits in a log or a process listing, and `consult` can run on less than the whole identity | DS14 | A REFERENCE section, a redaction test, and a test that the logging call's arguments carry no prompt | — |
| `init`, `runtime update`, `mcp`, and `install` honor the home they are given, name it, and fail in one sentence | DS15 | CLI tests, and a scratch-home route | — |
| Only the release ref can stage a publish, CI refuses what the publish gate refuses, a probe the provider never answered reads inconclusive, the Pi extension type-checks, and no test writes into a real home | DS16 | The `release` environment's branch policy, the CI gates, and `eval --all` | — |
| A document names what 1.x keeps stable and how a breaking change is announced | DS17 | A test that fails when a named surface changes | — |
| README, Getting Started, and REFERENCE are true of the TypeScript system and of the five runtimes | DS18 | A claims list, each claim checked against code or a run, with a verdict | — |
| A stranger's first week works on a release candidate, on a fresh home and on a copy of a long-lived home | DS19 | The rehearsal route on `1.0.0-next.N`, the parity matrix re-measured, and `eval --all` on the pinned model | — |
| The release commit passes every gate in `.github/workflows/tests.yml` and `docs.yml`, and `eval --all` | DS16, DS19 | CI, at the release commit | — |

### Already true

| Claim | Story | Evidence |
|-------|-------|----------|
| Conversation metadata avoids durable weak titles and keeps manual title locks | DS7 | [CV9.DS7](cv9-ds7-conversation-metadata-lifecycle/index.md) |
| Mirror's context reaches the model through one doorman on every runtime that can carry it | DS8 | [CV9.DS8](cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/index.md) |
| The model behind extraction is the one that measured best | DS9 | [CV9.DS9](cv9-ds9-the-extraction-model-chosen-by-measurement/index.md) |
| An installed extension is exposed on every supported runtime | CV21.DS5 | [CV21.DS5](../cv21-runtime-expansion-ii/cv21-ds5-user-extensions-on-every-runtime/index.md) |
| A person installs with `npm install -g mirror-mind` and updates with `mirror runtime update` | E3, CV22.DS10 | [CV9.E3](cv9-e3-distribution-tooling/index.md), [CV22 index](../cv22-typescript-core-port/index.md) |
| Process and versioning rules are explicit | E5 | [CV9.E5](cv9-e5-process-versioning-alignment/index.md) |

---

## Outside the Gate

These are real, and none of them stops 1.0:

- **CR146** (an extension cannot declare the settings it expects) is an authoring
  feature, tracked in RS011. **CR177** (a Pi session in a clone also loads the installed
  package) affects contributors working in a clone, not the people 1.0 is for.
- **AI-08**, a fallback model for the extraction pin, is carried past 1.0 by decision.
- **CR197**, a relative `MIRROR_BIN` that lets Node run a project's own file, ships as a
  patch ahead of this gate.
- RS010's cosmetic and cost items (CR056, CR076, CR078), RS001's Ariad surface fixes, and
  CV10 and later.

---

## Sequencing

```text
DS10 re-baseline (documents only)
  └── DS11 journeys, second and by choice
        DS12 recording        ┐
        DS13 failures         │ DS11 to DS16 may run in any order
        DS14 privacy          │
        DS15 first run        │
        DS16 release trust    ┘
          └── DS17 the promise (names the surfaces DS11 to DS16 leave stable)
                └── DS18 docs re-audit (describes the final state)
                      └── DS19 first-week rehearsal on 1.0.0-next
                            └── v1.0.0
```

---

## See also

- [Briefing](../../briefing.md)
- [Decisions](../../decisions.md#cv9-is-re-baselined-on-the-typescript-core)
- [Versioning: CV9 and `v1.0.0`](../../../process/versioning.md#cv9-and-v100)
- [AI Engineering Audit](../../ai-engineering-audit.md)
- [Plan review of the re-baseline](cv9-ds10-the-1-0-done-condition-describes-the-system-that-exists/evidence/2026-11-07-plan-review.md)
- [CV21 Runtime Expansion II](../cv21-runtime-expansion-ii/index.md), [CV22 TypeScript Core Port](../cv22-typescript-core-port/index.md), [CV24 Embeddable Core for Mirror Desktop](../cv24-embeddable-core-for-mirror-desktop/index.md)
