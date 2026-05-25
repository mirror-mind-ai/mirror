[< CV9.E4 Documentation & Polish](../index.md)

# CV9.E4.S5 — CLAUDE.md / AGENTS.md Reduction

**Status:** —  
**Epic:** CV9.E4 Documentation & Polish

---

## User-Visible Outcome

The AI loads a focused context file at session start that tells it how to
operate — not a documentation hub that duplicates content from REFERENCE,
architecture docs, and skill files. The AI has everything it needs to route,
respond, and find skills. It does not carry redundant weight that has already
been expressed more accurately elsewhere.

---

## Problem

`CLAUDE.md` and its symlink `AGENTS.md` currently serve two overlapping
functions:

1. **Runtime instruction file** — tells the AI what Mirror Mode and Builder
   Mode are, how persona routing works, what the hard constraints are, and
   where to find skills.

2. **Partial reference document** — lists all commands with descriptions,
   describes the system architecture, and explains operating procedures in
   detail.

The second function is what creates the problem. By the time S3 creates
`docs/product/architecture.md` and S3 makes `REFERENCE.md` the single authoritative
commands table, `CLAUDE.md` contains significant content that is now duplicated
across the doc set — and that will drift from those docs over time.

A second issue: `CLAUDE.md` mixes two distinct concerns in its role as a
project context file. It contains both generic mirror operating instructions
(how Mirror Mode works, persona routing, constraints) and project-specific
context (this is the Mirror Mind codebase, here is how to work on it). Those
two concerns should be clearly delineated, not interwoven.

---

## Scope

**In scope:**

**What stays in `CLAUDE.md` / `AGENTS.md`:**
- Operating modes: Mirror Mode and Builder Mode — when to activate each,
  how to operate in each
- Ego-persona model: routing protocol, signature format, one-voice rule
- Hard constraints: language, truth, service — must be active before the
  first response and cannot be looked up on demand
- Available skills list: skill names, one-line descriptions, and file
  locations — enough for the AI to know what exists and where to load it.
  No procedure steps; those live in each SKILL.md.
- Project-specific context section: this is the Mirror Mind codebase,
  current CV status, project conventions, commit rules

**What is removed from `CLAUDE.md`:**
- Full commands table with arguments — pointer to `REFERENCE.md` instead
- Architecture description — pointer to `docs/product/architecture.md` instead
- Detailed skill procedure steps — those live in each SKILL.md, loaded
  on demand
- Any content that duplicates the project briefing or decisions docs

**Delineation inside the file:**
The two concerns — mirror operating instructions and project context — should be
visually separated with a clear heading structure so it is obvious which section
applies to all mirror sessions and which applies only to Builder Mode work on
this codebase.

**Out of scope:**

- Changes to skill SKILL.md files — S5 only changes what CLAUDE.md points to,
  not the skill files themselves.
- Changes to the `.pi/settings.json` or hook configurations.
- Behavioral changes to Mirror Mode or Builder Mode — this is a doc change only.

---

## Risk

This file is loaded at the start of every session. Removing too much breaks
behavior — the AI needs enough context to route correctly before it has read
anything else. Before marking this story done, verify in a real session that:

- Mirror Mode activates correctly without an explicit invocation.
- Persona routing works on an ambiguous query.
- Builder Mode loads the correct skill and project context.
- The hard constraints (language, truth) are respected from the first response.

---

## Done Condition

- `CLAUDE.md` / `AGENTS.md` is materially shorter than before this story.
- The full commands table is removed; a pointer to `REFERENCE.md` replaces it.
- Architecture description is removed; a pointer to `docs/product/architecture.md`
  replaces it.
- Detailed skill procedure steps are removed; skill locations are listed with
  one-line descriptions only.
- Mirror Mode, persona routing, and hard constraints are clearly present.
- The mirror operating instructions and project-specific context are visually
  delineated inside the file.
- Behavioral verification in a real session passes (see Risk section above).
- CI remains green.

---

## Dependencies

- S3 must be complete. `docs/product/architecture.md` must exist before `CLAUDE.md`
  can point to it.
- S3 must be complete. `REFERENCE.md` must be the authoritative commands table
  before `CLAUDE.md` can point to it.

---

## See also

- [CV9.E4 Documentation & Polish](../index.md)
- [Plan](plan.md)
- [S3 — REFERENCE Split](../cv9-e4-s3-reference-split/index.md)
- [S6 — Cross-Reference Audit](../cv9-e4-s6-cross-reference-audit/index.md)
