[< CV9.E6 Web Visibility](../index.md)

# CV9.E6.S6 — Personal Mirror Validation

**Status:** ✅ Done
**User-visible outcome:** The 1.0 web visibility surface is validated against the real personal Mirror and follow-up work is documented.

## Scope

Validate the shipped read-only visibility surface using the personal Mirror as
the canonical real-world case.

Validation should check:

- perspective default behavior;
- Atlas identity and persona visibility;
- object detail behavior;
- evidence affordances;
- Workspace dashboard usefulness;
- partial and empty states;
- upgrade/readiness value for existing users.

## Acceptance Criteria

- Manual validation results are documented.
- Frictions are classified as release blockers or follow-up.
- The roadmap, decisions, worklog, and release notes are updated as appropriate.
- The surface is strong enough to justify asking existing users to update, or
  the remaining blocker is explicitly named.

## Validation Results

### Driver validation — 2026-05-25

Automated gate passed:

```bash
uv run pytest tests/unit/memory/surfaces tests/unit/memory/web tests/unit/memory/test_public_api.py
uv run ruff check src/memory/surfaces src/memory/web tests/unit/memory/surfaces tests/unit/memory/web
uv run ruff format --check src/memory/surfaces src/memory/web tests/unit/memory/surfaces tests/unit/memory/web
node --check src/memory/web/static/app.js
git diff --check
```

Evidence:

- 40 focused tests passed.
- Ruff lint passed.
- Ruff format check passed.
- `node --check src/memory/web/static/app.js` passed.
- `git diff --check` passed.

Real personal Mirror validation used the local web server at
`http://127.0.0.1:8765` after restart. The surface loaded the real
`alisson-vale` Mirror home.

Validated behavior:

- Shell reports `defaultPerspective: workspace`, valid perspectives `atlas` and
  `workspace`, and docs availability.
- Default perspective persistence works: setting Atlas updates `/api/shell`, and
  restoring Workspace updates `/api/shell` back to `workspace`.
- Identity returns real regions for Self, Ego, Shadow, Personas, and Memories.
- Personas are visible from the personal Mirror, with 18 persona cards.
- Memories are visible as partial aggregates, including Decisions, Ideas,
  Learning, Insights, Reflections, Tensions, Journeys, and Other.
- Self and Ego detail pages expose stable detail grammar, source paths
  `identity/self/soul` and `identity/ego/identity`, and explicit provenance
  limits.
- Shadow detail is honest: it uses the `identity/shadow` placeholder source and
  states that no explicit shadow entry is available yet.
- Persona detail works for a real seeded persona (`estrategista`) and exposes
  `persona/estrategista` as explicit source context.
- Workspace selects a plausible recent active journey
  (`agentic-ai-for-delphi-consulting`) and shows active journey list, journey
  profile metrics, Briefing, Conversations, Tasks, Memories, and Decisions.
- Workspace partial states are honest: selected journey Memories and Decisions
  tabs show empty-state messages instead of fake completeness.

Friction:

- Source Context and evidence are clear in the API shape, but final browser
  readability still needs Navigator visual acceptance.
- The personal Mirror has Portuguese-era persona keys and labels mixed with the
  English product surface. This reflects real user data and is not a release
  blocker for the read-only visibility promise.
- A requested `engineer` persona detail returned 404 because this personal
  Mirror uses a different persona catalog. The available persona detail path is
  correct for real local data.

Release blockers:

- Navigator validation found a data-truth blocker: recent Pi Builder
  conversations existed in the database but were not associated with their
  journeys, so Workspace was truthfully rendering stale/incomplete journey data.

Bug resolution:

- Core fix implemented in `memory.cli.conversation_logger`: when a SKILL.md
  command such as `/mm-build` runs without an explicit session id, the logger
  falls back to the latest active runtime session and Pi user-message logging
  refreshes that session's `updated_at`.
- Added `conversation-logger repair-journeys [--limit N] [--apply]` as an
  explicit, backup-gated repair path for historical journeyless conversations.
- Ran a dry-run against the personal Mirror, reviewed high-confidence
  candidates, then applied repair with backup
  `memory_20260525_083122.zip`.
- Repaired 45 historical conversations conservatively, including recent
  `mirror-mind`, `maestro`, `sandbox-pet-store`, and `mirror-self-update`
  sessions.
- Manually attached the active validation conversation `89c316ff` to
  `mirror-mind` because it predated the fix and used a skill payload title.
- Restored the `journey/mirror-mind` identity record from a placeholder (`-`) to
  an active journey briefing so Workspace can list it as an active journey.

Post-repair evidence:

- `mirror-mind`: 25 conversations, latest `2026-05-25T11:01:19.933796Z`, 4295
  messages; Workspace now selects Mirror Mind and shows 8 recent conversation
  cards.
- `maestro`: 4 conversations, latest `2026-05-24T12:11:31.639120Z`, 341
  messages.
- `sandbox-pet-store`: 4 conversations, latest `2026-05-24T14:46:49.549542Z`,
  58 messages.
- `mirror-self-update`: 4 conversations, latest `2026-05-23T15:51:54.316854Z`,
  122 messages.

Follow-up:

- Consider richer persona descriptions when stored persona content lacks a short
  public descriptor.
- Consider making the unavailable-object state friendlier than a raw 404 if a
  user navigates to a nonexistent persona manually.
- Continue improving evidence depth after the 1.0 read-only visibility slice.

Readiness judgment:

- Driver judgment: strong enough to ship after Navigator browser acceptance.
- Navigator visual validation passed after repair. The 1.0 web visibility surface
  is strong enough to ship for the read-only Identity and Workspace promise.

## Notes

This story belongs at the end of E6 because the personal Mirror is the product
truth test for the 1.0 web visibility promise.
