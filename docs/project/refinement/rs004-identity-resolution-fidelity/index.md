[< Refinement Workbench](../index.md)

# RS004 — Identity Resolution Fidelity

## Framing

The mirror's answer to "who is the user?" is not owned by anyone. Sites that need
the owner's name scrape it out of the `user/identity` prose independently, each
with its own regex, its own tolerated phrasings, and its own fallback. The copies
have drifted: the primary path fails against the identity text the project's own
templates produce and silently substitutes a placeholder, while another path
carries a specific person's name hardcoded in framework source.

This story groups the refinements that give identity-derived facts one resolver
with one contract. It is not a redesign of identity storage and not an extraction
quality initiative — it is about the framework asking one authority instead of
guessing three ways.

## Outcome

Any code that needs the owner's identity gets it from one place, that place
tolerates the phrasings the shipped templates actually produce, carries no
personal data in framework source, and fails visibly instead of silently
substituting a placeholder.

## Boundaries

- Do not redesign identity storage or the identity layer schema.
- No personal names, or any user-specific data, hardcoded in framework source.
- Template wording and resolver expectations must agree; changing one without
  the other reintroduces the defect.
- Extraction quality beyond identity resolution is out of scope.
- Keep document backlog status in the canonical [Workbench index](../index.md).

## Change Requests

- [CR014 — Resolve the owner's name from one authority](cr014-resolve-owner-name-from-one-authority.md)
