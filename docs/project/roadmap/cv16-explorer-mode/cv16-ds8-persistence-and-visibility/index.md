[< CV16](../index.md)

# CV16.DS8 — Persistence and Visibility

**Status:** 🟡 Planned

**Placement:** CV16 durable Explorer release story

**User-visible outcome:** Exploratory Stories survive beyond fragile runtime state, can be resumed or archived, and produce Builder handoff packages with source evidence, editorial synthesis, and privacy-safe full conversation material.

---

## Why This Exists

DS7 proved the Explorer-to-Builder handoff mechanism, but real Soul Mode validation showed the generated handoff is only useful when it becomes an editorial transfer of discovery. The first generated documents captured final state but missed the continuous thickening, source conversations, simulations, phases, decisions, and product details that made the exploration ready for Builder.

DS8 turns Explorer output from temporary runtime state into a durable, reviewable exploration artifact.

---

## Scope

- Persist Exploratory Stories as durable records, while keeping at most one active story per journey.
- Support resuming the active Exploratory Story when entering Explorer Mode.
- Support archive/promoted status for completed stories.
- Treat Builder handoff as an editorial workflow, not only deterministic file generation.
- Add source evidence collection for conversations that contributed to the exploration.
- Generate or attach `full-conversation.md` as raw source material when the user requests or confirms it.
- Obfuscate sensitive Navigator information before writing conversation evidence into handoff artifacts.
- Make durable Exploratory Stories visible in appropriate Mirror surfaces.

---

## Non-goals

- No multiple simultaneously active Exploratory Stories for one journey.
- No broad web UI unless needed for minimal visibility.
- No automatic publication of raw conversations without user confirmation.
- No irreversible deletion of source evidence.

---

## Acceptance Behavior

Given a journey has an active Exploratory Story, when the user enters Explorer Mode, Mirror resumes it visibly.

Given a handoff is prepared, Mirror identifies or asks for source conversations that contributed to the exploration.

Given full conversation evidence is included, Mirror obfuscates personal or sensitive Navigator information before writing it to `full-conversation.md`.

Given the exploration is promoted to Builder, the durable story status becomes `promoted`.

Given the user archives an exploration, it remains visible as historical evidence but is no longer the active story.

---

## References

- [CV16 Explorer Mode](../index.md)
- [DS7 Promotion Handoff to Builder](../cv16-ds7-promotion-handoff-to-builder/index.md)
