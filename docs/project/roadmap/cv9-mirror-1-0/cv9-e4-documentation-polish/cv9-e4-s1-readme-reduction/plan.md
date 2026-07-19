[< S1 index](index.md)

# CV9.E4.S1 — Plan: README Reduction

---

## Positioning Decision

The README has three distinct potential readers: the evaluator (hasn't decided
to try it yet), the returner (decided, needs the quickest path to Getting
Started), and the contributor (wants to understand the project to contribute).
The current README tries to serve all three. The reduced README optimizes for
the evaluator and exits the other two as fast as possible.

The primary evaluator is a technical reader — someone already familiar with
AI tooling, already asking the specific question "is there something that gives
my AI sessions continuity?" They do not need to be convinced that AI cold starts
are a problem. They need to understand what Mirror Mind does that nothing else
does.

---

## The Lead: Builder Before Mirror

The existing README leads with the mirror reflection angle — identity,
continuity, speaking as you rather than about you. That framing is correct but
it is an interior experience. It is abstract until the reader has already bought
into the capability.

The stronger lead is the builder angle: **Mirror Mind gives you a coordinated
team of specialists.** This is immediately legible, concrete, and speaks to
what most people want from AI — a significant productivity gain. The reflective
identity layer is then revealed as what makes the team exceptional, not as the
primary pitch.

The principle from the product docs applies here literally: **doing as entry,
being as discovery.**

---

## Narrative Arc

The README follows this sequence. Each layer earns the next.

### 1. The image (literal contractor metaphor)

Open with the house-building analogy. Use the literal image first — brick
layer, roofer, electrician, plumber, architect, structural engineer — to create
a vivid picture before translating it into Mirror Mind terms.

> Imagine hiring a contractor to build a house. A good contractor doesn't show
> up alone — they bring a team: the architect, the structural engineer, the
> electrician, the plumber, the finish carpenter. Each one is exceptional in
> their domain. They've worked together before. They hand off cleanly. You talk
> to one person; the coordination is their problem, not yours.

### 2. The translation

Immediately translate the image into Mirror Mind's team. Name the personas
concretely. State the one-voice model explicitly — they're coordinated, not
competing.

> Mirror Mind gives you that team for knowledge work. A strategist for business
> decisions. An engineer for code. A therapist for the tensions underneath the
> surface. A writer for the moments when voice matters. A researcher when you
> need to go deep. Each activated by context, each exceptional in their domain,
> all speaking with one unified voice — because they're all expressions of the
> same intelligence: yours.

Note: the phrase "expressions of the same intelligence: yours" plants the mirror
concept without using the word yet. This is intentional — the reveal lands
harder four paragraphs later because the reader has already felt it.

### 3. The problem with AI today

Name the coordination failure that current AI tooling produces. The current
README's "every time you open a new AI session you start from zero" line is
still good — it belongs here, as the thing the contractor image is contrasting
against, not as the opening hook.

> The AI tools most people use today are the equivalent of hiring contractors
> one at a time, separately, with no shared context. Each one starts cold. They
> don't know what the others decided. They don't know your constraints, your
> past decisions, your current stage. You are the coordinator — doing the
> integration work that should not be yours to do.

### 4. The team layer — continuity

Introduce the memory and journey layer as a consequence of having a real team:
they carry context. The compounding effect is the key signal here — the second
session is faster, the tenth faster still.

> Mirror Mind changes this. Your team is briefed on your projects. They know
> where you are in each one, what's been decided, what's unresolved. The second
> session is faster than the first. The tenth is faster still. They don't start
> from zero — because they were there.

### 5. The mirror reveal

After the reader is convinced the capability is real, introduce the deeper
layer. This is the pivot from "I have a capable team" to "this team reflects my
own intelligence back at me." The word "mirror" appears here for the first time.

> And over time, something deeper happens. The team doesn't just know your
> projects. They know you — your values, your patterns of thinking, your
> recurring tensions, your voice. Every conversation is analyzed and the signal
> is extracted: decisions, insights, commitments. The intelligence accumulates.
> The reflection sharpens.
>
> This is not a chatbot with memory. This is a mirror — conscious, accumulative,
> and yours.

### 6. How it works — brief technical sketch

One short section for the reader who needs the technical picture before
committing. Local-first, SQLite, four runtimes, one Python core, Jungian
architecture. No details — just enough to recognize the shape of the system.

> Local-first. SQLite. Four supported runtimes: Pi, Gemini CLI, Codex, Claude
> Code. One Python core. Jungian architecture: Self, Ego, Personas, Shadow. The
> identity lives in your machine, not a server.

### 7. Exit — two pointers

The README ends with the two exits the reader needs: onboarding and command
reference. Nothing else.

> → Get started in ten minutes: [Getting Started](../../../../../getting-started.md)  
> → Full command reference: [REFERENCE](../../../../../../REFERENCE.md)

---

## What Stays (Beyond the Narrative)

After the narrative arc, the README still needs:

- **Credits and lineage** — Alisson Vale and Henrique Bastos. Keep this. It is
  part of the project's identity and signals that this is a serious, considered
  piece of work, not a weekend experiment.
- **Prerequisites list** — just a list with links. No installation steps.
- **Documentation section** — a brief map to the full doc set: Getting Started,
  Briefing, Decisions, Roadmap, Development Guide, REFERENCE.

---

## What Does Not Belong in README After S1

These are removed, not reorganized within README:

- Detailed `memory init` flow → Getting Started
- The 12-persona table → Getting Started
- Full per-runtime start instructions → Getting Started
- Extension install, expose, and clean cycle → Getting Started (summary) and
  extension docs (full)
- Full commands table inline → REFERENCE (pointer only in README)
- "Setting up your identity" walkthrough → Getting Started
- Legacy migration workflow → REFERENCE

---

## Target Length

Under 200 lines. The narrative arc above is approximately 60–70 lines of prose.
Credits, prerequisites, and the documentation section add another 40–50 lines.
The total leaves room for a commands table pointer and formatting without
exceeding the target.

---

## See also

- [S1 index](index.md)
- [S2 — Getting Started Consolidation](../cv9-e4-s2-getting-started-consolidation/index.md)
- [Product Principles — Doing as entry, being as discovery](../../../../../product/principles.md)
