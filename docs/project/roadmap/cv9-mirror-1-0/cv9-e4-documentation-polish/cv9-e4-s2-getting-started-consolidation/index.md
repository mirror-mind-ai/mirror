[< CV9.E4 Documentation & Polish](../index.md)

# CV9.E4.S2 — Getting Started Consolidation

**Status:** —  
**Epic:** CV9.E4 Documentation & Polish

---

## User-Visible Outcome

A new user follows one document from clone to working mirror without hitting
dead ends, redundant steps, or content that belongs somewhere else. Getting
Started is the single authoritative onboarding document — nothing required for
onboarding lives anywhere else, and this document doesn't repeat anything that
belongs in REFERENCE.

---

## Problem

After S1 removes content from README, Getting Started must absorb it cleanly.
But Getting Started also has its own structural problems:

1. **Legacy migration content is in the wrong place.** The Portuguese-era
   database migration workflow is documented in the middle of the onboarding
   flow. Most early users who needed it have already migrated. A new user
   hitting this content on day one is confused by a migration they don't need.

2. **Extension content is too deep for onboarding.** The current Getting
   Started walks through the full install, expose, and smoke test cycle for
   the `review-copy` reference extension. This is operational detail that
   belongs in the extension docs, not in the onboarding flow. A new user
   should know extensions exist and where to learn more — not how to run a
   smoke test.

3. **No clear "what's next" pointer.** After the verification checklist, the
   document ends. A user who has completed onboarding has no clear path to
   the next layer of the system.

---

## Scope

**In scope:**

- Absorb the onboarding content removed from README in S1 (if not already present).
- Remove the legacy migration workflow from Getting Started entirely. Move it
  to `REFERENCE.md` with a note that it is a removal candidate for a future CV.
- Reduce the extensions section to one short paragraph: extensions exist, here
  is the concept, here is where to learn more. No install steps, no expose
  steps, no smoke test.
- Add a "What's next" section at the end that points to:
  - `REFERENCE.md` for the full command reference
  - `docs/product/architecture.md` for the system architecture (created in S3)
  - `docs/product/extensions/` for extending the mirror
- Ensure the document reads as a clean linear flow: prerequisites → install →
  configure → init → seed → start → verify → what's next.

**What Getting Started owns after this story:**

- Prerequisites (with links)
- Clone + `uv sync`
- Environment variables (`.env` setup, `MIRROR_USER`, `OPENROUTER_API_KEY`)
- `memory init your-name`
- What ships in the identity (12-persona table, starter journey)
- `memory seed`
- How to start each runtime (Pi, Gemini CLI, Codex, Claude Code)
- Verification checklist (copy-paste commands with expected output)
- "What's next" pointer section

**What Getting Started does not own:**

- Full commands table (pointer to REFERENCE)
- Legacy migration workflow (moved to REFERENCE)
- Extension install/expose/clean cycle (pointer to extension docs)
- Python API (pointer to `docs/product/api.md`, created in S7)
- Architecture detail (pointer to `docs/product/architecture.md`, created in S3)

**Out of scope:**

- Changes to `REFERENCE.md` — that is S3.
- Changes to the extension docs — Getting Started only adds a pointer.
- Rewriting identity content — that was CV9.E3.S1.

---

## Done Condition

- Getting Started has no legacy migration content.
- Extensions are represented by one paragraph and a pointer only.
- A new user can follow the document top to bottom and arrive at a working,
  verified mirror without consulting any other document.
- A "What's next" section closes the document with clear pointers.
- No content is duplicated between README (post-S1) and Getting Started.
- CI remains green.

---

## Dependencies

- S1 must be complete. Getting Started absorbs what S1 removes; if S1 has
  not run, the destination is unclear.

---

## See also

- [CV9.E4 Documentation & Polish](../index.md)
- [Plan](plan.md)
- [S1 — README Reduction](../cv9-e4-s1-readme-reduction/index.md)
- [S3 — REFERENCE Split](../cv9-e4-s3-reference-split/index.md)
- [Extension docs](../../../../../product/extensions/index.md)
