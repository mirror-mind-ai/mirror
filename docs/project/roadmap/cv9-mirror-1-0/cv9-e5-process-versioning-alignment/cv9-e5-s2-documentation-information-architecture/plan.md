[< CV9.E5.S2](index.md)

# Plan — Documentation Information Architecture

## Intent

Make the documentation tree feel intentional before Mirror Mind 1.0. The reader
should understand where to start, where to operate the runtime, where to inspect
project history, and where to find developer references without relying on prior
conversation context.

This story is documentation architecture work. It should improve navigation and
coherence without turning the docs tree into a large migration project unless a
move clearly pays for itself.

---

## Current Tensions

- `docs/index.md` is useful as a map, but it reads more like an inventory than a
  documentation home.
- `docs/process/` now contains both operating process docs and operational repair
  docs (`runtime-repair-policy.md`, `troubleshooting.md`). That may be correct,
  but the boundary should be named.
- `docs/releases/` exists as a top-level area even though the process model is
  organized around Process, Project, and Product.
- Root-level `docs/product/architecture.md` and `docs/product/api.md` are reference/developer
  material, but the docs home does not clearly explain that layer.
- Major folders need landing pages or explicit map entries that explain their
  purpose.
- The worklog will keep growing and needs a prospective scaling rule.
- Product envisioning carries both landing-page and historical synthesis weight.

---

## Proposed Approach

### 1. Inventory and classify docs

Create a short classification of every public `.md` file under `docs/` using the
Process / Project / Product / Reference lens:

- **Process** — how work happens.
- **Project** — what is being built, why, and what has been decided.
- **Product** — what the system is and how it behaves for users/runtimes.
- **Reference** — operational or developer lookup material.

The classification should reveal whether files need to move or only need better
links and labels.

### 2. Redesign `docs/index.md`

Turn the docs index into a real home page:

- short welcome / orientation;
- "start here" paths for new users, operators, contributors, and developers;
- clear sections for Product, Project, Process, and Reference;
- explicit links to runtime self-update, repair policy, architecture, API, and
  release notes.

### 3. Add or refine section landing pages

Check whether these need landing pages or stronger existing pages:

- `docs/product/index.md`
- project documentation landing surface (`docs/project/briefing.md` plus roadmap
  may already be enough)
- process landing surface (`docs/index.md#process` may be enough unless a
  `docs/process/index.md` is introduced)
- `docs/releases/index.md`

Avoid creating empty scaffold pages. Add only pages that reduce navigation
friction.

### 4. Decide moves conservatively

Do not move files just to satisfy symmetry. Prefer keeping stable links unless a
move improves the product surface materially.

Open decisions to resolve in the story:

- Should `docs/releases/` remain top-level or move under `docs/project/`?
- Should `runtime-repair-policy.md` and `troubleshooting.md` remain under
  Process or move to a dedicated operations/reference area?
- Should `architecture.md` and `api.md` stay at `docs/` root as Reference docs,
  or move under a developer/reference folder?
- Should `worklog.md` stay single-file for 1.0 and only gain an archive rule?

### 5. Update roadmap and worklog

At completion:

- mark CV9.E5.S2 done;
- update `docs/process/worklog.md` with what changed;
- update any relevant decision records if a structural move or no-move decision
  is made.

---

## Non-Goals

- Rewriting product content for tone unless navigation requires it.
- Renaming the Process / Project / Product model.
- Moving many files without redirects or link updates.
- Changing runtime behavior.
- Rewriting historical worklog entries.

---

## Acceptance Criteria

- `docs/index.md` reads as a documentation home, not just an inventory.
- Primary reader paths are explicit: new user, operator, contributor, developer.
- Runtime self-update and repair docs are discoverable from the docs home.
- Major top-level docs and folders have a named purpose.
- Any file moves are justified, links are updated, and broken relative links are
  not introduced.
- The worklog has a prospective scaling rule or an explicit decision to defer
  archiving until after 1.0.
