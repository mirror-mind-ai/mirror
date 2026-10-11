[< CV22 TypeScript Core Port](../index.md)

# CV22 Refinement Campaign — the five-audit code-quality sweep

**Date:** 2026-07-14 · **Branch:** `mirror-ts-core` · **Status:** complete (34/34 CRs done, CI green)

This document records a Refinement Work campaign run against the CV22 TypeScript
core after **CV22.DS4** (Deterministic Writes) closed and before **CV22.DS5**
(External-API Commands) was pulled. It captures **how the work came about**, the
**method used to prioritize and execute it**, and an index of the five
Refinement Stories (RS001–RS005) and their 34 Change Requests (CR002–CR035).

The CRs themselves are Ariad Workbench records in the Mirror database
(`builder_change_requests` / `builder_refinement_stories`), not repo files. These
documents are the durable, roadmap-adjacent narrative of that work, written per
the collaboration strategy's rule to *record decisions near the roadmap*.

---

## How the campaign came about

It started as a single Navigator request: inspect the CV22 TypeScript code for
opportunities to make it **easier to read (even by a junior developer), DRY,
easier to change/test/fix, coherent, well-named, and idiomatic TypeScript**.

That inspection became the **engineer** code-quality sweep (RS001). The Navigator
then asked, in turn, for four more specialist reviews — each a distinct lens with
its own failure mode, run as a separate persona of the Mirror's engineering
ego:

| Story | Lens (persona) | Question it asks | What it owns |
|-------|----------------|------------------|--------------|
| **RS001** | engineer | Is the code well-built? | structure, DRY, naming, testability |
| **RS002** | quality-assurance | Can it be *trusted* under failure? | atomicity, contention, backups, coverage |
| **RS003** | database-architect | What does the *data* mean, and who owns it? | schema custody, migrations, FTS, retention |
| **RS004** | devops-engineer | Does it *survive* on real machines? | environments, observability, rollback, prerequisites |
| **RS005** | security-engineer | Can it be *attacked*? | guards, data-at-rest, threat model, supply chain |

Each audit produced a Refinement Story with the persona named in its title, a
description recording the threat model / scope, a positive ledger (what was
already good), and a set of evidence-backed CRs. Every finding was verified
against the actual code before capture — evidence, not suspicion.

The common thread the five audits found: DS1–DS4 built an **excellent parity
discipline** (does TS compute the same answer as Python?), but the DS4 write
cutover had moved live writes onto the TS path faster than the *operational,
data-custody, and security* disciplines had caught up. The campaign closed that
gap.

---

## How the CRs were prioritized

After all five audits were captured (34 CRs), they were ranked into tiers by
**(1)** live user-data exposure today, **(2)** decisions gated by DS5/DS6
planning, **(3)** dependency order (characterization nets before refactors), and
**(4)** leverage per unit of effort. Refactors ranked *below* safety — not
because they matter less, but because refactoring is safest under the nets the
earlier CRs build.

- **Tier 1 — close the live-data holes** (writes were flowing): CR024, CR007,
  CR012, CR013, CR029, CR031, CR018, CR030, CR028.
- **Tier 2 — the decision batch** (cheap docs, gated by DS5/DS6 planning):
  CR033, CR020, CR032, CR019, CR023, CR035, CR022.
- **Tier 3 — transition-state correctness** (the daily path): CR027, CR014,
  CR015, CR025, CR026.
- **Tier 4 — nets first, then the refactor arc**: CR017, CR016, then CR002,
  CR003, CR004, CR009, CR010, CR006, CR005, CR008, CR011.
- **Tier 5 — hygiene tail**: CR021, CR034.

---

## How the CRs were executed

Every CR went through the Ariad Refinement Work lifecycle — pull the Refinement
Story, then per CR: **select → confirm → plan → implement → validate → done** —
under these working rules:

- **TDD / behavior-preserving refactor.** New behavior got tests first; pure
  refactors were held to *byte-identical* output by a characterization net.
- **The render-golden net (CR016) before the big refactor (CR002).** Black-box
  golden tests froze the exact rendered output of `journeys`/`memories`/
  `detect-persona` so the 362→277-line `cli.ts` decomposition could be proven to
  change nothing a user sees.
- **Real harness runs, not just `node:test`.** The read and write parity
  harnesses were run end-to-end (`overall_match: true`) whenever grading or
  fixtures changed.
- **CI verification after every push**, checked with `gh` across all five jobs
  (`ts` on ubuntu + macOS, `test` 3.10/3.12, `parity`).
- **Commit discipline.** One CR (or one same-sitting cluster) per commit, with a
  descriptive message naming the CR and the *why*.

### Same-sitting clusters

A few CRs shared a commit because they touched the same code seam:

- **CR024 + CR007** → `71ca41e` (both rewrite front-door DB-path resolution).
- **CR013 + CR029 + CR031(TS)** → `9eef942` (backup mechanism, placement, and
  permissions land as one coherent change); CR031's Python half is `760c546`.

### Process honesty (things that went wrong and were corrected)

- **A masked lint exit code.** Early on, `npm run lint | tail -1` hid Biome's
  non-zero exit; CI caught a real `organizeImports` error (`f1b1ef0`). Fix: check
  exit codes explicitly (`; echo $?`) from then on.
- **An environment-dependent test.** A guard test assumed the system tmpdir was
  not under `/tmp`; true on macOS, false on Linux CI. Rewritten to be
  OS-independent, and the CI matrix gained a **macOS leg** (`fdbe15e`, CR017) so
  the class can't recur silently.
- **Backticks in a commit message.** Unescaped backticks triggered shell
  command substitution and corrupted one message; it was amended and heredocs
  were used thereafter.
- **Two CRs (CR016, CR009) had their Ariad lifecycle backfilled** after the code
  was committed, because implementation jumped ahead of the ceremony. Recorded
  transparently in their done notes; the remaining CRs ran the lifecycle before
  coding.

---

## The five stories at a glance

| Story | Lens | CRs | Sharpest finding |
|-------|------|-----|------------------|
| [RS001](rs001-engineer-code-quality.md) | engineer | CR002–CR011 (10) | `cli.ts` god module; untested renderers |
| [RS002](rs002-qa-trust-audit.md) | quality-assurance | CR012–CR017 (6) | non-atomic writes under contention |
| [RS003](rs003-database-architect-audit.md) | database-architect | CR018–CR023 (6) | schema custody dies with Python |
| [RS004](rs004-devops-operations-audit.md) | devops-engineer | CR024–CR029 (6) | dev sessions write **production** |
| [RS005](rs005-security-audit.md) | security-engineer | CR030–CR035 (6) | identity poisoning, no audit trail |

**Not part of this campaign:** `CR001` ("Builder roadmap layer is not
journey-scoped") is a pre-existing, unattached Workbench capture from earlier
work and remains `captured`; it is unrelated to CV22.

---

## Net effect

- **34 commits** on `mirror-ts-core`, CI green across all five jobs.
- **TS tests 141 → 180**; full Python suite green; ruff / tsc / biome clean.
- Every "live data exposed today" finding across all five lenses is closed.
- Every DS5/DS6 plan input and security rider is written where planning will read
  it (see [Decisions](../../../decisions.md), the [CV22 index](../index.md) Security
  Riders section, and the [Radar](../../index.md)).

**See also:** [CV22 index](../index.md) · [Collaboration Strategy](../collaboration-strategy.md) · [Decisions](../../../decisions.md) · [Worklog](../../../../process/worklog.md)
