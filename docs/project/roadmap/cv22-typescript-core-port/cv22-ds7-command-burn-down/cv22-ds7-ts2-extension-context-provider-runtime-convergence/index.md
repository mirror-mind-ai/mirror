[< Parent](../index.md)

# CV22.DS7.TS2 — Extension Context Provider Runtime Convergence

**Status:** ✅ Done — validation accepted; temporary compatibility host carried to mandatory DS10 deletion
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

## Planned Design

The Plan proposes a language-neutral, out-of-process `mirror-context-v1` JSON protocol.
Extension capabilities can declare a no-shell argv command; TS owns binding selection,
ordering, bounded process execution, section rendering, and Mirror orchestration.

Existing Python-only providers remain functional during CV22 through a narrow compatibility
host that speaks the same protocol and invokes exactly one named provider. This is finite,
deprecated transition code: CV22.DS10 must delete it before Python retirement/npm
publication. It never owns binding selection or the complete `mirror load` route.

Plan approval must explicitly accept both the process contract and the DS10 deletion gate.

## Scope

- Inventory the installed extension context-provider contract: manifests, loader API,
  bindings, provider requests, ordering, output sections, and failure isolation.
- Introduce and validate the language-neutral `mirror-context-v1` provider descriptor and
  request/result envelope.
- Implement TS-owned binding selection, bounded no-shell process dispatch, stable ordering,
  section rendering, and metadata-only diagnostics.
- Preserve existing Python providers through the explicitly temporary compatibility host.
- Port missing extension/capability behavior and provider-failure isolation.
- Remove US4's matching-extension whole-command Python fallback only after parity and
  disposable-home runtime evidence.
- Document provider migration and the DS10 compatibility-host removal gate.
- Register all transferred Python extension oracles and update the DS7 burn-down ledger.

## Non-Goals

- Runtime skill discovery/projection for Gemini CLI or Codex (CV9.E2.S2).
- Marketplace or remote extension installation.
- Unrelated `extensions`/`ext` command burn-down (DS7.TS1), except the narrow optional
  manifest validation needed by this provider contract.
- A permanent subprocess bridge to execute Python providers.
- Silent disabling of existing extensions.
- Live LLM/embedding cutover (DS8).
- Complete Python deletion or npm publication (DS10).
- Production/development database or extension inspection.

## Required Design Decision Before Plan Approval

The Navigator must accept or reject the proposed finite convergence path:

1. current Python providers work through the narrow compatibility host during CV22;
2. authors migrate each capability to a language-neutral `mirror-context-v1` command;
3. TS immediately owns selection, ordering, orchestration, and complete-command routing;
4. provider processes are bounded and fail-soft, with payload-free operational logs;
5. CV22.DS10 deletes the compatibility host and treats unmigrated capabilities as an
   explicit migration error rather than silently omitting context.

If that cutoff is unacceptable, stop for a product-level extension support decision rather
than hiding indefinite Python dependence.

## Acceptance Behavior

```text
Given installed extensions with persona and journey context bindings
When mirror load selects a matching persona or journey
Then the TypeScript-owned extension runtime invokes providers in stable order
And renders the same extension context sections as the Python oracle
And current Python-only providers remain compatible through a finite named adapter
And missing, unknown, malformed, timed-out, or failing providers remain isolated
And selected-journey isolation is preserved
And no request or provider payload enters operational logs
And the complete mirror load command does not fall back to Python
And the compatibility adapter has a mandatory DS10 deletion endpoint
```

## Validation

- Contract and migration tests for existing and process-provider manifests.
- Golden parity for binding selection, ordering, request fields, section rendering, and
  failure isolation.
- Runtime smoke with process-native and legacy reference providers on a disposable Mirror
  home.
- Front-door proof that matching bindings no longer route `mirror load` to Python.
- Timeout/output-bound and redaction tests covering user, query, persona, journey, binding
  target, database path, provider stdout/stderr, and rendered text.
- Full TS/Python regression, deterministic-golden, oracle-drift, and relevant parity checks.

## Done Condition

- A TS-owned extension context provider dispatcher is authoritative.
- Existing supported extensions have a documented finite migration/compatibility route.
- US4's explicit matching-binding whole-command Python fallback is deleted.
- `mirror load` counts as fully burned down in DS7.
- No extension context is silently lost and no permanent language bridge remains.
- DS10 carries an explicit deletion gate for the temporary compatibility host.

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
- [Debt Review](review.md)
- [Done](done.md)
