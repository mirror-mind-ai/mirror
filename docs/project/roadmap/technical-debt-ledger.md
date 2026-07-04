# Technical Debt Ledger

Ariad Review records technical debt here when debt should be paid now or deferred.

| ID | Source Story | Location | Kind | Description | Impact | Recommendation | Navigator Decision | Status |
|----|--------------|----------|------|-------------|--------|----------------|--------------------|--------|
| TD-001 | Pi external-skill home divergence fix (`c876c59`) | `.pi/extensions/mirror-logger.ts` (`resolveMirrorHome`, `_readDotenv`, `_effectiveMirrorEnv`, home-dir constants) ↔ `src/memory/config.py` (`resolve_mirror_home`, dotenv loader) | Duplicated contract / drift risk | The Pi logger re-implements the Python core's mirror-home resolution contract in TypeScript (upward `.env` walk, shell-env > `.env` precedence, `MIRROR_HOME` > `MIRROR_USER`, `.mirror-minds` preferred with legacy `.mirror` fallback) because a Pi extension cannot import `memory.config`. Two implementations of one contract can silently diverge. | If the core changes resolution semantics (new precedence, new env var, or another home-dir rename), Pi external-skill discovery breaks again exactly as it did here — and fails quietly, exposing zero external skills. | Contract is centralized on each side (constants + helpers). Longer term, make Python the single source of truth by exposing a machine-readable resolved-home command the extension can call, or a shared language-neutral config; add a regression check asserting Node and Python agree for representative env/`.env` cases. | Accept duplication now (Option 1); track for future consolidation. | Open — Accepted |

## Deferred Debt Requirements

When debt is deferred, record the defer reason and revisit trigger.

- **TD-001** — Defer reason: a Pi (TypeScript) extension cannot import the Python
  `memory.config` constants, so duplicating the resolution contract is the smallest
  correct fix today. Revisit trigger: any change to the core mirror-home resolution
  semantics (precedence, new `MIRROR_*` variable, or a home-directory rename), or the
  next time a non-Python runtime surface needs to resolve the home itself — at that
  point promote the shared resolution to a single source of truth (core command or
  language-neutral config) rather than adding a third copy.
