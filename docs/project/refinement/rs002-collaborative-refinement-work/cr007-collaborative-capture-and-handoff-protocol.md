[< RS002](index.md) · [Canonical status](../index.md#change-requests)

# CR007 — Define The Collaborative Capture And Handoff Protocol

## Problem

The file-first Workbench defines artifact identity, authority, and status vocabulary,
but it does not yet give another contributor's Mirror an operational route for creating
Refinement Work, allocating the next project-wide ID, choosing or creating an RS,
claiming execution, updating status, and returning evidence through a pull request.
Status names exist without a complete collaboration-oriented transition contract.

## Expected Behavior

A contributor and their Mirror can follow one bounded document-first workflow to:

1. inspect the canonical index before mutation;
2. choose the next available project-wide RS or CR identifier;
3. capture a CR without silently changing current focus;
4. attach it to an explicit RS or leave the missing decision visible;
5. distinguish `captured`, `planned`, `in_progress`, and terminal states;
6. claim and release execution explicitly;
7. link delivery through Git or a pull request;
8. return evidence, limitations, and maintainer decisions in a reviewable handoff;
9. resolve concurrent edits through ordinary Git conflict handling.

The protocol must keep read-only requests read-only and preserve Navigator authority for
focus, status, assignment, merge, publication, and release.

## Impact

Without a shared protocol, the canonical backlog is readable but not safely
transferable. Each collaborator must reconstruct local conventions, increasing the risk
of duplicate IDs, accidental focus changes, ambiguous status, and incomplete handoffs.

## Plan Or Decision

Create one linked, project-owned collaboration protocol and teach the file-first Builder
skill to follow it. Keep the canonical index compact while making the complete workflow
available to another contributor's Mirror without private conversation context.

### Protocol contract

The protocol must define these movements:

1. **Inspect** — read the canonical index and relevant linked documents before any
   mutation; never inspect SQLite when the file-first index exists.
2. **Capture** — allocate the next unused project-wide numeric ID, create the minimum CR
   narrative, and append a `captured` row without changing current focus. A target RS is
   required because the current artifact convention has no unassigned directory; stop
   for the missing decision rather than inventing one.
3. **Select** — update only `Current Focus`; selection does not change status or
   authorize planning or implementation.
4. **Plan** — record scope, boundaries, acceptance behavior, validation, and exclusions
   in the CR document, then move `captured` to `planned` after Navigator approval.
5. **Assign and start** — before `in_progress`, identify one human Driver and a delivery
   branch or PR; update status, Driver, and Delivery atomically.
6. **Implement and evidence** — keep scope bounded, preserve files as authority, run
   checks, and record evidence without claiming validation.
7. **Validate** — provide a natural user route and require explicit Navigator acceptance
   before `validated`.
8. **Review and close** — record proportionality/debt findings, then move the CR to
   terminal history as `done`, `parked`, `rejected`, or `promoted`; clear focus when the
   focused CR becomes terminal.
9. **Return handoff** — report canonical status, Driver, Delivery, changed files, checks,
   human validation, limitations, unresolved maintainer decisions, and requested next
   action.
10. **Resolve concurrency through Git** — refresh the branch before delivery, preserve
    semantic conflicts for human resolution, and never renumber or overwrite another
    contributor's CR silently.

### Status meaning

Document concise operational meanings for every canonical CR status. Status transitions
remain semantic project edits, not an application state machine. `blocked`, `parked`,
`rejected`, and `promoted` require a reason in the CR narrative; `parked` also requires a
revisit trigger, and `promoted` requires a Delivery target.

### Implementation route

1. Add `collaboration-protocol.md` beside the RS002 documents and link it from RS002 and
   the canonical index.
2. Extend `.pi/skills/mm-build/SKILL.md` with the file-first lifecycle, ID allocation,
   capture, focus, assignment, terminal, concurrency, and return-handoff rules.
3. Update `REFERENCE.md` with the protocol summary and canonical document link.
4. Assign CR007 to `@alissonvale` on the existing
   `refinement/rs002-collaborative-workbench` branch when implementation begins.
5. Validate in an isolated project and newly loaded Pi session through two natural
   requests: first show the Workbench; then capture a clearly specified CR under an
   explicit RS. The capture must allocate the next ID, create the narrative, preserve
   focus, remain `captured` and unassigned, and avoid SQLite.
6. Present a second manual validation route that asks the Navigator to inspect the
   resulting protocol and confirm that another contributor could follow it without this
   conversation.

### Acceptance behavior

- Another Mirror can create a well-formed CR with the next available project-wide ID
  while preserving current focus and assignment boundaries.
- Status meanings and transition prerequisites are available in project documents.
- The return handoff has one compact standard shape without becoming a persistence or
  synchronization subsystem.
- Concurrent ID or index edits surface as ordinary Git conflicts and are never resolved
  semantically without the Navigator.
- Read-only, assignment, commit, push, merge, publication, and release boundaries remain
  explicit.

### Conscious exclusions

- ID reservation services, locks, watchers, heartbeats, stale-work automation, Markdown
  parsing, schema validation, projection, synchronization, and custom Git commands.
- Automatic branch creation, commit, push, pull-request creation, merge, or release.
- Claude Code skill parity.

## Evidence

The first cross-contributor PR review required a manually authored handoff comment so
another person's Mirror could prepare, execute, and return work without inheriting the
maintainer's private conversation context. The pattern is useful evidence for a shared
protocol, but not evidence for automation.

Implementation added `collaboration-protocol.md`, linked it from the canonical index and
RS002, and aligned `.pi/skills/mm-build/SKILL.md` plus `REFERENCE.md` with the inspect,
capture, select, plan, assign, evidence, validate, terminal, handoff, and Git-concurrency
boundaries. No Python runtime, parser, storage, schema, watcher, synchronization, or
custom Git code changed.

An isolated Pi smoke used the `cr005-smoke` journey and
`/tmp/mirror-cr005-smoke/project`. From the natural request to capture a fully specified
refinement under RS002 without changing focus, another newly loaded Mirror:

- allocated the next project-wide ID, `CR008`;
- created a well-formed evolving CR document under RS002;
- appended it as `captured` with Driver and Delivery `—`;
- linked it from RS002;
- preserved focus on CR007;
- stated that SQLite was not consulted; and
- made no change to the real project Workbench because the smoke project was isolated.

The generated smoke artifact remains under `/tmp/mirror-cr005-smoke/project` only; it is
validation evidence, not a real CR008 capture in this repository.

The first Navigator-facing read-only validation explained capture through terminal
closure but omitted the required return handoff and Git concurrency guidance. This was
a CR007 acceptance failure, not accepted evidence. Builder guidance was tightened to
require the complete route for natural questions about creating or collaborating on
Refinement Work. A second isolated run of the same natural prompt then included all
nine lifecycle movements, the return-handoff fields, Git conflict behavior, the durable
protocol path, the read-only boundary, and the no-SQLite rule.

Documentation links, roadmap heading uniqueness, and `git diff --check` passed before
the smoke.

## Review

The implementation is proportional to the collaboration goal. It adds one project-owned
protocol, operational skill guidance, and a public reference summary. It does not add
runtime parsing, storage, ID allocation services, locks, watchers, synchronization,
schema validation, or custom Git behavior. Duplication is bounded intentionally: the
protocol is the durable authority, the skill carries the agent route, and `REFERENCE.md`
provides discoverability.

The first manual validation exposed a real presentation omission — return handoff and
Git concurrency were not surfaced — and the correction stayed inside CR007. The repeated
natural prompt then rendered the complete route. No corrective debt action remains.
Further automation requires repeated collaboration failures, not speculation.

## Outcome

Done. The Navigator accepted the contributor-facing protocol on 2026-08-03 using the
natural prompt `como trabalhar com refinements?`. The response covered all nine
movements, return handoff, Git conflict behavior, current canonical assignment, the
file-first/SQLite boundary, and the read-only boundary.

CR007 moved to terminal history with `@alissonvale` and
`refinement/rs002-collaborative-workbench` preserved as provenance. Current CR focus was
cleared. All Change Requests in RS002 are now terminal; reviewing or closing RS002 is a
separate Navigator decision.
