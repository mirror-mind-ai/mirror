[< CV8 Runtime Expansion](../index.md)

# CV8.E7 — Codex Operational Validation & Docs

**Epic:** Prove the Codex runtime works end-to-end, does not touch production state during tests, and is documented honestly
**Status:** Done
**Depends on:** CV8.E6 Codex Runtime Implementation

---

## What This Is

Runtime support is not done when files exist. It is done when the lifecycle has
been exercised against an isolated mirror home, the resulting database rows are
inspected, production state is proven untouched, and a new user can follow the
docs without relying on tribal knowledge.

This epic closes Codex as a supported runtime at L3 parity.

---

## Validation Result

- `scripts/smoke_codex.sh` validates Codex JSONL backfill against an isolated
  mirror home and database.
- The smoke test verifies that `backfill-codex-session` logs messages with
  `interface='codex'`.
- `scripts/codex-mirror.sh` handles session start, Codex launch, JSONL
  detection, backfill, deferred session end, and backup.
- `.agents/skills/mm-*/SKILL.md` exposes the core Mirror Mind skill surface to
  Codex.
- `AGENTS.md` gives Codex the project-level Mirror Mind operating context.
- Codex skill activation is documented as `$mm-*`, for example `$mm-build`.

---

## Parity Level

**Final Codex parity: L3.**

Codex has no lifecycle hooks and no dynamic per-turn context injection, so L4 is
not honest. L3 is the correct level:

- L1 logging through wrapper-script JSONL backfill
- L2 command surface through `.agents/skills/`
- L3 Mirror Mode and Builder Mode through explicit `$mm-*` skill invocation plus
  `AGENTS.md`

---

## Done Condition

- isolated Codex smoke test runs with temporary `HOME`, `MIRROR_HOME`, and
  `MEMORY_ENV=production`
- smoke test proves JSONL backfill for user and assistant messages
- resulting SQLite rows show `interface='codex'`
- production DB is not touched by the smoke test
- README, Getting Started, REFERENCE, Runtime Interface Contract, and skill docs
  include Codex where appropriate
- Codex limitations are documented as limitations, not hidden in implementation
- worklog records Codex validation result and final parity level

---

## Stories

| Code | Story | Status |
|------|-------|--------|
| CV8.E7.S1 | Write isolated Codex smoke test script | Done |
| CV8.E7.S2 | Validate Codex session lifecycle end-to-end | Done |
| CV8.E7.S3 | Validate Codex Mirror Mode and Builder Mode flows | Done |
| CV8.E7.S4 | Update public and operational docs for Codex | Done |
| CV8.E7.S5 | Record Codex parity level, limitations, and validation result | Done |

---

## Verification Requirements

The final Codex validation includes:

```bash
./scripts/smoke_codex.sh
uv run pytest
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run pyright src/memory
git diff --check
```

---

## See also

- [CV8.E6 Codex Runtime Implementation](../cv8-e6-codex-runtime-implementation/index.md)
- [Development Guide](../../../../process/development-guide.md)
