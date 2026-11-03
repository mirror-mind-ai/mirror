# Plan — CV9.DS8.TS7

## Objective

Rewrite every user-facing page that still describes the three retired doormen so it
describes the one doorman as TS2–TS6 built and measured it — the contract's injection
section, injection-models table, reference implementations, and CLI Reference; the
matrix's Claude Code and Codex rows; Getting Started; the architecture; the decisions
log's cost; and REFERENCE's doorman section — writing only what a story measured, on
the version it measured, so DS8 can close with every doc the guard holds in agreement.

## Scope

Docs only, in this order, each step a reviewable diff. Items marked **(review)** were
folded in from the writer, engineer, and quality-assurance review of the first draft
(2026-10-25); items marked **(check)** were found while verifying those amendments
against the code and the records.

1. **The contract's injection section**
   (`docs/product/specs/runtime-interface/index.md`, `## Optional: Mirror Mode
   Identity Injection`). Open with what the doorman is, in two sentences, before any
   command **(review: writer)**. Then the command
   (`mirror mirror doorman --prompt "<the turn's prompt>" [--session-id ID]`), the
   three answers and DS8's policy (explicit form → the full folder, the session marked
   active; Mirror Mode on and an ordinary turn → a delta: the persona that newly
   scores, up to five memories at or above 0.4 on the semantic score not yet delivered
   in the session, the attachments at or above 0.4; a skill turn → nothing; Mirror
   Mode off → nothing), "Mirror Mode on" as `mirror_active` plus the session's
   operating mode (US4), the compaction refresh (US5), the delivered line and its
   signature clause (TS3), and how each runtime calls it: Claude Code and Codex
   through the inject hook on `UserPromptSubmit`, in process (US4); Pi through the
   extension's `before_agent_start`, as the command, the block carried as a
   `mirror-context` message (US5); Antigravity through `PreInvocation` at
   `invocationNum == 0`, in process, the prompt from `lastUserInput`, the block as a
   persistent `systemMessage` step, the pre-1.4.7 fallback (TS6); Grok Build's hook
   registered and inert (CR143). The explicit form's grammar paragraph stays. "Pi does
   not auto-inject" goes.

2. **The injection-models table and the CLI Reference.** One row for the doorman
   model, naming each of the four runtimes by its calling event and carrier; one row
   for Grok Build, explicit invocation with the hook inert. The "for new shell-hook
   runtimes" paragraph says to call the doorman with the turn's prompt and session id
   and return its block, not `mirror load --context-only`. The contract's
   `## CLI Reference` gains `mirror mirror doorman --prompt <p> [--session-id <id>]`
   and `mirror mirror doorman --forget [--session-id <id>]`, which the Pi extension
   runs; the `mirror mirror load --context-only` line stays, since Antigravity's
   pre-1.4.7 path still runs it (`ts/src/hooks/agy.ts`) **(review: QA)**.

3. **The contract's reference implementations.**
   - Antigravity: the paragraph ("Payloads are camelCase protojson and carry no
     text") and the `### Assistant Response` note ("hook payloads carry no text, so
     the `Stop` handler reads the transcript") read TS6's measurement: on agy 1.4.7
     every payload carries the turn's prompt as `lastUserInput`; no payload carries
     the reply, so `Stop` still reads the transcript. The events table's "Mirror
     inject, once per turn" row names the doorman.
   - Pi: the events table's "Mirror load — the `/mm-mirror` skill" row becomes the
     extension's `before_agent_start` through the doorman, and a row for
     `session_compact` → `mirror doorman --forget` **(check)**.
   - Claude Code: the "Mirror inject" row names the doorman. Codex: the "Mirror load
     — `SessionStart` context + `$mm-mirror` skill" row becomes the inject hook
     through the doorman.

4. **The matrix's Claude Code and Codex rows.** Injection cell: the inject hook on
   `UserPromptSubmit`, through the one doorman (`mirror doorman`): the full folder on
   the explicit form, a delta on each ordinary turn while Mirror Mode is on, nothing
   otherwise, carried as the hook's context field. Version, binary, date from US4's
   accepted walk 2 (2026-10-25): Claude Code 2.1.310, `~/.local/bin/claude` →
   `~/.local/share/claude/versions/2.1.310`; Codex 0.164.0, `/opt/homebrew/bin/codex`
   → `/opt/homebrew/Caskroom/codex/0.164.0/bin/codex` (both still what the machine
   resolves, checked before this plan). Record: `DS8.US4 (the doorman's turns, the
   logging)` first, then the existing records. Every cell US4's walk did not
   re-measure keeps its own version and story inline, as TS6 left the Antigravity row
   **(review: engineer)**:

   | Row | Cell | Annotation | Measured in |
   |-----|------|------------|-------------|
   | Claude Code | Skills — 25, the plugin | (2.1.296, DS12.TS1) | DS12.TS1 probe row 2 |
   | Claude Code | Instructions at start — the plugin's `SessionStart` hook | (2.1.296, DS12.TS1) | probe row 4, live L1 |
   | Claude Code | MCP — 7 tools | (2.1.296, DS12.TS1) | probe row 7, live L6 |
   | Codex | Skills — 25, from Mirror's marketplace | (0.163.0, DS4.US4) | DS4.US4 |
   | Codex | Instructions at start — as a developer message | (0.163.0, DS4.US4) | DS4.US4 |
   | Codex | Logging — the session closes when Codex reaps its thread, 30 min after `/quit` | (0.163.0, DS4.US4) | DS4.US4 |
   | Codex | MCP — through `tool_search` | (0.163.0, DS4.US4) | DS4.US4 |

   The logging cells' "replies" clauses are US4's (walk 2: prompts with the form
   stripped, replies under the runtime's name) and carry no annotation. The
   instructions and Codex reap cells go beyond the two cells the review named; the
   same rule covers them **(check)**. The L4 paragraph under the levels is already
   right; not touched.

5. **Getting Started** (`docs/getting-started.md`).
   - Above the "What each runtime gives you" table, one sentence in plain words
     carrying the idea for every runtime that has it: once Mirror Mode is on, Mirror
     hands the model its context before each answer — all of it on the turn that
     starts Mirror Mode, and after that the persona your question calls for and the
     memories relevant to it — and each answer is signed with the persona's name
     **(review: writer)**. The sentence claims only what all four walks measured: the
     start, the re-routing on a change of domain, the signature on later turns.
     Anything measured on fewer runtimes goes in that runtime's row or stays out.
     `/mm-new` ending Mirror Mode was measured on Pi only (US5), and on agy the
     model's own commands name no session (CR169), so it is not in the sentence
     **(check)**.
   - The rows then say only what differs: when Mirror Mode starts (Pi, Claude Code,
     Codex: when you ask with the Mirror command, or the model takes a personal
     question to the mirror; Antigravity: from the start of every conversation).
     Grok Build's row is unchanged. No "doorman", "delta", "folder", or "refresh"
     anywhere on the page **(review: writer)**.
   - "Measured on": Pi 1.4.0, Claude Code 2.1.310, Codex 0.164.0, agy 1.4.7, all
     2026-10-25; Grok Build unchanged. The sentence under the table ("Each runtime was
     measured on the version named") changes to fit a row whose parts were measured on
     different versions: the row names the version Mirror was last measured on, and
     the parity matrix names the version behind each part **(check, the engineer's
     rule applied here)**.
   - No Pi-only paragraph: the shared sentence replaces it **(review: writer)**.
   - The Antigravity wiring step (§6) and section (§8) replace "injected once per
     (user) turn" with the same plain words, measured on agy 1.4.7 (CV9.DS8.TS6).

6. **The architecture** (`docs/product/architecture.md`). The Runtime Model's Claude
   Code and Codex rows name the inject hook through the one doorman (CV9.DS8.US4), as
   Pi's and Antigravity's rows do; levels unchanged. §7's `runtime_sessions` row and
   §8's "Mirror Mode state" sentence drop `hook_injected`, which migration 018 dropped
   (US5). They name `metadata`, where the session's operating mode, the memories the
   doorman has delivered, and its refresh flag now live (`ts/src/db/schema.ts`,
   `doorman.ts`) **(review: engineer)**.

7. **The decisions log** (`docs/project/decisions.md`, the one-doorman entry). One
   "What it costs, measured" paragraph after "What follows". The cost model first:
   a turn in Mirror Mode writes one `embedding` row in `llm_calls`, shared by the
   memory and attachment searches, and no reinforcement; the explicit turn writes
   what `mirror load --query` writes (reception when enabled, the attachment
   embedding); a turn outside Mirror Mode writes nothing. Then the measured figures,
   each with where, when, and in which story it was measured **(review: engineer)**:
   - the `mirror mirror doorman` command on a copy of the home (US5, 2026-10-25):
     a delta about 1.0 s; 134–154 bytes when no memory passes the threshold, up to
     8.5 KB when some do; the full folder 33 KB in 1.33 s; a turn outside Mirror
     Mode 0.21 s;
   - agy 1.4.7's hook with real providers (TS6, 2026-10-25): quiet 0.23 s, full
     0.90 s, delta 0.96–1.02 s, against agy's 15 s budget;
   - the Claude-family hook's delta 0.97–1.08 s (US4, 2026-10-24).

   No DS8 story measured a turn's price in dollars, so the paragraph states none, and
   decision 1's "a fraction of a cent" stays the decision's estimate. The two
   embeddings per turn Claude Code paid in US4's walk are named as US4's carried
   double-hook debt, not as the cost.

8. **REFERENCE** (`## The doorman`).
   - The synopsis gains `mirror mirror doorman --forget [--session-id ID]`, which the
     Pi extension runs when Pi compacts the session (US5) **(check)**.
   - The policy list gains the operating-mode condition and what ends Mirror Mode for
     the doorman: `mirror mirror deactivate`, which `/mm-new` runs, clears the
     session's flag, and a Builder, Explorer, or Soul switch changes its mode
     (`mirrorModeRoute.ts`, `readDoormanSessionState`). It also gains the skill-turn
     rule and the compaction refresh.
   - Rule 2 reads "up to five memories at or above 0.4 on the semantic score, not
     delivered earlier in the session; the attachments at or above 0.4".
   - The callers sentence names all three: the Claude-family hook and agy's
     `PreInvocation` in process, the Pi extension through this command. The cost table
     stays.

   This replaces the first draft's sentence about a `mirror deactivate` wording;
   REFERENCE does not have that wording **(check)**.

9. **The record.** DS8's candidate table's TS7 row describes what was written;
   `index.md` of this package as the story it is; one worklog entry; `test-guide.md`
   with the route, the evidence, and the Debt Review candidate below.

## Non-Goals

- Any change under `ts/`, `.pi/`, `plugins/`, `.claude/`, or to `AGENTS.md`: the
  doorman, the hooks, the extension, and the skill are what they are after TS6.
- A new measurement on any runtime; moving the Pi, Antigravity, or Grok Build matrix
  rows; re-measuring Claude Code or Codex beyond US4's walk; reading a dollar price
  from the ledger.
- A guard holding Getting Started's "Measured on" column to the matrix:
  `runtimeParityDocs` checks names, levels, and the link, not versions. This story
  names the gap as a Debt Review candidate and does not build it **(review: QA)**.
- Grok Build's section in Getting Started or its contract paragraphs.
- DS8's own closure: the Done Condition's reading, CR165's `promoted` status, DS8's
  closure records.
- README: it links the matrix and names no policy. It is touched only if a sentence
  found during step 5 states the old one; none was found before this plan.
- The CV8 Codex checklist and other roadmap and refinement history that quote the
  old models: they are records of their date.

## Acceptance Behavior

```text
Given the docs before this story, where each pattern below matches (10 lines today)
When grep -rnF runs for each of "does not auto-inject", "once on the first turn after",
     "carry no text", "Call `mirror load --context-only`", "injected once per",
     "Zero runtime cost; requires user awareness", and "hook_injected"
     across docs/product, docs/getting-started.md, REFERENCE.md, and README.md
Then after the story no line matches
And the contract's CLI Reference lists `mirror mirror doorman` beside the
    `mirror mirror load --context-only` line it keeps

Given the contract's parity matrix
When the Claude Code and Codex rows are read
Then their injection cell names the one doorman through the inject hook, their
     version/binary/date are 2.1.310 / ~/.local/share/claude/versions/2.1.310 /
     2026-10-25 and 0.164.0 / /opt/homebrew/Caskroom/codex/0.164.0/bin/codex /
     2026-10-25, and their record opens with DS8.US4
And every cell US4 did not re-measure carries its own version and story inline,
    per the table in Scope step 4
And `git diff` shows the Pi, Antigravity, and Grok Build rows unchanged

Given the contract's reference implementations
When the Pi, Claude Code, Codex, and Antigravity event tables are read
Then each names how Mirror's context reaches the model through the one doorman,
     and none names the `/mm-mirror` skill as Mirror's way in on Pi

Given Getting Started's "What each runtime gives you" table and the sentence above it
When each is read beside the matrix's injection cells
Then the shared sentence claims only what all four doorman runtimes' walks measured,
     each row says only when Mirror Mode starts there, the two agree in meaning with
     the matrix, and "Measured on" carries Pi 1.4.0 / Claude Code 2.1.310 /
     Codex 0.164.0 / agy 1.4.7 (all 2026-10-25) and Grok Build 1.0.62 (2026-10-18)
And grep -niwE "doorman|delta|folder" docs/getting-started.md prints nothing,
    as it prints nothing today

Given the architecture's schema and session-model sections
When `runtime_sessions` is read
Then it lists `metadata` and not `hook_injected`, matching ts/src/db/schema.ts

Given REFERENCE's doorman section and ts/src/mirror/doorman.ts
When each stated rule is traced to the code
Then every rule has its line: readDoormanSessionState (mode), isCommandTurn (skill
     turns), DOORMAN_MEMORY_SEMANTIC_THRESHOLD (0.4), DOORMAN_MEMORY_LIMIT (five),
     deliveredMemoryIds (delivered once), DOORMAN_REFRESH_METADATA_KEY and the
     route's --forget (compaction), deactivateMirrorState (what /mm-new runs)

Given the repository checks
When node --test ts/test/scripts/runtimeParityDocs.test.ts, node
     ts/scripts/checkDocLinks.ts, and git diff --check run
Then all are green
```

## Validation Route

Automated (Driver, after each step and once at the end):

- `node --test ts/test/scripts/runtimeParityDocs.test.ts`: the five docs still name
  five runtimes, the matrix rows keep level/version/binary/record/date, and the
  architecture's levels match. Pass: green. Fail: any assertion.
- `node ts/scripts/checkDocLinks.ts` and `git diff --check`. Pass: clean.
- `node --test ts/test/scripts/mirrorSkillContract.test.ts`, a check that the skill
  copies did not change and the story stayed in the docs. Pass: green.
- The retired-sentence grep of the Acceptance Behavior's first block, run before
  writing (10 lines expected) and after (none). A pattern that matches nothing before
  proves nothing after; the first draft's "routed from nothing" was one, and is gone
  **(review: QA)**.
- The Getting Started vocabulary grep: nothing before, nothing after.

Navigator (reading, no runtime needed), by the route in `test-guide.md`:

1. Open the contract's injection section and read it against `doorman.ts`'s header
   comment and `decideDoorman`. Expected: the same policy in the same order. Fail if
   the section states a rule the module does not have, or omits the mode condition,
   the skill-turn rule, or the refresh.
2. Read the Claude Code and Codex matrix rows and the four reference-implementation
   tables beside US4's `test-guide.md` walk 2 and the inline-annotation table.
   Version, date, observation, and every annotation agree with their records. Fail on
   any value not in its story's record **(review: QA)**.
3. Read Getting Started's sentence, table, and Antigravity text as a new user would.
   One idea, said once, with no internal word. Fail if a row promises a behavior its
   story did not measure on that runtime.
4. Read REFERENCE's doorman section. The threshold, the limit, delivered-once, the
   mode condition and what ends it, the skill-turn rule, and `--forget` are present
   and match the code. Fail on any mismatch.

E2E decision: not required. The story changes documentation only; the automated
guard and the Navigator's reading are the validation. No runtime is exercised.

## Implementation Contract

- Docs only; no file under `ts/`, `.pi/`, `plugins/`, `.claude/`, or `AGENTS.md`
  changes. If a doc sentence can only be made true by changing code, stop
  (`scope_change_detected`).
- Write only what a story measured, on the version it measured, with the story
  named. Where the stories disagree or are silent, say so in the doc or stop
  (`navigator_decision_needed`). A Getting Started sentence that names more runtimes
  than measured the behavior is a stop, not a sentence to soften.
- Keep changes scoped to `CV9.DS8.TS7`; commit per step or per page, story-scoped
  files only; do not use `git add .`.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- a matrix value or inline annotation (version, binary, date) not found in the
  measuring story's record

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
