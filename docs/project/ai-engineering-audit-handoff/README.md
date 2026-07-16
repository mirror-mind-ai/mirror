# AI Engineering Audit — main handoff

This folder carries the work products of the [AI Engineering
Audit](../ai-engineering-audit.md) that are destined for **`main`** as **CV9.E2
stabilization** stories — not for the `mirror-ts-core` (CV22) branch.

## Why this exists

The audit was initially, and incorrectly, captured as a CV22 refinement story
(RS006). It is not CV22 work: CV22 is a *parity, not improvement* port, and
these are improvements to the production Python core that protect today's users
(who ship from `main`). See the re-homing note at the top of the audit doc.

## Contents

- **`cr036-ai01-timeouts.patch`** — the implemented and validated fix for
  **AI-01** (explicit per-role timeouts + retry ceiling on every LLM/embedding
  call; the SDK default was 600s). Produced on `mirror-ts-core` and reset off
  that branch; apply it on `main` as the first CV9.E2 AI-reliability story.

  ```bash
  # on main:
  git am docs/project/ai-engineering-audit-handoff/cr036-ai01-timeouts.patch
  # or, to stage without authorship/commit metadata:
  git apply docs/project/ai-engineering-audit-handoff/cr036-ai01-timeouts.patch
  ```

  The four intelligence/config files it touches are in sync between
  `mirror-ts-core` and `main`; only `runtime.py` carries branch-only observability
  on `mirror-ts-core`, so on `main` the `runtime status` hunk may need a trivial
  context adjustment. Tests: `uv run pytest` (the patch adds six).

## The rest of the findings

AI-02…AI-21 are CV9.E2 story candidates (tiers in the audit doc). AI-18/AI-19 are
the exception — they stay CV22 DS5/DS6 plan inputs, recorded as riders in the
CV22 index.

Once applied on `main`, this folder can be deleted.
