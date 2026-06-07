[< Roadmap](../index.md)

# CV16 — Explorer Mode

**Status:** 🟢 DS0–DS7 Done

**Source exploration:** [ES-003 Explorer Mode](../../exploration/es-003-explorer-mode.md)

**Release intent:** first Explorer Mode release after DS7 Promotion Handoff and DS8 Persistence and Visibility

---

## What This Is

CV16 gives Mirror a native exploratory lens for the uncertain middle between
reflection and construction.

Mirror Mode reflects identity, memory, tensions, and sensemaking. Builder Mode
turns a journey into project construction, implementation, validation, and
history. Explorer Mode sits beside Builder Mode as an explicit operating lens for
a journey, but its purpose is different: it preserves uncertainty before the user
is ready to commit to delivery.

Explorer Mode lets the user open an exploration in natural language, stay inside
one current Exploratory Story across turns, visibly thicken that story, request a
Narrative Field Snapshot, and explicitly promote the exploration into Builder
only when ready.

---

## Product Boundary

```text
Explorer preserves uncertainty.
Builder executes commitment.
```

Explorer may open or thicken an Exploratory Story, formulate a candidate, or
propose promotion. It does not edit code, create delivery plans, mutate roadmap
state, or begin construction unless the user explicitly confirms promotion into
Builder.

Explorer is not hidden intent detection. The user activates the lens explicitly,
and while it is active Mirror assumes new material belongs to the exploratory
field unless the user asks for a clear operational action.

---

## Community Promise

Mirror is not only a place to reflect or build. It can also hold the field where
something is becoming clear but is not ready to become work.

Explorer Mode gives that field a shape. It opens an Exploratory Story, shows
when the story thickens, preserves the accumulated narrative without forcing it
into the roadmap, and proposes a promotion brief when construction becomes
possible. It does not silently convert exploration into delivery.

---

## Delivery Arc

| Code | Delivery Story | Outcome | Status |
|------|----------------|---------|--------|
| [CV16.DS0](cv16-ds0-runtime-status-bar-foundation/index.md) | Runtime status bar foundation | Pi footer shows active Mirror identity, active journey, active mode, and health marker as a cross-mode orientation foundation | ✅ Done |
| [CV16.DS1](cv16-ds1-mode-transition-surface/index.md) | Mode transition surface | Mode changes render a compact conversational surface for Mirror, Builder, and Explorer lenses, including persona routing and Builder journey context | ✅ Done |
| [CV16.DS2](cv16-ds2-discard-current-conversation-skill/index.md) | Discard current conversation skill | Test sessions can be quit without preserving the current conversation in Mirror history | ✅ Done |
| [CV16.DS3](cv16-ds3-explorer-activation-contract/index.md) | Explorer activation contract | A user can explicitly enter and leave Explorer Mode for a journey through natural language, with Mirror using contained commands only as internal behavioral resources | ✅ Done |
| [CV16.DS4](cv16-ds4-in-session-exploratory-story/index.md) | In-session Exploratory Story | Explorer Mode maintains one current Exploratory Story per journey session, with narrative summary and last card context available for the next turn | ✅ Done |
| [CV16.DS5](cv16-ds5-story-thickening-surfaces/index.md) | Story thickening surfaces | Mirror renders Exploratory Story Opened, Story Thickened, and Narrative Field Snapshot at the right moments | ✅ Done |
| [CV16.DS6](cv16-ds6-experiment-proposals-and-attractors/index.md) | Experiment proposals and attractors | A thickened exploration can name attractors and propose concrete experiments without pretending to be Builder delivery | ✅ Done |
| [CV16.DS7](cv16-ds7-promotion-handoff-to-builder/index.md) | Promotion handoff to Builder | A confirmed experiment or exploration can produce a minimal Builder handoff without pretending to be a complete delivery plan | ✅ Done |
| [CV16.DS8](cv16-ds8-persistence-and-visibility/index.md) | Persistence and visibility | Exploratory state survives beyond one fragile session and handoff evidence is reviewed, obfuscated, and visible before release | 🟡 Planned |
| [CV16.DS9](cv16-ds9-required-surface-rendering-contract/index.md) | Required surface rendering contract | Explorer surfaces are marked and enforced as user-facing output so Story Thickened and handoff cards cannot disappear into assistant interpretation | 🟡 Planned |
| CV16.DS10 | Release packaging and feedback runway | Package the first Explorer Mode release after DS7, DS8, and surface-rendering hardening, then leave multiple stories and advanced Explorer capabilities for feedback-driven future work | 🟡 Planned |

The first enabling slice is the runtime status bar foundation because Explorer
adds a new operating lens and Mirror should make the active lens visible before
adding another mode. After that, the roadmap should move to the behavior
contract, not storage or web UI. Persistence is intentionally delayed until
Explorer proves that it can hold uncertainty and thicken stories coherently in
conversation.

DS4 deliberately removed signal and radar modeling from the first behavior slice.
The observable value is the Exploratory Story itself; signal vocabulary can return
later only if practice shows it carries real product value.

---

## First Slice Principles

- Natural language is the user interface. Formal commands are resources Mirror
  can use internally when contained behavior is useful.
- `/mm-explore <journey>` should only set mode context. It should not start a
  new conversation session by itself.
- Explorer Mode is of the same nature as Builder Mode: an explicit journey lens,
  not a hidden specialization inside Mirror Mode.
- The first implementation supports one current Exploratory Story per journey
  session.
- Story Thickened is the core user-visible behavior.
- Promotion to Builder requires explicit confirmation.

---

## Conscious Non-Goals for the First Slice

- No hidden hook-based intent interception.
- No automatic conversion from Mirror Mode to Explorer Mode.
- No automatic promotion to Builder.
- No complex database schema before behavior is validated.
- No web console dependency for the first conversational behavior.
- No broad signal classifier that tries to detect every possible exploratory
  moment.
- No requirement that Ariad or Maestro become the runtime substrate.

---

## Open Design Questions

- Where should the first non-persistent state live: runtime state, journey
  identity, local context file, or session-scoped database state?
- How should `last_story_card` be represented so the next turn can thicken the
  story rather than replace it?
- What is the smallest experiment proposal that can name an attractor without
  becoming a delivery plan?
- What is the smallest promotion brief Builder can consume while preserving the
  distinction between exploratory candidate and delivery plan?

---

## Done Condition

CV16 first release is done when a user can explicitly enter Explorer Mode for a
journey, explore across multiple turns with visible story thickening, request a
Narrative Field Snapshot, receive an experiment proposal with attractors,
explicitly promote the exploration into Builder without hidden mode switching or
premature construction, recover the exploration beyond fragile runtime state, and
trust that required Explorer surfaces are rendered visibly before assistant
interpretation. Multiple simultaneous Exploratory Stories and advanced Explorer
capabilities are intentionally deferred until users experiment with the first
release and generate feedback.

---

## References

- [ES-003 Explorer Mode](../../exploration/es-003-explorer-mode.md)
- Ariad Exploration: `/Users/alissonvale/Code/ariad/docs/exploration/`
- Passagem evidence conversation: `/Users/alissonvale/Desktop/passagem-conversa.md`
