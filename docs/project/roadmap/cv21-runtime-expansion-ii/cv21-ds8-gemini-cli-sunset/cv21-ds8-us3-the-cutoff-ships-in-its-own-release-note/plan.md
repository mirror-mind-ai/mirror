# Plan — CV21.DS8.US3

## Objective

Record the Gemini CLI cutoff where a user reads it before it happens to them,
and ship it in its own release. US1 removed the integration; US2 made every
runtime-facing doc say so; the tree is releasable (the tripwire passes, docs
CI is green). What remains is the record and the release: a release note in
the canonical structure whose cutoff answers the three questions
[the CV22 cutoffs](../../../../../releases/pending-cutoffs.md) answered —
what no longer exists, what to do instead, what still works — plus the one
the decision said needs care: what a user who does nothing will see. Then
the version, the release commit, and the publication route, each remote
step its own Navigator gate.

This is DS8's release boundary (intent: `planned`). When it closes, DS8
closes with it, the way DS4 closed with v0.34.0.

Decisions this plan takes, for the Navigator to confirm or change:

1. **The cutoff lives in the release note**, as its own section, not in a
   separate cutoff document. CV22 needed `pending-cutoffs.md` because it
   released once for eleven cutoffs; DS8 has one cutoff and its own note.
   The DS index left this to Plan; this is the answer.
2. **The version is `v0.35.0`**, a minor: a Delivery Story closes and CV21
   stays open, as DS4's `v0.34.0` did. Title: *Four Runtimes, One Successor*
   — a sentence about the state the user has now, as the earlier titles are,
   not the backlog's label (writer, Plan review; Navigator's choice).
3. **Un-wiring guidance goes where a user with a failing hook looks**, not
   only in the note: a short "If you used Gemini CLI" paragraph in Getting
   Started's Antigravity section and one entry in troubleshooting. Both name
   the four `mirror-*` entries and the `~/.gemini/skills/` links, never the
   deleted path — so the `gemini-cli` guard row needs no exemption (the
   product-designer's question at US2's review, answered without one).
4. **The last Gemini-bearing release is `v0.34.0`**; the note names it as the
   pin for a user who needs Gemini CLI a while longer.

## Scope

**The release note, `docs/releases/v0.35.0.md`**, in the structure
`docs/process/release-notes.md` defines (digest, Highlights, Where We
Started, What Changed, Upgrading, Conscious Exclusions, What We Learned, Next
Horizon), with the cutoff as its own section between What Changed and
Upgrading:

- **Removed.** The four `.gemini/hooks` wrappers and the `gemini:*` hook
  family; the two Gemini CLI steps `mirror init` printed; the Gemini smoke;
  the runtime from the package's description and keywords and from every
  runtime-facing doc. (Named here, in the note, where history lives; the
  guard row forbids these names in live docs, and `docs/releases/` is
  history.)
- **Why.** The decision (2026-09-25, recorded 2026-10-13), Google's
  deprecation of the Gemini Code Assist backend for individuals, and the
  gate: DS7.US4 measured Antigravity at L4 on agy 1.4.2, all five bar items
  — a Gemini CLI user who moves loses nothing and gains MCP. The honest cost
  the decision feared (per-turn injection) did not materialize; the one
  difference that did: the conversation closes at the next session start,
  not at exit.
- **What to do instead.** Install Antigravity; `agy plugin install
  "<pkg>/plugins/mirror-mind"`, the one step `mirror init` prints; the
  plugin-form skills.
- **What still works.** Gemini *models* — extraction on
  `google/gemini-2.5-flash-lite`, `consult`'s `gemini` family. Conversations
  logged as `gemini_cli`, readable in every home; nothing migrates them.
- **If you do nothing.** After `npm update -g mirror-mind`, the four
  `mirror-*` hook commands in `~/.gemini/settings.json` point at files that no
  longer exist, and the `~/.gemini/skills/` links `gemini skills link` created
  still resolve (`.pi/skills` keeps shipping) — so Gemini CLI keeps Mirror's
  skills and loses logging and injection. The silent part, said plainly:
  your Gemini CLI sessions stop being logged and Mirror Mode stops being
  injected, and nothing on screen says so unless Gemini CLI reports the
  missing hook. What Gemini CLI 0.61.0 prints for a missing hook command is
  **measured** in a scratch `HOME` (probe below) and quoted; if it cannot be
  measured without a model call, the note says what the user can verify
  instead and does not guess. The exact entries to delete —
  `mirror-session-start`, `mirror-log-user`, `mirror-log-assistant`,
  `mirror-session-end` under `SessionStart`/`BeforeAgent`/`AfterAgent`/
  `SessionEnd` — and the links. Mirror never wrote those files and does not
  edit them.
- **To stay on Gemini CLI a while longer:** `npm install -g mirror-mind@0.34.0`,
  with its consequence stated: the welcome card and `runtime update` keep
  offering `v0.35.0` every session; the pin is a choice, not a quiet state.

The cutoff section opens, before "Removed", with what the user keeps: the
same `~/.mirror-minds/<user>` home, memories, journeys, and logged
conversations — only the runtime that reads them changes. "What to do
instead" says the home carries over unchanged: nothing to export, nothing to
re-seed. Same home, same memory, different door.

The other sections name what this release carries beyond the cutoff: the
`gemini-cli` retired-surface row; the docs link check green again; the
typecheck fix. Conscious Exclusions: DS5, DS9/DS10, DS11, the D-031 smoke
non-hermeticity. Next Horizon: what CV21 does next, from the CV21 index.

**The un-wiring guidance, in two live docs:**

- `docs/getting-started.md`, Antigravity section: "If you used Gemini CLI
  before this version" — how you would know (you ran `gemini skills link` and
  merged four hooks into `~/.gemini/settings.json` at an earlier version),
  remove the four entries and the links; the pin.
- `docs/process/troubleshooting.md`: one entry for "Gemini CLI reports a
  missing Mirror hook command" pointing at the same steps.

**Two bounded probes**, run before the note is written, each with an honest
fallback:

- Gemini CLI 0.61.0 in a scratch `HOME` whose `settings.json` registers one
  `SessionStart` command at a path that does not exist, run **from the
  scratch directory** so no project settings bleed in from the checkout. No
  credential copied. Pass/fail framed before it runs: *pass* — the CLI
  reports the missing command by name, or starts without comment (either is
  a quotable fact); *fail* — the CLI will not reach the hook without a
  credential or refuses to start. A fail is reported as "not measured".
- Antigravity 1.4.2 in a scratch `HOME` with one `~/.gemini/skills/x/SKILL.md`
  beside an installed plugin: whether the skill is listed. Navigator decision
  at Plan review: **run**. It does not gate the story: whichever way it
  reads, the guidance tells the user to remove the links; if it cannot be
  measured, the note says "not measured" and claims nothing about agy.

**The release commit and its records:**

- `package.json` version → `0.35.0`; `node ts/scripts/buildClaudePlugin.ts`
  carries it into `plugins/mirror-mind/.claude-plugin/plugin.json`.
- `docs/releases/index.md`: the `v0.35.0` entry at the top.
- DS8 closes: `cv21-ds8-gemini-cli-sunset/index.md` status Done with the
  version; the CV21 roadmap DS8 row Done with the version; the CV21 index's
  runtime narrative, where it says the Gemini CLI integration "is retired",
  gains the version. US3's own `index.md` Done.
- **Two commits, as DS4 did:** a story commit (the guidance, the roadmap
  closure, the story records), then the release commit —
  `v0.35.0: Four Runtimes, One Successor` — touching only the note, the
  releases index, `package.json`, and the generated `plugin.json`. A release
  commit that is also a docs sweep is harder to revert and harder to read in
  `git log stable`. The worklog entry follows promotion.

**Publication, after Done, each step the Navigator's word:**

1. `npm run release:doctor -- --target v0.35.0` — read-only. At
   Validation, before the commits exist, it reports two expected non-passes
   (tree dirty, tag absent) and must pass everything else; after the release
   commit and before Done it runs again and must pass with only the tag
   warning.
2. Push `main` (7 commits ahead before this story) — the Navigator's — and
   **wait for `tests.yml` and `docs.yml` green on the release commit** before
   promoting. Tagging a commit CI has not graded is how a tag becomes a fact
   about a broken tree.
3. `npm run release:promote -- --target v0.35.0 --push` — doctor, publish
   dry run, tag, fast-forward `stable`, push tag and stable. It never pushes
   `main`.
4. `.github/workflows/publish.yml` — the trusted publisher's stage; a
   maintainer approves with 2FA. The tripwire runs there too.
5. `gh release create v0.35.0 --title "v0.35.0 — Gemini CLI Sunset"
   --notes-file <frontmatter stripped> --latest`.
6. The worklog entry, "v0.35.0 released", and `mirror runtime release-notes
   latest` read back on the Navigator's install after `runtime update`.

Model-behavior release gate: not applicable — no model pin or prompt moves.

## Non-Goals

- Not a second cutoff document: `pending-cutoffs.md` stays CV22's record.
- Not editing a user's `~/.gemini/settings.json` or `~/.gemini/skills/`:
  Mirror never wrote them. The note and the guidance say what to remove.
- Not rewriting the v0.33.0 notice, v0.32.0, `pending-cutoffs.md`, the
  decision, or any closed story.
- Not changing Antigravity: DS7 shipped it. Not DS5, DS9/DS10, DS11.
- Not a guard exemption: the guidance is written so none is needed. If a
  sentence truly needs the deleted path, that is a Plan amendment, not a
  quiet exemption.
- Not publishing from this story's implementation: steps 2–6 happen after
  Done, each on the Navigator's word, never chained.

## Acceptance Behavior

```text
Given US1 and US2 closed and the tree releasable
When the release note is read by a Gemini CLI user
Then it says what no longer exists, why (the decision, the deprecation, the
  DS7.US4 measurement), what to do instead (one agy command), what still
  works (Gemini models; gemini_cli conversations), and what they will see if
  they do nothing — the four entries to delete and the links, Gemini CLI's
  own words for a missing hook where measured, and v0.34.0 as the pin
And Getting Started and troubleshooting carry the un-wiring guidance where a
  user with a failing hook looks, with no gemini-cli guard exemption
And `npm run release:doctor -- --target v0.35.0` passes on the release
  commit with only the tag warning (at Validation, on the dirty tree, with
  the tree-clean failure as the second expected non-pass)
And `mirror runtime release-notes latest --ref HEAD --no-fetch` renders the
  note
And the DS8 package, the CV21 roadmap row, and the CV21 index read Done with
  the version, so DS8 closes with its release boundary
And nothing is tagged, pushed, published, or released by this story's
  implementation; every remote step waits for the Navigator
```

## Validation Route

Automated:

- `node ts/scripts/buildClaudePlugin.ts` **before** `npm test`: the version
  guard is `claudePlugin.test.ts` ("the file in the tree equals the generated
  text"), and it goes red if `package.json` moves and the build has not run.
  Then `npm test`, `buildClaudePlugin.ts --check`,
  `node ts/scripts/checkRetiredSurfaces.ts` (the guidance needed no
  exemption), `node ts/scripts/checkDocLinks.ts` (the note's links resolve),
  `npx biome check .`.
- `npm run release:doctor -- --target v0.35.0` — at Validation: two expected
  non-passes (tree dirty, tag absent), everything else green; after the
  release commit: only the tag warning.
- `mirror runtime release-notes latest --ref HEAD --no-fetch` — the note
  renders through the runtime reader.

Navigator-visible route:

- Observation 1: read `docs/releases/v0.35.0.md` as a Gemini CLI user — pass:
  the five answers are there and each is sourced (the decision, DS7.US4, the
  probe, or an honest "not measured"); fail: an answer is missing or guessed.
- Observation 2: `docs/getting-started.md` Antigravity section and the
  troubleshooting entry — pass: a user with a dangling hook finds the four
  entries to remove and the pin without reading a release note; fail: they
  do not.
- Observation 3: `npm run release:doctor -- --target v0.35.0` — at
  Validation, pass: every check green except the tree-clean failure and the
  tag warning, both expected before the commits exist; fail: anything else.
  After the release commit, before Done: only the tag warning.
- Observation 4: `git grep -n "0.35.0" package.json plugins/mirror-mind/.claude-plugin/plugin.json docs/releases/index.md`
  — pass: three hits, the version is one number everywhere; fail: a copy
  lags.
- Observation 5: the DS8 index, the CV21 roadmap row, and the CV21 index
  name DS8 Done with v0.35.0 — pass: all three; fail: one still reads In
  Progress.

E2E decision: not required for the story; the release route itself is the
E2E and it runs after Done, on the Navigator's word, with the publish
workflow's own checks. `release:doctor` is the preflight that proves the
route will accept the commit.

## Implementation Contract

- Probes before prose, pass/fail framed before each runs, from the scratch
  directory; write only what was measured, and write "not measured" where it
  was not.
- Write the note in the canonical structure; the cutoff section in the CV22
  order (Removed, Why, What to do instead, What still works, If you do
  nothing, the pin).
- Edit `package.json`, run the build for the manifest; never hand-edit
  `plugin.json`.
- Keep changes scoped to `CV21.DS8.US3`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- Nothing remote: no tag, no push, no publish, no `gh release` inside
  implementation.

## Stop Conditions

- navigator_decision_needed — any publication step. (The version, the
  title, and the agy probe were decided at Plan review.)
- scope_change_detected — a sentence in the guidance that would need the
  deleted path (and so a guard exemption); any edit to history.
- failing_required_check_without_clear_fix — `release:doctor` red on
  anything but the tag warning.
- plan_rule_conflict.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
