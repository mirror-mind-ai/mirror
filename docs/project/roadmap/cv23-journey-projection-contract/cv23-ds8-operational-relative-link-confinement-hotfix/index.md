[< CV23 — Journey Projection Contract](../index.md)

# CV23.DS8 — Operational Relative-Link Confinement Hotfix

**Status:** ✅ Done — released and accepted in v0.31.11

---

## Outcome

Operational compilation resolves Markdown links from their containing document
and accepts parent-relative traversal only when the canonical target remains
inside the registered Journey root. Real escapes, absolute paths, URI-like
syntax, Windows separators, and symlink escapes remain bounded failures. A patch
release is accepted through the installed Nautilus consumer gate.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV23.DS8.TS1 | Canonical Operational Link Confinement | Technical Story | Replace lexical parent rejection with canonical Journey-root confinement and prove the complete security regression matrix | ✅ Done |

## Done Condition

The source and installed public CLI compile the legitimate Nautilus
CV-to-root-DS topology, all escape and last-valid-preservation regressions pass,
a patch newer than `v0.31.10` is released, and bounded return evidence allows
Nautilus to close TD-001 after its Operational snapshot and manifest advance to
current Ariad truth.

## External Defect Authority

The consumer-owned defect specification remains authoritative for acceptance:

```text
/Users/alissonvale/.mirror-journeys/vida-criativa/nautilus/harness/docs/project/roadmap/
cv-003-nautilus-method-integration/ds-006-three-published-journey-projections/
cv-003-ds-006-ts-2-repository-baselines-and-mirror-compatibility/
td-001-operational-relative-link-confinement-defect.md
```
