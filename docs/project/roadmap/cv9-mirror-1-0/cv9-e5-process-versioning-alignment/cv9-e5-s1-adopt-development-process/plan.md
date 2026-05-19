[< CV9.E5.S1](index.md)

# Plan — Adopt Development Process and Prospective Versioning

## Intent

Bring the development process designed in the Lucas Vidal mirror demo into Mirror Mind, adapted to this repository's language, history, runtime model, and public-release trajectory.

This is process work, not product behavior work. The deliverable is a coherent operating model that future Builder sessions can follow without relying on implicit memory.

---

## Source Material

Source docs from the Lucas Vidal mirror demo:

- `docs/process/development-guide.md`
- `docs/process/triad.md`
- `docs/process/expand-collapse.md`
- `docs/process/versioning.md`
- `docs/process/release-notes.md`

Mirror Mind docs to reconcile:

- `docs/process/development-guide.md`
- `docs/process/engineering-principles.md`
- `docs/process/worklog.md`
- `docs/project/roadmap/index.md`
- `docs/project/roadmap/cv9-mirror-1-0/index.md`
- `docs/project/decisions.md`
- `docs/index.md`

---

## Adaptation Principles

### Keep Mirror Mind's domain language

Mirror already uses **CV** as **Capability Value**. Do not rename it to Community Value. The generic model becomes:

- **Value:** Capability Value, represented as CV.
- **Progress:** Epic and Story.
- **Work:** Task or maintenance work.

### Preserve historical versions

Mirror has tags from `v0.2.0` through `v0.7.0`. These versions were created before the new rule and must remain historical facts. The new rule is prospective.

The versioning doc should state:

- Through `v0.7.0`, versioning was pragmatic and historical.
- From the adoption point onward, versioning follows the new rule.
- No retroactive release notes are required for old versions.
- Old worklog entries may remain as the historical record for pre-adoption releases.

### Keep English docs

The source process is in Portuguese. Mirror Mind docs are English. The imported model must be rewritten in English, not pasted and translated mechanically.

### Do not collapse engineering principles into the development guide

`engineering-principles.md` remains the home for code, testing, and process principles. `development-guide.md` becomes the operating lifecycle. Cross-link rather than duplicate.

---

## Proposed Document Changes

### `docs/process/development-guide.md`

Rewrite around these sections:

1. Operating model
   - Navigator/driver stays.
   - Driver speaks up when the process, project, or product drifts.
2. Conceptual base
   - Link to triad and expand/collapse.
3. Taxonomy
   - Value = CV.
   - Progress = Epic/Story.
   - Work = Task/Maintenance.
4. Opening ritual
   - Am I blocked by ambiguity?
   - Am I lost in fragments?
   - Is the work flowing?
   - Optional release intent.
5. Story lifecycle
   - Plan.
   - Implementation.
   - Test.
   - Documentation.
   - Review ritual.
   - Coherence check.
   - Status.
   - Commit, push, release.
6. Pause discipline
   - After plan.
   - After green tests and manual/smoke validation.
   - After review/refactoring assessment.
   - Before commit/push.
7. Verification checklist
   - Keep existing `uv` commands.
   - Add docs link checks using available shell commands.
8. Commits and pushes
   - Keep English commit messages for Mirror.
   - Keep GitHub Actions verification after push.
9. Evals
   - Keep existing eval guidance.

### `docs/process/triad.md`

Adapt the process/project/product triad:

- Process: development guide, engineering principles, worklog, release notes, versioning.
- Project: briefing, decisions, roadmap, story plans.
- Product: Python core, runtime surfaces, SQLite schema, templates, docs consumed by users.

### `docs/process/expand-collapse.md`

Adapt the rhythm to Mirror without making it mystical or ornamental:

- Expand resolves ambiguity by differentiating.
- Collapse resolves fragmentation by integrating and naming value.
- Apply to roadmap hierarchy, triad coherence, story lifecycle, release notes.

### `docs/process/versioning.md`

Create a prospective semantic rule:

- Format remains `vMAJOR.MINOR.PATCH`.
- MAJOR increments when a Capability Value is completed and release-ready.
- MINOR increments when an Epic closes and is released without closing a CV.
- PATCH increments when a Story or maintenance fix is released independently.
- Pre-adoption versions through `v0.7.0` remain historical.
- The version number does not encode the CV index.
- Roadmap identity lives in release notes, not in the number.

Open question for navigator: after CV9 closes, should that become `v1.0.0` because it is explicitly Mirror Mind 1.0, even though many CVs were historically completed before process adoption? Proposed answer: yes, CV9 closing should be allowed to become `v1.0.0` by product meaning and public-release intent. The versioning doc should name this as the first prospective major boundary.

### `docs/process/release-notes.md`

Create narrative release-note guidance:

- Release notes live in `docs/releases/vX.Y.Z.md`.
- They are not changelogs.
- Include frontmatter digest, title/date, concrete bullets, narrative sections, conscious exclusions, next horizon.
- For Mirror, first person may be used in project-internal release notes only when appropriate; public-facing release notes may use project voice.

### `docs/releases/`

Create `docs/releases/index.md` explaining:

- Release notes start prospectively from this process adoption.
- Historical releases before adoption are tracked in Git tags and worklog.
- Retroactive notes may be added later, but are not required for this story.

### `docs/project/decisions.md`

Add a decision:

- Adopt process/project/product triad, expand/collapse rhythm, explicit story lifecycle, release notes, and prospective versioning.
- Historical versions remain historical.
- Future release decisions follow the new versioning doc.

### Roadmap docs

Update:

- CV9 index to include E5.
- Roadmap index if needed.
- Story status after completion.

---

## Implementation Sequence

1. Create CV9.E5 and CV9.E5.S1 planning docs.
2. Pause for navigator confirmation.
3. Add new process docs and rewrite `development-guide.md`.
4. Add release notes directory index.
5. Update docs index, engineering principles, decisions, and roadmap status.
6. Run verification from `test-guide.md`.
7. Conduct coherence check.
8. Mark story done and update worklog.
9. Present commit message for confirmation before committing.

---

## Risks

### Over-importing Conjunto language

The source process is deeply shaped by Conjunto. Mirror Mind should inherit the operating logic, not project-specific examples or Portuguese naming.

Mitigation: write Mirror-native examples throughout.

### Versioning contradiction with existing history

A strict retroactive rule would imply that old versions were wrong or require mass rewriting. That would create noise.

Mitigation: explicitly declare the rule prospective.

### Duplicating principles

The development guide could absorb engineering principles and create future drift.

Mitigation: lifecycle in `development-guide.md`; principles in `engineering-principles.md`.

### Too much ceremony

A process can become heavy if every tiny change requires the full story ritual.

Mitigation: distinguish non-trivial story work from maintenance and trivial fixes. The full lifecycle applies to non-trivial work.

---

## Checkpoint Decision Needed

Before implementation, confirm these choices:

1. CV9.E5 is the right home for this process adoption.
2. Versioning is prospective from after `v0.7.0`.
3. CV9 closing may become `v1.0.0` as the first prospective major boundary.
4. Release notes begin prospectively under `docs/releases/`, without retroactive notes for old tags.
