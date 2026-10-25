[< Parent](../index.md)

# CV9.DS8.TS7 — Written where a user reads it

**Status:** ✅ Done — 2026-10-25
**Type:** Technical Story
**Delivery Story:** CV9.DS8 — One Doorman: Mirror's Context Before the Model on Every Runtime

---

## Technical Story

In order to let a person reading the docs find the one doorman where they read —
the contract, the parity matrix, Getting Started, the architecture, the decisions log,
and REFERENCE — instead of the three policies DS8 retired,
As the Mirror Mind documentation,
I want every page that still describes the old injection (the Claude-family hook's
"explicit form, then once", Antigravity's "whole folder every turn, no prompt",
Pi's "does not auto-inject") rewritten from what TS2, TS3, US4, US5, and TS6
built and measured, with nothing stated that a story did not measure, on the version
it measured,
So that DS8 can close with every doc the guard holds agreeing with the matrix, and a
user of any runtime knows what reaches the model on a turn, when, and what it costs.

## Outcome

- The contract's `## Optional: Mirror Mode Identity Injection` opens with what the
  one doorman is, then describes its command (`mirror mirror doorman`), its three
  answers (nothing, the full folder, a delta), the policy that chooses them, the
  delivered line the model reads, and how each runtime calls it: the Claude-family
  hook and Antigravity's `PreInvocation` in process, the Pi extension through the
  command. "Pi does not auto-inject" is gone; Grok Build's inert hook stays as the
  measured exception.
- The contract's `### Mirror Mode injection models` table has one model for the four
  doorman runtimes and one for Grok Build. The guidance for a new runtime says to
  call the doorman, and the `## CLI Reference` lists `mirror mirror doorman` beside
  the `mirror mirror load --context-only` line that agy's pre-1.4.7 path still runs.
- The contract's reference-implementation tables for Pi, Claude Code, Codex, and
  Antigravity name how Mirror's context reaches the model through the doorman. Pi's
  no longer names the `/mm-mirror` skill as the way in. The Antigravity notes no longer
  say its payloads carry no text: agy 1.4.7 carries the prompt as `lastUserInput`, and
  the `Stop` handler still reads the transcript for the reply.
- The parity matrix's Claude Code and Codex rows read US4's measurement: the
  injection cell names the one doorman through the inject hook, with the version,
  binary, and date of US4's accepted walk (Claude Code 2.1.310, Codex 0.164.0,
  2026-10-25) and DS8.US4 first in the record. Every cell US4's walk did not
  re-measure (skills, instructions at start, MCP, Codex's session reap) carries its
  own version and story inline, as the Antigravity row does. The Pi, Antigravity, and
  Grok Build rows are not touched.
- `docs/getting-started.md`: one plain-words sentence above "What each runtime gives
  you" says what Mirror Mode now does on every runtime that has it, claiming only
  what all four walks measured. The rows say only when Mirror Mode starts on each.
  "Measured on" carries the stories' versions and dates, and the note under the table
  says the matrix names the version behind each part. The Antigravity text loses
  "injected once per turn". No internal word ("doorman", "delta", "folder") appears
  on the page.
- The architecture's Runtime Model names the doorman on the Claude Code and Codex
  rows; its `runtime_sessions` schema row and session-model sentence drop
  `hook_injected` (migration 018) and name `metadata`; levels unchanged.
- The decisions log's one-doorman entry gains a "What it costs, measured" paragraph:
  the cost model (one `embedding` row per Mirror Mode turn, the explicit turn as
  `mirror load --query` writes it, nothing outside Mirror Mode), then the sizes and
  latencies US4, US5, and TS6 measured, each dated to its story. No price in dollars,
  since none was measured.
- REFERENCE's `## The doorman` section matches the code after US4, US5, and TS6:
  `--forget`; Mirror Mode on means `mirror_active` and the session's operating mode,
  and `mirror mirror deactivate` (what `/mm-new` runs) or a mode switch ends it; a
  skill turn gets nothing; up to five memories at or above 0.4 semantic, delivered
  once per session; a compaction makes the next turn full; three callers.
- `runtimeParityDocs.test.ts` and `checkDocLinks` green; DS8's candidate table reads
  TS7 as built; one worklog entry; the missing version guard for Getting Started
  named as a Debt Review candidate.
- Not in this story: any change to `doorman.ts`, the hooks, the extension, the skill,
  or `AGENTS.md`; a new measurement on any runtime; Grok Build's row; DS8's own
  closure (Done Condition, CR165's `promoted` reading), which follows TS7.

## Acceptance Behavior

```text
Given the docs before this story, where seven retired-sentence patterns match 10 lines
When the same grep runs after the story across docs/product,
     docs/getting-started.md, REFERENCE.md, and README.md
Then no line matches

Given the contract's parity matrix
When the Claude Code and Codex rows are read
Then the injection cell names the one doorman, the version, binary, date, and
     record are US4's accepted walk (2.1.310 / 0.164.0, 2026-10-25, DS8.US4), and
     every cell US4 did not re-measure carries its own version and story
And the Pi, Antigravity, and Grok Build rows are byte-for-byte as US5, TS6, and
    DS10 left them

Given Getting Started's "What each runtime gives you" table and the sentence above it
When they are read beside the matrix
Then the shared sentence claims only what all four doorman runtimes measured, each
     row agrees with its matrix cell in plain words, and "Measured on" carries the
     story's version and date
And the page contains no "doorman", "delta", or "folder"

Given REFERENCE's doorman section
When it is compared to ts/src/mirror/doorman.ts and the doorman route
Then every rule it states is one the code implements (mode condition and what ends
     it, skill turns, the 0.4 semantic threshold and five-memory limit,
     delivered-once memories, compaction refresh and --forget)

Given the repository checks
When runtimeParityDocs.test.ts and checkDocLinks.ts run
Then both are green
```

## Scope

- `docs/product/specs/runtime-interface/index.md`: the injection section, the
  injection-models table, the CLI Reference, the Claude Code and Codex matrix rows,
  the Pi, Claude Code, Codex, and Antigravity reference-implementation tables and
  paragraphs, and the `### Assistant Response` Antigravity note.
- `docs/getting-started.md`: the sentence above "What each runtime gives you", the
  table, the note under it, and the Antigravity wiring step and section.
- `docs/product/architecture.md`: the Claude Code and Codex rows of the Runtime
  Model; the `runtime_sessions` schema row and the session-model sentence.
- `docs/project/decisions.md`: a measured paragraph under the one-doorman entry.
- `REFERENCE.md`: `## The doorman`.
- DS8's candidate table (TS7's row), this package, `docs/process/worklog.md`.

## Out Of Scope

- Code, hooks, the extension, the skill's copies, `AGENTS.md`, the plugin generator.
- A new live measurement; a version bump of any matrix row beyond what US4 walked; a
  dollar price read from the ledger.
- A guard for Getting Started's versions (a Debt Review candidate).
- Grok Build's row and section; CR165; DS8's closure records.
- The doorman's policy, threshold, ranker, or what the folder contains.

## Validation

Automated: `node --test ts/test/scripts/runtimeParityDocs.test.ts`,
`node ts/scripts/checkDocLinks.ts`, `git diff --check`, the mirror-skill contract
test (unchanged, as a check that no skill copy changed), the retired-sentence grep
run before and after, and the Getting Started vocabulary grep. Navigator: read the
changed pages against the matrix, the stories' records, and the code by the route in
`test-guide.md`.
