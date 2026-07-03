[< CV22 TypeScript Core Port](index.md)

# CV22 Collaboration Strategy

**Purpose:** record how Alisson and Vinícius will divide the TypeScript Core Port work with fewer handoffs, so both humans and both Mirrors can preserve the same operating understanding.

---

## Context

CV22 ports Mirror Mind's Python core (`src/memory/`) to TypeScript through a database-seam strangler. The work is part-time and collaborative. Alisson and Vinícius are both active in the migration, and the main coordination risk is not lack of skill. It is too many small handoffs.

Small handoffs create hidden cost: repeated re-contextualization, unclear ownership, partial states that are hard to resume, and pressure to explain every local decision. The preferred strategy is therefore to pass the work only at meaningful plateaus.

A handoff should happen when the project reaches a new habitable state, not when an arbitrary task is half-finished.

---

## Strategy

Work is divided by **baton blocks**, not by fine-grained specialization.

Each person carries the work until a coherent plateau exists. Then the baton passes with a clear statement of:

- what is now true;
- what remains intentionally undone;
- what the next person should bring to the next plateau;
- which validation evidence supports the handoff.

This minimizes coordination overhead while preserving continuity.

---

## Proposed Baton Sequence

### Baton 1: Alisson closes CV22.DS2.US1, `search` Command Parity

Alisson carries the next block through `CV22.DS2.US1`.

Expected plateau:

- the real TS hybrid ranker has been promoted from spike logic into the durable `ts/` core;
- the golden corpus includes the ranker inputs needed to replay full search behavior;
- synthetic golden parity runs in CI;
- real-DB copy parity has been manually validated;
- docs and story artifacts explain the behavior, validation route, and limits.

Handoff statement to Vinícius:

> The TS core now has proven `search` parity. The parity harness and ranker pattern are stable enough to extend. Please carry the rest of DS2 to completion by applying the same standard to the remaining read-only deterministic commands.

### Baton 2: Vinícius closes the rest of CV22.DS2

Vinícius carries `CV22.DS2.US2` and `CV22.DS2.US3`.

Expected plateau:

- `detect-persona` parity is implemented and validated;
- journeys and memory listing parity are implemented and validated;
- the golden corpus and verifier pattern are hardened by use across multiple commands;
- DS2 can close as the read-only deterministic foundation for the strangler.

Handoff statement to Alisson:

> The TS core can now read Mirror deterministically with validated parity across the DS2 command set. The foundation is ready to be put behind a runtime front door.

### Baton 3: Alisson carries CV22.DS3, Pi TS Front Door

Alisson carries the first runtime-facing transition state.

Expected plateau:

- Pi has a TS front door that can route commands;
- ported commands go to the TS core;
- unported commands fall back to the frozen Python engine;
- the transition state is dogfoodable in daily use;
- the runtime does not expose language switching as a user-visible disruption.

Handoff statement to Vinícius:

> The TS core is now reachable through the runtime front door. The system can live in the transition state. Please carry deterministic writes with backup-gated, copy-validated parity.

### Baton 4: Vinícius carries CV22.DS4, Deterministic Writes

Vinícius carries the write-command block.

Expected plateau:

- deterministic write commands are ported to TS;
- writes are validated against database copies, never directly against the live production database during parity proof;
- backup gates and mutation safety are explicit;
- schema compatibility remains intact.

### Later batons: CV22.DS5 and CV22.DS6

DS5 and DS6 should be divided once the earlier plateaus reveal the real shape of the external-API and convergence work.

Likely ownership pattern:

- Vinícius leads mechanical engineering of deterministic seams, fixtures, record/replay, and package mechanics.
- Alisson leads semantic coherence, product/runtime feel, Ariad alignment, MCP/plugin convergence meaning, and Python retirement decisions.

But this should not become fine-grained slicing too early. The same baton rule applies: hand off at coherent plateaus.

---

## Operating Rules

### Prefer plateau handoffs

A handoff should say: “this state is coherent and resumable.” Avoid handing off while the code is merely locally understandable to the current driver.

### Preserve the database-seam discipline

The shared SQLite database remains the seam. Read-only commands may be validated live when safe. Writes must prove parity on database copies before they are trusted against real user data.

### Keep Python maintenance-only

Python remains the oracle and fallback during the transition, not the place for new feature growth. New feature work should land in TS when it belongs to CV22.

### Make validation portable

Every baton should leave commands and expected observations that another person, or another Mirror, can run without reconstructing intent from chat history.

### Record decisions near the roadmap

Stable collaboration or architecture decisions should be recorded in CV22 docs or `docs/project/decisions.md`, not only in conversation memory.

---

## Compact Sequence

```text
Alisson: CV22.DS2.US1 search parity
→ Vinícius: finish CV22.DS2 read-only deterministic parity
→ Alisson: CV22.DS3 Pi TS front door and dogfooding
→ Vinícius: CV22.DS4 deterministic writes
→ Later: divide CV22.DS5 and CV22.DS6 after earlier plateaus clarify the terrain
```

---

## Why This Shape

This strategy reduces the number of handoffs while still keeping the migration incremental. It avoids splitting work so finely that both people must continuously reload the same local context. It also avoids giving one person an entire vague CV-level arc.

The baton changes hands when the terrain changes nature:

- from proving the core search parity;
- to completing read-only parity;
- to making the transition state usable;
- to allowing safe writes;
- to external APIs and final convergence.

That is the rhythm CV22 needs: fewer transfers, clearer plateaus, stronger continuity.
