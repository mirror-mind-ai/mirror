[< Parent](../index.md)

# CV22.DS7.TS2 — Extension Context Provider Runtime Convergence

**Status:** 🟡 Planned
**Type:** Technical Story
**Origin:** Approved CV22.DS7.US4 Plan scope decision
**Depends on:** CV22.DS7.US4 establishing the bounded matching-binding fallback and parity evidence

---

## Technical Outcome

Eliminate the last Python authority inside `mirror load` when an installed extension
context binding matches the selected persona or journey. The TypeScript core must preserve
existing extension-provided context without silently dropping it and without introducing a
permanent TypeScript-to-Python execution bridge.

## Why This Story Exists

US4 grounding found that `src/memory/extensions/context.py` loads installed extension
providers as arbitrary Python functions. The existing TypeScript core has no equivalent
extension execution runtime. Treating that as ordinary US4 context assembly would either:

- silently remove user-visible extension context;
- expand US4 into an extension-platform redesign; or
- preserve Python through a permanent language bridge, contradicting the database-seam
  strangler and Python-retirement goal.

The Navigator chose a bounded sequence: US4 ports the extension-free Mirror path and keeps
an explicit Python fallback whenever a matching installed binding could contribute; TS2
owns the compatibility design and removal of that fallback before DS7 can finish.

## Scope

- Inventory the installed extension context-provider contract: manifests, loader API,
  bindings, provider requests, ordering, output sections, and failure isolation.
- Design and implement a TS-owned compatibility contract for extension context providers.
- Preserve existing installed-extension behavior through an explicit migration or adapter
  strategy that has a finite Python-retirement endpoint.
- Port binding selection, deterministic ordering, request shape, section rendering, missing
  extension/capability behavior, and provider-failure isolation.
- Remove US4's matching-extension Python fallback only after parity and runtime evidence.
- Register all transferred Python extension oracles and update the DS7 burn-down ledger.

## Non-Goals

- Runtime skill discovery/projection for Gemini CLI or Codex (CV9.E2.S2).
- Marketplace or remote extension installation.
- Unrelated `extensions`/`ext` command burn-down (DS7.TS1), except shared primitives that
  the approved design deliberately assigns here.
- A permanent subprocess bridge to execute Python providers.
- Silent disabling of existing extensions.
- Complete Python deletion or npm publication (DS10).

## Required Design Decision Before Plan Approval

The TS2 Plan must choose and document how existing Python extension providers converge.
Acceptable proposals must show:

1. how current installations continue to behave during transition;
2. how extension authors migrate to the TS-owned provider contract;
3. how compatibility ends rather than becoming permanent dual authority;
4. how provider code is isolated and failures remain fail-soft;
5. how no identity, query, or extension payload leaks into operational logs.

If no finite compatibility path exists, stop for a product-level extension support decision
rather than hiding Python dependence.

## Acceptance Behavior

```text
Given installed extensions with persona and journey context bindings
When mirror load selects a matching persona or journey
Then the TypeScript-owned extension runtime invokes compatible providers in stable order
And renders the same extension context sections as the Python oracle
And missing, unknown, or failing providers remain isolated
And no permanent Python execution bridge is required
And US4's matching-binding fallback is removed
```

## Validation

- Contract and migration tests for existing extension manifests/providers.
- Golden parity for binding selection, ordering, request fields, section rendering, and
  failure isolation.
- Runtime smoke with a synthetic reference extension on a disposable Mirror home.
- Front-door proof that matching bindings no longer route `mirror load` to Python.
- Redaction tests covering query, user, persona, journey, and provider output.
- Full DS7 regression and oracle-drift checks.

## Done Condition

- A TS-owned extension context provider runtime is authoritative.
- Existing supported extensions have a documented finite migration/compatibility route.
- US4's explicit matching-binding Python fallback is deleted.
- `mirror load` counts as fully burned down in DS7.
- No extension context is silently lost and no permanent language bridge remains.
