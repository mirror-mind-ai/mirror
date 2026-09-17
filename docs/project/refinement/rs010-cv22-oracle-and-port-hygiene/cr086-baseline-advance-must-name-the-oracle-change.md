[< RS010](index.md)

# CR086 — A baseline advance must name the oracle change it absorbs

**Status:** captured
**Refinement Story:** RS010 — CV22 Oracle And Port Hygiene
**Driver:** —
**Delivery:** —

---

## Problem

The oracle-drift tripwire is supposed to guarantee that no ported Python oracle changes
without a human reading the change. It failed once, silently, and the cost was a live
defect that ran for two months.

The sequence, reconstructed from the repository:

1. **2026-07-16** — commit `806e52f0` (AI-12) changed `src/memory/intelligence/search.py`,
   threading `log_access: bool = True` so that non-genuine callers stop reinforcing
   retrieval. `cli/memories.py` began passing `log_access=False`.
2. The same day, `memories --search` was routed to the TypeScript front door
   (`0abfa2e2`). The TS port had no `logAccess` option and reinforced unconditionally.
3. `intelligence/search.py` is a tracked oracle, so the tripwire fired.
4. **2026-07-23** — the baseline was advanced in a commit about *routing `tasks` to TS*
   (`881e5b87` and neighbours). The drift was absorbed; the flag was never ported.

From step 2 until 2026-09-17, every `memories --search` through the front door wrote
`memory_access_log` rows Python would not have written — the ranker learning from its own
exhaust, on the exact command AI-12 named. Measured on the production database: 520 rows
touching 53 of 950 memories (an upper bound; Builder loads write to the same table).

The defect is fixed (CV22.DS9.US2, 2026-09-17). This CR is about the mechanism that let it
through, which is still in place.

**The tripwire was not the only guard that failed.** `ts/test/frontDoor/externalRoutes.test.ts`
asserted `COUNT(*) FROM memory_access_log == 1` after `memories --search` — the test
*pinned* the divergence. It was written from observed TypeScript behavior rather than from
the oracle, so it passed for two months while encoding the bug. Any mechanism proposed here
should assume a wrong test can be as load-bearing as a missing one: the question a baseline
advance must answer is "what did the oracle do?", not "what does our port do now?".

This is the failure the devops-engineer lens predicted during the CV22.DS7.US9 plan review:
*"a tripwire that fires on unrelated work trains reflexive re-baselining, and reflexive
re-baselining is how a tripwire dies."* It was recorded as a risk that same week. It had
already happened.

## Expected Behavior

Advancing `ts/parity/oracle-baseline.json` should be impossible to do silently. Concretely,
a baseline advance should have to state, in the commit that performs it, **which oracle
changed, what changed in it, and what happened to the port** — one of: ported in this
commit, already at parity (with evidence), or deferred behind a named Change Request.

Green CI must not be reachable by advancing past a change nobody read.

Shape of a possible mechanism, not a prescription — the Driver picks:

- `check_oracle_drift.py --update` refuses without a reason per drifted path (a flag, a
  file, or an interactive prompt), and writes those reasons into the baseline document
  next to the SHA it advances;
- CI asserts every baseline entry whose SHA moved in the diff has a reason recorded;
- the reason is part of the baseline artifact, so `git log` on one file answers "why did
  this oracle change and what did we do about it?" for every past advance.

The cost must stay proportionate: this is a solo-owner project, and the goal is a moment of
forced attention, not a workflow.

## Impact

Medium likelihood, high blast radius. Every ported command depends on the tripwire being
the thing that catches a moving oracle; DS10's deletion of the Python core will lean on it
as evidence that the port stayed in parity. One silent advance produced a two-month data
defect nobody noticed. There are 97 tracked oracles.

## Plan Or Decision

Not planned. Captured from CV22.DS9.US2 with the Navigator's agreement that the mechanism,
not the instance, is the durable finding.

## Evidence

- `src/memory/oracle_drift.py` — `ORACLE_PATHS` includes `src/memory/intelligence/search.py`.
- `git show 806e52f0` — the AI-12 change and its rationale.
- `git log -- ts/parity/oracle-baseline.json` — the 2026-07-23 advance, in a commit whose
  subject is about routing `tasks`.
- `docs/project/roadmap/cv22-typescript-core-port/cv22-ds9-ts-mcp-server/cv22-ds9-us2-context-tools/plan.md`
  — the scope amendment recording the defect, the fix, and the decision not to repair data.
- `docs/project/roadmap/cv22-typescript-core-port/cv22-ds8-live-provider-cutover/cv22-ds8-us1-live-provider-cutover/index.md`
  — the inbound correction to the story that flipped the route.

## Outcome

Open.
