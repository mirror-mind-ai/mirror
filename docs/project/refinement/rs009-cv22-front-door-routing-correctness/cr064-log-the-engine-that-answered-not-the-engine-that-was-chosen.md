[< RS009](index.md)

# CR064 — Log the engine that answered, not the engine that was chosen

**Status:** done
**RS:** RS009
**Driver:** @viniciusteles
**Delivery:** `mirror-ts-core`

Phase history: captured 2026-09-08 (CR059 review) → planned and started
2026-09-08 under the Navigator's instruction to follow the recommended order,
carrying forward the Driver and Delivery he confirmed for CR059 → validated and
done 2026-09-08.

## Problem

`main()` in `ts/src/frontDoor/cli.ts` writes `decision.engine` to
`front-door.log` — the routing table's choice, decided before dispatch. Some
TS routes fall back to Python *inside* dispatch: `runConversationLoggerWrite`
returns `fallbackPython(argv)` when the logger command reports
`{ handled: false }`, which `loggerCli` does when the LLM close tail is
unconfigured (`LlmTailUnconfiguredError`), as defense in depth behind the
replay gate. In that case the command is answered by Python and the log says
`ts`.

This was harmless while `front-door.log` only recorded skill invocations. CR059
made it the production record of which engine answers every Pi and Gemini turn,
and the burn-down ledger's rules paragraph now points at it as the evidence
that a flip reached live sessions. An entry that says `ts` when Python answered
undermines exactly that claim.

**Reachability, checked before implementing (2026-09-08).** The mismatch cannot
currently be produced from the CLI: `routing.ts` sends the LLM-crossing
subcommands to Python unless *both* replay paths and `MIRROR_TS_EXTERNAL_ROUTES`
are set, and the runtime reads the same `process.env`, so the runtime's
`LlmTailUnconfiguredError` cannot fire under a `ts` decision. The internal
fallback is defense in depth, as its comment says, and today the log is
accurate. What is wrong is the contract: `main` reports a *decision*, not an
*outcome*, so the log becomes wrong the first time the two can disagree — when
DS8 changes the replay gate, or when any future route adds a runtime-side
refusal. Fixing it now, while the seam is small and the evidence it produces is
newly load-bearing, is cheaper than discovering it from a wrong audit later.

## Expected Behavior

The logged route is the engine that produced the exit code. Dispatch reports
the engine it actually used — a returned value or a small result object, not a
mutable module variable — and `main` logs that, falling back to
`decision.engine` only when dispatch made no engine choice of its own. A
routing decision that differs from the answering engine is visible rather than
silently normalized, because that difference is a real event worth seeing:
it means a gate is set one way and the runtime disagrees.

## Impact

Observability, not behavior: no command runs differently. The consequence is
that an audit of `front-door.log` — now the only production evidence that a
flipped route reaches live sessions — can overstate TypeScript coverage for
the replay-gated `conversation-logger` subcommands on an install where the
transport is misconfigured.

## Plan Or Decision

Small and local: `dispatch` returns `{ exitCode, engine }`; the current body
becomes `dispatchTs`, unchanged, with the two engine-deciding branches (the
Python route and the conversation-logger route, the only one that can fall back
internally) lifted into `dispatch`; `main` logs the outcome's engine and, when
it differs from the decision, records that as metadata-only detail rather than
normalizing it away. There is exactly one internal fallback site: `consult` and
`memories --search` decide at the routing layer and never fall back inside
dispatch (verified by `rg fallbackPython`).

Tests: both normal directions through the real front-door process — a ported
command logs `ts`, an unported one logs `python` — which is what guards the
refactor. The mismatch path itself is unreachable from the CLI (see above);
making it reachable would need an injectable provider seam in the route, which
costs more than it protects today. That gap is stated here rather than hidden
behind a test that proves something else.

## Evidence

`ts/src/frontDoor/cli.ts`: `dispatch` returns `{ exitCode, engine }`; its body
moved unchanged into `dispatchTs`, with the two engine-deciding branches lifted
out — the Python route, and the conversation-logger route, which now reports
`python` itself when it falls back. `main` logs `outcome.engine` and, when it
differs from `decision.engine`, records `fell_back routed=<engine>` as
metadata-only detail rather than normalizing the difference away. The catch
path still attributes to the decision, since the throwing engine is unknown
there; that is stated in the code.

`ts/test/frontDoor/hookPayloadRedaction.test.ts` gained a case covering all
three dispatch branches in one run — a plain TS read (`journeys`), the
conversation-logger route (`status`), and a Python route (`extract-pending`) —
asserting the command and engine of each line, in order, with no fallback note
when the engines agree.

Mutation-checked, and the first attempt was wrong: the initial test used
`conversation-logger status` as its TS case, which travels the conversation-
logger branch, so breaking `dispatchTs`'s engine constant survived. Adding the
`journeys` invocation closed that hole. All three mutations now fail:
`dispatchTs` reporting `python` (1 failure), the Python branch reporting `ts`
(1), the conversation-logger branch reporting `python` (2).

Checks: `ts` typecheck, Biome across 299 files, 1243 tests, the 87-check
lifecycle smoke, and `.pi` typecheck — all green.

## Validation

Natural route on a disposable home with a generated demo database: run three
commands through the front door and read `front-door.log`.

```text
journeys              ts      exit=0   migrate_on_open applied=017_… (first write to a Python-made DB)
journeys              ts      exit=0
conversation-logger   ts      exit=0   (status)
conversation-logger   python  exit=0   (extract-pending, unported)
```

Expected observation: each line names the engine that answered; no line carries
a `fell_back` note, because no route fell back. Pass: that holds. Fail: a wrong
engine, a spurious fallback note, or a missing line. Observed as above.

**Limitation, stated rather than hidden.** The mismatch this CR exists to
report correctly is still unreachable from the CLI, for the reason recorded
under Problem, so no test exercises a real fallback. What the tests guard is
that the refactor reports each branch honestly; what the change buys is that
the log stays true when the two can first disagree.

## Review

Proportionate: one interface, one function split with its body unchanged, one
route returning its own engine, one log line, one test. No behavior change —
same commands, same exit codes, same stdout.

Debt introduced: none. Debt found: none new. The catch path's attribution to
the routing decision is a knowingly accepted approximation, documented in
place, not carried as debt: an exception's engine is not recoverable there
without threading state through every throw site.

## Outcome

Done 2026-09-08. `front-door.log` now records the engine that answered rather
than the engine the routing table chose, and a disagreement between them is
visible as `fell_back routed=<engine>` instead of being silently normalized —
which is what makes the log usable as the evidence CR059 turned it into.
Delivered on `mirror-ts-core`.

## Provenance

Found while reviewing CR059, whose whole point is that `front-door.log` now
records live sessions. Captured at CR059's review on 2026-09-08 rather than
fixed inside it: CR059 changes callers, this changes the front door's logging
contract.
