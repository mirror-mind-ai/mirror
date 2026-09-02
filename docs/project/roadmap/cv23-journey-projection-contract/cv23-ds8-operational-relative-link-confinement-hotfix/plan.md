# Delivery Story Plan — CV23.DS8

**Journey:** mirror-mind-development
**Method:** ariad
**Navigator Flow Unit:** delivery_story

## Delivery Story

Operational Relative-Link Confinement Hotfix

## Objective

Correct Operational relative-link confinement without weakening Journey-root security, prove last-valid preservation, and return the installed patch to Nautilus.

## Child Work Packages

- CV23.DS8.TS1

## Scope

- Resolve Markdown targets relative to the containing durable document before
  classifying parent traversal.
- Permit one-level and multi-level `..` traversal only when canonical resolution
  remains inside the registered Journey root.
- Preserve rejection of empty, absolute, URI-like, backslash-based, canonical
  escape, and symlink-escape targets.
- Preserve directory-to-`index.md` behavior, bounded missing-target errors,
  atomic publication, and the last valid manifest/document pair.
- Prove the exact Nautilus CV-to-root-DS topology with an isolated synthetic
  fixture and a read-only compilation of current consumer source.
- Release, install, and return the patch only through separate explicit gates.

## Non-Goals

- Nautilus-specific semantics or Tactical/Strategic schemas in Mirror Core.
- Rewriting legitimate consumer roadmap links.
- Relaxing projection namespace, publication, or Journey-root confinement.
- Invoking Pi, models, providers, network synthesis, or consumer mutation during
  compilation.

## Acceptance Behavior

```text
Given a linked Ariad package uses parent-relative traversal
When its existing canonical target remains inside the registered Journey root
Then Operational compilation includes the package using a normalized root-relative path

Given a target canonically escapes, is absolute, URI-like, backslash-based, or
traverses through a symlink outside the Journey
When Operational compilation evaluates the link
Then it fails with unsafe_projection_path without replacing the last valid pair
```

Missing confined targets fail as bounded source-compilation errors and preserve
last-valid publication. Confined directory links resolve only to their
`index.md`.

## Validation Route

E2E is required because the consumer gate demands the installed public CLI.
Before release: run the focused compiler/publication suites, the complete
projection suite, the broad non-live suite, static checks, immutable acceptance
kit hashes and all external self-tests. Compile the current Nautilus source
read-only without publishing. After explicit release and installation gates:
run the unchanged Nautilus rebuild, inspect the manifest and Operational
snapshot advance, then let Nautilus close TD-001.

## Implementation Contract

Use TDD with a synthetic regression matrix. Canonical Journey-root confinement
is the security authority; lexical `..` presence is not. Resolve existing and
missing candidates without leaking host paths. All publication remains through
`JourneyProjectionService`; no alternate write path or implicit repair is
introduced. Do not mutate the consumer-owned defect spec or acceptance kit.

---

_Approval and lifecycle state are tracked by the Builder runtime, not duplicated in this plan._
