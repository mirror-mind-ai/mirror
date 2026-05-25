[< S5 index](index.md)

# CV9.E4.S5 — Plan: CLAUDE.md / AGENTS.md Reduction

---

## The Risk

S5 has a different character from the other stories in E4. S1–S4 are
documentation reorganization — the risk is broken links and missing content.
S5 is behavioral. CLAUDE.md is loaded at the start of every session. Reduce
it too aggressively and the mirror routes wrong, misses a persona, or ignores
a constraint. The risk is not a broken link — it is a broken session.

The design discipline is therefore: **only remove what the AI does not need
before it has read anything else.**

---

## The Two-Moment Framework

Two moments determine what must stay in CLAUDE.md:

**Moment 1 — the first user message.** The AI receives it before loading any
skill. It must decide: Mirror Mode or Builder Mode? If Mirror, which persona?
If Builder, which journey? It must apply hard constraints from the very first
response. Everything required for this moment must stay in CLAUDE.md.

**Moment 2 — skill activation.** The user invokes a skill explicitly, or the
AI routes to one. At that point it loads the SKILL.md and has full procedure
detail. Everything that lives in a SKILL.md can be a pointer in CLAUDE.md.

---

## What Stays

**Operating modes** — Mirror Mode and Builder Mode: when to activate each and
how to operate in each. The routing decision happens before any skill is loaded.
This cannot be deferred.

**Ego-persona model** — the routing protocol, the signature format
(`◇ persona-name`), the one-voice rule. The AI must know how to route and how
to present before the first response. This cannot be deferred.

**Hard constraints** — language, truth, service. Must be active from the first
word. This cannot be deferred.

**Skills list** — skill name, one-line description, and SKILL.md file path.
The AI needs to know what skills exist and where to load them. Not the procedure
steps — those live in each SKILL.md. Just enough to discover and activate.

---

## What Becomes a Pointer

| Current content | Pointer destination |
|---|---|
| Repository structure | `docs/product/architecture.md` |
| Memory system description | `docs/product/architecture.md` |
| Psychic architecture detail | `docs/product/architecture.md` (identity model section) |
| Extensions detail | `docs/product/extensions/` |
| Full commands table | `REFERENCE.md` |
| Development conventions | `docs/process/development-guide.md` |
| CI verification procedure | `docs/process/development-guide.md` |

---

## Structure After Reduction

CLAUDE.md currently mixes mirror operating instructions and project-specific
context without clear delineation. After S5, two sections are explicitly
labelled:

```
# Mirror Mind — Session Context

## Mirror Operating Instructions
Applies to all sessions, regardless of project.
- Operating modes (Mirror Mode, Builder Mode, routing rules)
- Ego-persona model (routing protocol, signature format, one-voice rule)
- Hard constraints (language, truth, service)
- Skills list (name, description, SKILL.md path)

## Project Context — Mirror Mind Codebase
Applies to Builder Mode sessions on this repository only.
- What this project is (one paragraph)
- Current CV status
- Key pointers: architecture.md, development guide, roadmap
```

The project context section is what makes CLAUDE.md both a generic mirror
context file and a project-specific Builder briefing. After the reduction, that
dual role is preserved but made explicit rather than interwoven.

---

## Skills List Format

Each entry in the skills list carries exactly three pieces of information:

```
- skill-name: one-line description — path/to/SKILL.md
```

Example:
```
- mm-mirror: activates Mirror Mode — .pi/skills/mm-mirror/SKILL.md
- mm-build: activates Builder Mode for a journey — .pi/skills/mm-build/SKILL.md
```

This is the minimum for the AI to know what exists and where to load it.
Anything more is redundant with the SKILL.md itself.

---

## Verification (Required Before Marking Done)

Behavioral verification in a real session is required before this story is
marked done. The index flags this explicitly. The verification sequence:

1. **Mirror Mode routing** — send an ambiguous personal/reflective message
   without invoking `/mm-mirror`. Confirm Mirror Mode activates correctly.

2. **Persona routing** — send a message clearly in the thinker domain (ideas,
   concepts) and one in the engineer domain (code, debugging). Confirm the
   correct persona activates for each.

3. **Builder Mode** — invoke `/mm-build mirror`. Confirm the skill loads, the
   project context is correct, and the working directory is set.

4. **Skill discovery** — invoke a skill by name (e.g. `/mm-memories`). Confirm
   the AI loads the correct SKILL.md and follows the procedure.

If any of these fail after the reduction, restore the relevant content before
pushing.

---

## See also

- [S5 index](index.md)
- [S3 — REFERENCE Split](../cv9-e4-s3-reference-split/index.md)
- [S6 — Cross-Reference Audit](../cv9-e4-s6-cross-reference-audit/index.md)
