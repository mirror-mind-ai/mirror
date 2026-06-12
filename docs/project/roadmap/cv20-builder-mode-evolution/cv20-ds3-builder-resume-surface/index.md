[< CV20](../index.md)

# CV20.DS3 — Builder Resume Surface

**Status:** ✅ Done

---

## Outcome

Builder load resumes an Ariad-governed journey from method DSL, roadmap files, and persisted runtime state.

The Navigator sees a concise briefing, roadmap position, active delivery item, active checkpoint, pending confirmation, and allowed next actions.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV20.DS3.TS1](cv20-ds3-ts1-builder-resume-cursor-reader/index.md) | Builder Resume Cursor Reader | Technical Story | Builder load can read DS2 cursor state and expose it to the resume surface | ✅ Done |
| [CV20.DS3.TS2](cv20-ds3-ts2-roadmap-position-resolver/index.md) | Roadmap Position Resolver | Technical Story | Builder resolves active roadmap position according to Ariad taxonomy | ✅ Done |
| [CV20.DS3.US1](cv20-ds3-us1-resume-ariad-journey/index.md) | Resume Ariad journey | User Story | Builder load renders current journey, roadmap, checkpoint, and next actions | ✅ Done |

---

## Done Condition

DS3 is done when Builder can reopen an adopted journey and place the Navigator exactly where delivery previously stopped.
