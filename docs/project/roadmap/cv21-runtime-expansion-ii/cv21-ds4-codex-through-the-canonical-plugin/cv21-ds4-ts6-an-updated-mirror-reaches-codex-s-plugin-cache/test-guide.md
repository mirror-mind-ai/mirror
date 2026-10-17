[< Story](index.md)

# Test Guide — CV21.DS4.TS6

## Automated Validation

- `node --test` — the new reader tests (Codex cache: absent, current,
  behind, **ahead**, several versions compared by `compareSemver`,
  unreadable; Claude link: absent, healthy, dangling, and the documented
  silence for a link resolving to another tree), the diagnose finding
  tests, the strict-injection leak test (a fixture home cannot see the
  machine's real `~/.codex` or `~/.claude`), and the `postUpdateHints`
  cases — including the landed-version trap: old process at X, update
  lands Y, cache at X, the hint fires.
  The whole suite green is also the goldens' proof: the frozen
  `runtime-diagnose` fixture homes hold no Codex cache and no Claude link,
  so the new findings must not move a recorded byte.
- `npx biome check .`

## E2E Decision

The live route (Navigator Validation, observation 2) is the E2E: the real
Codex 0.163.0 against a scratch `CODEX_HOME`, proving the re-add command the
message names is the one that actually refreshes the cache. The npm-package
smoke is deliberately not extended — CI has no codex binary, and the readers
are filesystem-pure, fully covered by unit fixtures.

## Navigator Validation

1. Stale cache is named — build a scratch `CODEX_HOME` with
   `plugins/cache/mirror-mind/mirror-mind/0.1.0/` and run
   `CODEX_HOME=<scratch> mirror runtime diagnose`. Expected observation: a
   `codex_plugin_cache_behind` finding naming 0.1.0, the installed version,
   and `codex plugin add mirror-mind@mirror-mind`. Pass: finding and exact
   command. Fail: silence, or a command Codex 0.163.0 does not accept.
2. The command works — live against the installed Codex, scratch
   `CODEX_HOME`, leading with the version bump (the claim is refresh, not
   idempotence): marketplace add + plugin add from a scratch package copy
   at an old version, bump the copy's version, re-add, watch the cache
   directory change. Then one same-version re-add as the secondary
   recording. Expected observation: the cache ends at the bumped version;
   the message's wording matches the measured behavior (including whether
   a `remove` must precede it). Pass: cache level and message truthful.
   Fail: re-add refuses and the message misleads.
3. Absence and health are silence — `mirror runtime diagnose` on this
   machine. Expected observation: no finding fires on an absent Codex
   cache, and none on a real, healthy Claude link. Pass: silence on
   absence and health. Fail: a finding fires with nothing stale.

## Validation Evidence

Pending implementation and validation.
