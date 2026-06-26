[< CV20.DS2](../index.md)

# CV20.DS2.US2 — Adoption Template Generation

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Navigator can ask Mirror to prepare Ariad adoption templates for a journey and receive a report showing what required documentation was checked, created, preserved, or left pending.

This story extends the Ariad adoption moment from method-state configuration into documentation readiness. It does not execute story lifecycle work and does not sync a delivery cursor yet.

---

## Acceptance Behavior

```text
Given Builder Mode is active for a journey that has adopted Ariad
And the journey has a configured project path
When the Navigator asks to prepare Ariad templates for this journey
Then Mirror checks the expected Ariad roadmap/documentation structure
And creates missing adoption templates where safe
And preserves existing human-authored files
And renders a template generation report with created, preserved, and pending sections
And no story lifecycle work is executed
```

```text
Given Builder Mode is active for a journey that has not adopted Ariad
When the Navigator asks to prepare Ariad templates for this journey
Then Mirror refuses template generation
And explains that Ariad must be adopted first
And does not create files
```

```text
Given Builder Mode is active for a journey with no project path
When the Navigator asks to prepare Ariad templates for this journey
Then Mirror refuses template generation
And explains that a project path is required
And does not create files
```

---

## Scope

- Add a contained operation under `memory build` for Ariad adoption template preparation.
- Use existing Ariad adoption state to require that the journey has adopted Ariad first.
- Use the journey project path as the target repository root.
- Check for a minimal Ariad-compatible roadmap/documentation structure.
- Create missing safe templates only when files do not already exist.
- Preserve existing files without overwriting human content.
- Render a report with checked, created, preserved, and pending sections.
- Update the Pi Builder skill so natural-language template preparation requests route to the contained command.
- Add focused tests for created templates, preservation, missing adoption, missing project path, and report content.

---

## Out Of Scope

- No delivery cursor sync.
- No active roadmap item resolution.
- No lifecycle execution.
- No story status transitions.
- No generation of complete CV/DS/US hierarchies beyond safe adoption readiness templates.
- No override merge implementation.
- No release or push policy behavior.

---

## Validation

Navigator validation through Pi/Mirror natural language:

```text
prepare os templates Ariad desta jornada
```

Expected observation: Mirror runs the contained template preparation command, reports created/preserved/pending files for the active adopted journey, and states that no story lifecycle work was executed.

---

## References

- [CV20.DS2.US1 — Adopt Ariad For A Journey](../cv20-ds2-us1-adopt-ariad-for-journey/index.md)
- [Ariad Builder Method DSL](../../../explorations/ariad-builder-dsl/method-dsl.md)
