[< Story](index.md)

# Plan — CV9.E6.S6 Personal Mirror Validation

## Intent

Use the real personal Mirror as the truth test for the 1.0 web visibility
surface. This story is not feature expansion. It is a validation collapse:
confirm whether Identity, object detail, Source Context, Workspace, and partial
states make the Mirror understandable without the database or CLI.

The output should be evidence, classification, and readiness judgment:

```text
Validated behavior
  what works against the real Mirror

Friction
  what felt confusing, weak, or incomplete

Release blockers
  what must be fixed before asking existing users to update

Follow-up
  what can wait after CV9.E6 or 1.0
```

## Validation dimensions

The manual pass should inspect the surface from the user's standpoint:

- perspective default and switching behavior;
- Identity map readability and labels;
- Self, Ego, Shadow, and persona detail behavior;
- Source Context clarity and honesty;
- Workspace journey selection and journey profile usefulness;
- Workspace tabs for Briefing, Conversations, Tasks, Memories, and Decisions;
- empty and partial states;
- local-first/runtime readiness for an existing user update.

## Implementation steps

1. Create the validation route in `test-guide.md` with runnable commands,
   expected observations, and a place to record findings.
2. Run the automated web visibility gate to ensure the validation starts from a
   known-good technical state.
3. Restart the local web server and validate the personal Mirror manually in the
   browser.
4. Record results in this story, separating validated behavior, frictions,
   blockers, and follow-up.
5. Apply only small in-story fixes if they are required for coherence or if a
   release blocker is found and is cheap enough to resolve without expanding the
   story.
6. Update the roadmap and worklog after the Navigator accepts the validation
   result.
7. Add a decision only if validation changes the public product boundary or
   creates a stable architectural/product rule.
8. Add release-note material only if this closes a releasable CV9.E6 boundary
   or changes existing-user update messaging.

## Boundaries

- Do not add new web capabilities just because validation reveals a desirable
  future direction.
- Do not convert partial data into fake completeness.
- Do not introduce live LLM synthesis.
- Do not add editing workflows.
- Do not broaden object-detail support unless lack of support blocks the 1.0
  visibility promise.
- Do not mark CV9.E6 done until manual validation evidence is documented.

## Finding taxonomy

Use this classification during review:

```text
Pass
  The surface supports the 1.0 promise as implemented.

Follow-up
  The issue is real, but the 1.0 promise remains honest and useful.

Release blocker
  Existing users would be misled, blocked, or unable to understand their Mirror.

Out of scope
  Valuable direction, but belongs after the read-only visibility slice.
```

## Review questions

- Can I understand what exists inside my Mirror without CLI commands?
- Does Identity reveal the Mirror's sense of self without feeling like a raw
  database view?
- Does Source Context explain where claims come from without overstating
  provenance?
- Does Workspace help me see current journeys and operational context?
- Are partial areas honest enough to ship?
- Would I ask an existing user to update for this surface?
