[< Roadmap](../index.md)

# CV23 — Journey Projection Contract

**Status:** ✅ Done — v0.31.10 contract plus accepted v0.31.11 confinement hotfix
**Goal:** Implement `mirror.journey-projections@1.0` in the Python Core so local consumers and installed extensions can publish and inspect secure, deterministic, versioned Journey read models, while Ariad publishes an Operational projection without surrendering mutation authority.

---

## Outcome

A caller identifies a registered Journey by ID rather than supplying a production
filesystem root. Mirror resolves that authority, publishes projection and manifest
state with deterministic bytes and per-Journey linearizability, and returns
structured results. Extensions can publish only inside their implicit namespace.
Ariad compiles its durable roadmap, active work, exploratory, and refinement state
into the canonical Operational read model without model or network calls.

The capability is not complete when repository tests pass. It closes only when the
unchanged consumer probe passes against a centrally released and installed Mirror
runtime using isolated synthetic state, and the consumer-owned return record opens
the gate.

## Contract Custody

- Contract: `mirror.journey-projections`
- Version: `1.0`
- Consumer acceptance kit:
  `/Users/alissonvale/.mirror-journeys/vida-criativa/nautilus/harness/contracts/mirror-journey-projections/v1`
- Probe and schema integrity were verified before planning: all recorded SHA-256
  hashes passed and all 16 acceptance-kit self-tests passed.
- Released Mirror `v0.31.10` reports contract `1.0` and Extension API `1.1`.
  The unchanged installed-runtime probe passed and the consumer-owned return
  record opened the gate on 2026-08-25.
- Mirror may implement the contract through its own architecture but must not edit
  the acceptance kit, copy its probe into production code, or depend on Nautilus
  internals.

## Delivery Stories

| Code | Delivery Story | Outcome | Status |
|------|----------------|---------|--------|
| [CV23.DS1](cv23-ds1-contract-custody-public-surface/index.md) | Contract Custody and Public Surface | Python authority, public models, stable result/error vocabulary, Extension API version, and test-only boundary are explicit before storage work begins | ✅ Done |
| [CV23.DS2](cv23-ds2-linearizable-projection-publication-kernel/index.md) | Linearizable Projection Publication Kernel | Secure, deterministic publication and inspection are linearizable per Journey, exclude concurrent processes, prevent manifest lost updates, preserve last-valid authority, and retain immutable internal receipts | ✅ Done |
| [CV23.DS3](cv23-ds3-extension-projection-api/index.md) | Extension Projection API | `ExtensionAPI.journey_projections` publishes and inspects only the bound extension namespace, with optional extension-owned schema validation and reserved-Ariad protection | ✅ Done |
| [CV23.DS4](cv23-ds4-ariad-operational-compiler/index.md) | Ariad Operational Compiler | Durable roadmap, active work, Exploratory Stories, Refinement Stories, and artifact references compile into the normative Operational schema deterministically | ✅ Done |
| [CV23.DS5](cv23-ds5-ariad-lifecycle-refresh/index.md) | Ariad Lifecycle Refresh | Delivery, Explorer, and Refinement mutations request a post-commit refresh without rolling back durable truth when projection publication fails | ✅ Done |
| [CV23.DS6](cv23-ds6-consumer-probe-and-security-acceptance/index.md) | Consumer Probe and Security Acceptance | Test-only preparation, failure injection, security tests, deterministic fixture parity, and the unchanged black-box probe prove v1 behavior without production data | ✅ Done |
| [CV23.DS7](cv23-ds7-release-and-consumer-return/index.md) | Release and Consumer Return | A versioned central release, green CI, safe installed-runtime transition, unchanged installed probe, and complete `mirror-return.json` open the consumer gate | ✅ Done |
| [CV23.DS8](cv23-ds8-operational-relative-link-confinement-hotfix/index.md) | Operational Relative-Link Confinement Hotfix | Confined parent-relative roadmap links compile while canonical escapes remain rejected, then an installed patch reopens the Nautilus consumer gate | ✅ Done |

## Architectural Boundary

The capability belongs to the Python Core while CV22 is paused:

```text
CLI / Ariad lifecycle / ExtensionAPI
                 ↓
       JourneyProjectionService
          ↙              ↘
Operational compiler   Projection publication store
          ↓              ↓
 durable Ariad truth   registered Journey root
```

Suggested internal package:

```text
src/memory/journey_projections/
  models.py
  errors.py
  schemas.py
  paths.py
  serialization.py
  storage.py
  service.py
  operational.py
  refresh.py

src/memory/cli/journey_projection.py
```

CLI and extension façades stay transport-focused. Filesystem publication,
manifest concurrency, schema validation, and Operational meaning must each have
one owner rather than being repeated at call sites.

## Authority and Safety Invariants

1. The registered Journey `project_path` is production root authority. Production
   callers supply `journeyId`, never an arbitrary root path.
2. The `ariad` namespace is Core-only. An extension namespace is permanently
   bound to `ExtensionAPI.extension_id`.
3. Validation and canonical confinement happen before publication. Existing
   symlinks cannot escape the registered root.
4. Publication is **linearizable per Journey** across Core and extension writers.
   Inter-process exclusion covers manifest read, merge, projection replacement,
   manifest replacement, durability, and rollback/diagnosis bookkeeping.
5. The manifest is re-read after the Journey lock is acquired. A publisher never
   commits a manifest derived from a pre-lock snapshot; concurrent namespace
   updates cannot be lost.
6. Inspection participates in the same consistency protocol and returns one
   validated manifest/document state. It never repairs or synthesizes implicitly.
7. Internal immutable receipts bind `(journey, namespace, projection,
   snapshotId)` to the digest of canonical bytes. Reusing an ID for different
   bytes fails before public publication. Receipts are implementation evidence,
   not consumer mutation authority.
8. The manifest atomic replacement is the successful publication linearization
   point. A returned success has a durable projection/manifest pair.
9. A failure never reports success. Completed pre-manifest failures preserve the
   old public pair; post-projection/pre-manifest failure returns bounded,
   actionable divergence and restores the previous projection when safe. A
   process crash may leave diagnosable divergence but never advance manifest
   authority silently.
10. Publication and rebuild invoke no model, persona, provider, Pi process,
    network service, or hidden synthesis.

## Non-Goals

- No Nautilus Tactical or Strategic semantics.
- No projection write-back into Ariad or extension source state.
- No model-generated projection content or semantic auto-refresh.
- No production root supplied directly by callers.
- No production database or private Journey data in acceptance fixtures.
- No TypeScript dual implementation while CV22 is paused.
- No implicit repair during inspection.
- No contract-kit edits to make the implementation pass.

## Sequencing

```text
DS1 public contract and authority
  └── DS2 publication kernel
        ├── DS3 extension API
        └── DS4 Operational compiler
              └── DS5 lifecycle refresh
                    └── DS6 external acceptance
                          └── DS7 release and return
```

The publication kernel precedes every producer. The Operational compiler is not
allowed to invent its own write path. Lifecycle integration begins only after
explicit rebuild is deterministic and publication failure semantics are proven.

## Done Condition

CV23 is done only when:

- public capability discovery reports contract `1.0` and the documented Extension
  API version;
- publication and inspection satisfy schema, confinement, namespace, determinism,
  atomicity, per-Journey linearizability, inter-process exclusion, lost-update
  prevention, and immutable-receipt requirements;
- the Operational compiler matches the normative synthetic fixture byte for byte;
- every represented Ariad lifecycle mutation requests post-commit refresh;
- failure injection proves last-valid preservation or explicit bounded divergence
  at every publication boundary;
- full Mirror CI is green without model or network credentials;
- release notes name both public versions;
- the centrally released runtime is safely installed;
- the unchanged consumer probe passes against that installed runtime with an
  isolated Mirror home;
- `mirror-return.json` is complete, contains no private evidence, and sets
  `gate` to `open` with no unresolved normative deviation.

## Planning Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)

## References

- [Decisions](../../decisions.md)
- [Architecture](../../../product/architecture.md)
- [Extension API](../../../product/extensions/api-reference.md)
- [Engineering Principles](../../../process/engineering-principles.md)
