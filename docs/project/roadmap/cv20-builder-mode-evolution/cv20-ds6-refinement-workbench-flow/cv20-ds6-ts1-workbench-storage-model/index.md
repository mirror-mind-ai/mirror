[< CV20.DS6](../index.md)

# CV20.DS6.TS1 — Workbench Storage Model

**Type:** Technical Story  
**Status:** 🟡 Planned

## Story

In order to support Refinement Work outside the roadmap, as the Builder runtime,
I want durable Workbench storage for Refinement Stories and Change Requests so
that Builder can compose, resume, and close refinement arcs across sessions.

## Outcome

Runtime persists RS and CR records with stable ids, title/body, status,
association, ordering, provenance, timestamps, and active RS/CR state where
needed.

## Notes

The implementation should inspect current Builder method state helpers and
runtime metadata conventions before choosing dedicated tables or metadata-backed
storage.
