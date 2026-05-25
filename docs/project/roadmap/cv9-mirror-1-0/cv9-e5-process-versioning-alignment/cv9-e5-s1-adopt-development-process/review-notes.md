[< CV9.E5.S1](index.md)

# Documentation Review Notes

Working notes for the documentation review of CV9.E5.S1. These are findings gathered while reading the docs through the Mirror Web Console.

This file is intentionally provisional. Findings here are not decisions yet. They become implementation changes only after review and grouping.

---

## How to Use

Add each finding as a checkbox under the right category.

Suggested shape:

```markdown
- [ ] Short finding title.
  - Source: `path/to/file.md`
  - Problem: what feels wrong, stale, duplicated, unclear, or incoherent
  - Direction: optional first idea for the fix
```

---

## Findings

### Process

- [x] Give the Driver/Navigator metaphor more structural weight.
  - Source: `docs/process/development-guide.md`
  - Problem: the metaphor is strong and clarifying, but after the opening it becomes less explicit. The guide should keep using Driver and Navigator language throughout the lifecycle so responsibilities stay concrete.
  - Direction: rewrite lifecycle steps in terms of Driver/Navigator responsibilities. Example: "The Driver prepares a manual validation route; the Navigator drives through it and confirms what they see." Connect the model explicitly to XP pair programming: the agent is the Driver at the keyboard, the user is the Navigator holding direction, intent, and design judgment.

- [x] Add an Engineering Lineage section.
  - Source: `docs/process/development-guide.md`
  - Problem: the guide embodies XP, Agile/Lean, Kanban, ADR, CI, release engineering, and LLM eval practices, but does not name its lineage. Naming it would help readers understand that the process is not arbitrary ceremony.
  - Direction: add a concise "Engineering Lineage" section. Mention XP pair programming, TDD, refactoring, CI, small increments; Kanban/Lean WIP discipline through not growing scope mid-story; ADRs; smoke testing; release engineering; living documentation; and LLM eval separation. Keep it as lineage, not methodology display.

- [x] Make WIP discipline explicit as Kanban/Lean lineage.
  - Source: `docs/process/development-guide.md`
  - Problem: the guide says to keep scope stable and not grow scope during implementation, but it does not name this as WIP discipline. The Kanban reference clarifies why this matters: unfinished scope accumulation creates invisible load.
  - Direction: in the lifecycle or Engineering Lineage section, name WIP discipline: new work discovered during a story is captured for later unless required for coherence or correctness.

- [x] Make manual user validation explicit after implementation.
  - Source: `docs/process/development-guide.md`
  - Problem: the guide mentions tests and manual/smoke validation, but it does not clearly say that the Driver should give the Navigator a step-by-step way to see what was implemented and wait for manual validation before continuing.
  - Direction: add a required validation handoff after implementation/testing: the Driver provides commands, URLs, screenshots if applicable, expected observations, and asks the Navigator to confirm before documentation/review/closeout.

- [x] Clarify when push should happen.
  - Source: `docs/process/development-guide.md`
  - Problem: the guide says push preferably at a coherent story or epic boundary, but this is not concrete enough. It should distinguish local commits, push, and release/PR boundaries.
  - Direction: define default push policy, for example: commit locally during/after story slices; push after story completion when standalone, after epic completion when stories are tightly coupled, or immediately for collaboration/CI needs. Always verify GitHub Actions after push.

- [x] Add pull request guidance.
  - Source: `docs/process/development-guide.md`
  - Problem: the guide does not describe when to use PRs, how PRs relate to stories/epics/releases, or what must be in a PR description.
  - Direction: add PR policy: when working on shared/public branches, open PRs at story or epic boundaries; PR description should link roadmap docs, summarize validation, mention release/version impact, and list conscious exclusions. Clarify whether solo local work on `main` is acceptable or whether release-bound work should move through PRs.

### Project

- [ ] Design a scaling strategy for the worklog.
  - Source: `docs/process/worklog.md`
  - Problem: the worklog is already long and will grow quickly over time. A single ever-growing file becomes harder to navigate, slower to read in context, and less useful as an operational surface.
  - Direction: consider a current worklog plus archive model, e.g. `docs/project/worklog/index.md` with yearly/monthly files, or `docs/project/history/`. Keep a short current log for active work and move older entries into archives. Decide whether worklog belongs under Process or Project before moving.

### Product

- [ ] Reclassify or contextualize "Coherence as Product Architecture".
  - Source: `docs/product/envisioning/index.md`
  - Problem: the document feels historically important and exploratory, but not necessarily a stable product architecture document. It may be closer to a spike, synthesis, or historical envisioning artifact.
  - Direction: keep the Envisioning section, but clarify document types inside it: active explorations, historical spikes/syntheses, and retroactive envisioning. Decide whether this doc should stay as the section index, become a named historical artifact, or be split into a landing page plus the original exploration.

- [x] Add exploratory/discovery work to the development process.
  - Source: `docs/process/development-guide.md`, current CV9.E5 documentation review
  - Problem: the guide assumes the work is already known enough to become a story with a plan and implementation. But some work is exploratory: reading, sensemaking, IA redesign, spikes, and retroactive envisioning. Forcing that into implementation-shaped lifecycle creates premature closure.
  - Direction: add a discovery/envisioning path before or beside the story lifecycle. It should describe when the Driver and Navigator are exploring rather than implementing, what artifacts can result (spike, envisioning note, decision, roadmap proposal), and how exploration collapses into a story plan when ready.

- [ ] Consider whether CV9.E5 itself has a retroactive envisioning artifact.
  - Source: current process/versioning alignment work
  - Problem: the process work is not just implementation. It is discovering and naming the operating philosophy of Mirror development: Driver/Navigator, XP lineage, triad, expand/collapse, versioning, release notes. That may deserve an envisioning/synthesis record, not only process docs.
  - Direction: decide whether to create an envisioning note for the development model, or whether the process docs plus decision record are sufficient.

- [ ] Reconsider whether Troubleshooting belongs under Product instead of Process.
  - Source: `docs/process/troubleshooting.md`, `docs/index.md`
  - Problem: troubleshooting documents product/runtime failure modes, symptoms, root causes, and fixes. That feels closer to product/operations than process. Process should describe how we work, not product behavior in the wild.
  - Direction: evaluate moving it to `docs/product/troubleshooting.md`, `docs/product/operations/troubleshooting.md`, or a future reference/operations area. Update links accordingly if moved.

### Navigation and Links

- [ ] Move releases under the Project dimension.
  - Source: `docs/releases/index.md`, Web Console left navigation
  - Problem: the top-level tree currently shows Process, Product, Project, and Releases. Releases do not have the same conceptual weight as the triad dimensions, and their current top-level position weakens the process/project/product structure.
  - Direction: move release notes under `docs/project/releases/` or another project-owned location. Update release-note docs and versioning links accordingly.

- [ ] Add folder cover pages for major documentation sections.
  - Source: Web Console folder navigation
  - Problem: clicking or opening a folder should give the reader a cover page for that area, not only a file tree. Process, Product, Project, and any major subarea need a short description and links to the main documents inside.
  - Direction: ensure each major folder has an `index.md` that acts as a section landing page, similar to the docs home but scoped to that folder.

- [ ] Add a real documentation home page at the beginning of the docs experience.
  - Source: `docs/index.md`
  - Problem: the current "About these Docs" page behaves more like a documentation map than a welcoming home. The Web Console needs a clear first page that describes Mirror Mind at a high level and routes readers by interest.
  - Direction: redesign `docs/index.md` as a home page: what Mirror Mind is, what problem it solves, and entry points for users, contributors, product/design readers, process, roadmap, and reference.

- [ ] Reconsider whether `docs/product/architecture.md` and `docs/product/api.md` belong at the docs root.
  - Source: `docs/product/architecture.md`, `docs/product/api.md`, `docs/index.md`
  - Problem: Architecture and Python API are developer/contributor references, but currently sit at the root beside Getting Started and the docs index. This may flatten the information architecture too much.
  - Direction: evaluate moving them under a more explicit developer/reference area, for example `docs/project/architecture.md`, `docs/reference/api.md`, or `docs/developers/`. Decide based on audience and existing doc taxonomy before moving.

- [ ] Separate documentation home content from documentation map content.
  - Source: `docs/index.md`
  - Problem: "About these Docs" may be carrying two responsibilities: a home page for Mirror Mind documentation and a structural map of the doc set.
  - Direction: decide whether `docs/index.md` should become the home page and whether a separate map file is needed, or whether the home can include a compact map without becoming only a map.

### Versioning and Releases

### Language and Clarity

- [x] Simplify movement labels in the expand/collapse story lifecycle table.
  - Source: `docs/process/expand-collapse.md`
  - Problem: labels such as "Proto-collapse", "Re-expand", "Structural collapse", "Recognized collapse", and "Named collapse" add extra categories beyond the core model. They may make the concept feel more complex than necessary.
  - Direction: keep table labels to the two core movements: Expand or Collapse. Put nuance in the description column instead of creating additional movement categories.

- [x] Make expand/collapse operationally visible to the Navigator.
  - Source: `docs/process/expand-collapse.md`, `docs/process/development-guide.md`
  - Problem: expand/collapse is powerful but currently risks staying conceptual, visible only to the AI or to retrospective interpretation. The Navigator needs to see how it affects the development conversation.
  - Direction: add practical narration rules. At key moments, the Driver names the current movement briefly, e.g. "I am expanding the ambiguity into three options", "I am collapsing these findings into a plan", "This is a coherence collapse before closeout". Keep narration lightweight and tied to checkpoints, not constant self-commentary.

- [x] Define collapse by emergent value, not just aggregation.
  - Source: `docs/process/expand-collapse.md`, `docs/process/development-guide.md`
  - Problem: a collapse should answer: what did the whole gain that the parts did not have? Without that, collapse can be mistaken for bundling or summarizing.
  - Direction: add a practical rule: every collapse names the emergent property of the whole. Example: a manual validation route is not just commands + URLs + expected outputs; as a whole, it gives the Navigator an independent way to recognize whether the implementation is real and aligned with intent.
  - Conceptual refinement: collapse changes a property or quality of the system, in an Aristotelian sense. It makes the system more valuable by changing its state or disposition: more decidable, more validatable, more trustworthy, more transmissible, more coherent, more releasable.
  - Required content: document the lifecycle properties explicitly somewhere, likely in `expand-collapse.md`: plan collapses options into decidability; validation route collapses implementation into validatability; tests collapse cases into trustworthiness; documentation collapses facts into transmissibility; review collapses changes into discernment; coherence check collapses artifacts into coherence; status collapses work into recognition; release note collapses changes into public narrativity; version collapses delivery into a milestone.

- [x] Define expand by differentiated possibility, not just decomposition.
  - Source: `docs/process/expand-collapse.md`, `docs/process/development-guide.md`
  - Problem: if collapse gains a new quality, expand also needs an operational meaning beyond "split things apart". Otherwise expand sounds like decomposition rather than disciplined inquiry.
  - Direction: define expand as making latent possibility actionable through distinction. Expand changes the system's disposition by increasing intelligibility, optionality, diagnosability, assignability, testability, or implementability. Required content: add lifecycle examples for expand as well.

### Open Questions

---

## Later Grouping

### Proposed grouping after Navigator review

#### In scope for CV9.E5.S1 before closing

These findings complete the process/versioning adoption itself and should be addressed before S1 is marked done:

- Give the Driver/Navigator metaphor more structural weight.
- Add an Engineering Lineage section.
- Make WIP discipline explicit as Kanban/Lean lineage.
- Make manual user validation explicit after implementation.
- Clarify when push should happen.
- Add pull request guidance.
- Add exploratory/discovery work to the development process.
- Simplify movement labels in the expand/collapse story lifecycle table.
- Make expand/collapse operationally visible to the Navigator.
- Define collapse by emergent value, not just aggregation.
- Define expand by differentiated possibility, not just decomposition.

#### Follow-up CV9.E5.S2, Documentation Information Architecture

These findings are about the docs tree and Web Console reading experience. They are coherent enough to become a separate story after the process model is closed:

- Add a real documentation home page at the beginning of the docs experience.
- Separate documentation home content from documentation map content.
- Add folder cover pages for major documentation sections.
- Move releases under the Project dimension.
- Reconsider whether `docs/product/architecture.md` and `docs/product/api.md` belong at the docs root.
- Reconsider whether Troubleshooting belongs under Product instead of Process.
- Design a scaling strategy for the worklog.
- Reclassify or contextualize "Coherence as Product Architecture".

#### Open decision before S2 planning

- Consider whether CV9.E5 itself has a retroactive envisioning artifact.

This may belong in S1 if it helps explain the process adoption, or in S2 if it becomes part of the broader documentation information architecture.

#### Intentionally deferred for now

- No retroactive release notes for historical tags through `v0.7.0`.
- No code automation for versioning, release notes, or docs navigation in this story.
