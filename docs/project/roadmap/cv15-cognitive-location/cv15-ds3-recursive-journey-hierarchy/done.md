[< Story](index.md)

# Done — CV15.DS3 Recursive Journey Hierarchy

## Delivered

Mirror journeys now form organizational trees of arbitrary depth. Parent writes
walk the complete ancestor chain and reject direct, indirect, and malformed
cycles before metadata changes. Moving a journey preserves its identity and
`project_path` and never touches filesystem content.

Textual and web surfaces render recursively. Workspace navigation opens the full
ancestor chain of a selected journey, Current Scene exposes complete lineage and
immediate siblings, All Journeys preserves descendants, and selectors carry
lineage for disambiguation. Text output uses Markdown-safe tree connectors at
every depth.

Journey removal is conservative and transactional: parents with children and
leaves with any associated records are refused; only empty leaves can be removed,
with no cascade or public removal control.

## Preserved Boundaries

- no inherited context, status, content, routing, or Builder state;
- no schema migration;
- no path-derived parentage;
- no filesystem creation, movement, or deletion;
- no automatic reparenting, cascade, watcher, or synchronization;
- no simultaneous TS implementation.

## Evidence

- [Validation](validation.md)
- [Review](review.md)
- Navigator homologation through normal Mirror conversation
- 2,424 unit/integration tests green before the final review refinements
- focused tests, Ruff, formatting, mypy, JavaScript syntax, docs, and diff checks
  green after the final refinements

## TypeScript Follow-through

The moving-target strangler contract is recorded in Decisions. Recursive journey
read parity belongs to CV22.E2.S5; parent writes, cycle rejection, move stability,
and removal refusal belong to CV22.E4 before those commands transfer authority
to TypeScript.
