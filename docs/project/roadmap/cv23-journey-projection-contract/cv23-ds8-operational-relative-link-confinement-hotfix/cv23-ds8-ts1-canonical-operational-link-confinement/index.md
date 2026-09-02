[< Parent](../index.md)

# CV23.DS8.TS1 — Canonical Operational Link Confinement

**Status:** ✅ Done
**Type:** Technical Story

---

## Technical Story

In order to preserve valid Ariad roadmap topology without weakening confinement,
As the deterministic Operational compiler,
I want to classify relative links by their canonical resolved target,
So that confined parent traversal compiles and real Journey-root escapes fail closed.

## Outcome

The compiler accepts confined `..` traversal, rejects canonical and symlink
escapes, and preserves the last valid publication on every failed rebuild.

## Acceptance Behavior

```text
Given a parent-relative Markdown link whose canonical target remains in the Journey
When the Operational compiler resolves it from the containing document
Then the linked roadmap package is represented with a normalized root-relative path

Given the canonical target escapes or uses an unsupported path form
When compilation evaluates the link
Then unsafe_projection_path is returned and the last valid pair remains unchanged
```

## Scope

- Canonical resolution before Journey-root classification.
- Complete consumer-specified regression and security matrix.
- Isolated Nautilus CV-to-root-DS topology reproduction.
- Existing publication and contract compatibility.

## Out Of Scope

- Nautilus semantics, source rewrites, derived projection schemas, or alternate
  publication paths.

## Validation

Focused compiler and publication tests, broad projection regressions, static
checks, read-only current Nautilus compilation, then installed public-CLI
consumer acceptance after separate release authorization.
