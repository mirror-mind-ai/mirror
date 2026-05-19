[< CV9.E5 Process & Versioning Alignment](../index.md)

# CV9.E5.S1 — Adopt Development Process and Prospective Versioning

**Epic:** CV9.E5 Process & Versioning Alignment  
**Status:** ✅ Done  
**User-visible outcome:** Contributors and agents have one explicit operating model for planning, implementing, verifying, documenting, versioning, and releasing Mirror Mind work.

---

## Problem

Mirror Mind has accumulated strong practices, but the operating model is distributed across memory, worklog habit, the current development guide, and implicit convention. The result is recurring drift:

- Version numbers exist, but their semantic meaning is not defined.
- Story lifecycle exists, but checkpoint discipline is not explicit.
- Roadmap work and maintenance work are not clearly distinguished.
- Release notes are not a first-class artifact.
- Coherence checks happen manually and unevenly.

The Lucas Vidal mirror demo introduced a more complete model that solves these gaps. This story adapts that model to Mirror Mind.

---

## Desired Outcome

After this story:

- A Builder session can start by reading one process guide and know how work should proceed.
- Version bumps after `v0.7.0` follow an explicit prospective rule.
- Releases after this adoption point have narrative release notes under `docs/releases/`.
- The roadmap distinguishes Value, Progress, and Work without forcing every change into a CV/Epic/Story.
- Checkpoints prevent the agent from silently executing through decisions that belong to the navigator.
- The coherence check becomes a required closeout step for non-trivial stories.

---

## Scope

### In scope

- Rewrite `docs/process/development-guide.md` around the adopted model.
- Add `docs/process/triad.md`.
- Add `docs/process/expand-collapse.md`.
- Add `docs/process/versioning.md`.
- Add `docs/process/release-notes.md`.
- Create `docs/releases/` with an index or placeholder policy document if needed.
- Add a decision to `docs/project/decisions.md`.
- Update `docs/index.md`, `docs/process/engineering-principles.md`, CV9 index, and roadmap index links/status.
- Add a `test-guide.md` for this story.

### Out of scope

- Rewriting historical release history.
- Creating release notes retroactively for `v0.2.0` through `v0.7.0`.
- Changing `pyproject.toml` version.
- Creating automation for version bumps or release-note generation.
- Changing code behavior.

---

## Key Decision

Versioning is **prospective**.

Historical tags and versions through `v0.7.0` remain valid as historical project facts, but the new semantic rule does not reinterpret them. The rule applies to future release decisions after this process is adopted.

---

## See also

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [CV9.E5](../index.md)
