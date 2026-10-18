[< CV21.DS8](../index.md)

# CV21.DS8.US3 — The cutoff ships in its own release note

**Status:** ✅ Done — 2026-10-18
**Type:** User Story

---

## User Story

As a Gemini CLI user who updates Mirror,
I want the release that removes my runtime to tell me what is gone, what to
install instead, and what I will see if I do nothing,
So that the change is one I read about before it happens to me, not one I
discover from a failing hook.

## Outcome

The removal is recorded in the CV22 cutoff shape and shipped in a release
whose note carries it. [v0.33.0](../../../../../releases/v0.33.0.md) gave notice
that Gemini CLI was retired and the integration still worked; this release is
the cutoff that notice announced. A user who reads it knows the four hook
entries and the skills links to remove, that `agy plugin install` is the one
step that replaces the two they had, and that their Gemini models and their
logged conversations are untouched.

## Acceptance Behavior

```text
Given the release note for this release
When a Gemini CLI user reads it
Then it says what no longer exists: the `.gemini/hooks` wrappers, the `gemini`
  hook family, the `mirror init` steps, the Gemini smoke, and the runtime in
  the docs
And why: the decision, Google's deprecation, and the DS7.US4 measurement that
  Antigravity meets the bar on agy 1.4.2 — a Gemini CLI user loses nothing and
  gains MCP
And what to do instead: install Antigravity and run
  `agy plugin install "<pkg>/plugins/mirror-mind"`, as `mirror init` prints
And what still works: Gemini models in extraction and `consult`; conversations
  logged as `gemini_cli`, readable in every home
And what happens if they do nothing: after the update the four `mirror-*`
  hooks in `~/.gemini/settings.json` point at files that no longer exist and
  Gemini CLI reports them; the note names the four entries to delete and the
  `~/.gemini/skills/` links `gemini skills link` created, and says Mirror does
  not edit those files for them

Given the cutoff record
When I compare it with the CV22 cutoffs in pending-cutoffs.md
Then it answers the same three questions in the same order and links the
  story and the decision

Given the release
When it is cut
Then the version is bumped, the note is in docs/releases/ and indexed, the
  roadmap row for DS8 reads Done with the version, and `mirror release-notes`
  shows the note
```

## Scope

- The cutoff record, in the CV22 shape: story, decision, Removed, Why, What
  to do instead, What still works, and the do-nothing paragraph with the exact
  `~/.gemini/settings.json` entries (`mirror-session-start`, `mirror-log-user`,
  `mirror-log-assistant`, `mirror-session-end`) and the skills links. Where it
  lives — a section of the release note, or a cutoff document the note links
  the way v0.32.0 linked pending-cutoffs.md — is decided at Plan.
- The release note under `docs/releases/`, in the structure
  `docs/process/release-notes.md` defines, with the cutoff as a highlight, and
  its entry in `docs/releases/index.md`.
- The version bump, the tag, and the publication, through the project's
  release route — each a separate Navigator gate, not implied by this story's
  Plan.
- The DS8 row in the CV21 roadmap and the CV21 index's runtime narrative,
  updated at close.

## Out Of Scope

- Removing anything (US1) or sweeping the docs (US2): this story records and
  ships what they did.
- Editing a user's `~/.gemini/settings.json` or `~/.gemini/skills/`: Mirror
  never wrote them and does not touch them.
- Rewriting the v0.33.0 notice, v0.32.0, or any earlier note.
- Any Antigravity change: DS7 shipped it.

## Done (2026-10-18)

The cutoff is `docs/releases/v0.35.0.md`'s own section — *Four Runtimes, One
Successor* — opening with what the user keeps, then the CV22 order. Two
probes before prose: Gemini CLI 0.61.0 in a scratch HOME skips a registered
hook whose command is missing, in silence, and the session proceeds (headless
mode, with a control hook proving hooks fire there); whether Antigravity reads
`~/.gemini/skills/` was not measured — agy's login is not a file, the probe
needs an interactive OAuth approval, and `probe-agy-skills.sh` in this package
is the re-runnable route. The guidance in Getting Started and troubleshooting
names the four entries and the links without the deleted path or the literal
skills-link command, so the guard needed no exemption — the literal tripped
it once and was rephrased, per the plan's rule. Two commits as DS4: the story,
then the four-file release commit. Publication followed on the Navigator's
word, step by step.

## Validation

Navigator-visible: read the note as a Gemini CLI user and find the four
answers; `mirror release-notes` shows it; the CV21 roadmap row reads Done
with the version. Automated: the release route's own checks (tripwire,
retired-surface guard, `npm pack` contents).
