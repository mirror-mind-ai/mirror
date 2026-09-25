# Validation — CV22.DS10.TS5

## Status

Passed

## Automated Checks

- GitHub Actions Tests green on ubuntu and macos at d3e4af37, which carries 118d4a67, the last code change: tsc; Biome; the no-provider-key assertion; npm test (node:test); the same suite under the interpreter shadow, 0 spawn attempts; the retired-surface tripwire (python-core and python-core-mentions live); migration custody; bootstrap custody; the runtime updater smoke; the migrate-on-open, conversation-logger lifecycle, Builder Ariad lifecycle, and extension catalog smokes. Docs green (doc links, skill command parity) on every later commit, all documentation-only

Checks status: passed

## E2E

Decision: required

Evidence: The Navigator walk is the end-to-end check, on an online-backup copy of the real memory.db with python, python3, and uv shadowed by stubs that log their caller. First walk at 7583384d (steps 0-12): not accepted, found F21. Second walk at ca6f9cba (steps 1, 2, 6, 12 and the verdict), step 1 repeated at c440b4b6: every step passed; the code under it is 118d4a67's

## Navigator Validation

Route: Four-runtime walk (test-guide.md, Navigator Validation), one shell, interpreter shadowed, MIRROR_HOME on the copy: 1) Pi with the prompt given at launch -> logged within a tenth of a second of session maintenance starting, both writers complete; 2) Claude Code /mm:mirror plus a follow-up -> every hook exit 0, hooks.log empty, the owed injection made and marked; 3) Gemini CLI skipped (retired; Antigravity is CV21's); 4) Codex wrapper; 4b) a hook with no node -> a hooks.log line and hook_node_unresolvable; 5) MCP through launch.sh -> 0.31.14; 6) every session read back, production untouched; 7-8) unknown command exit 1, unknown subcommand exit 2; 9) a pre-017 copy migrates on open, backup first; 9b) the per-family replay identical; 10) a stale MIRROR_TS_BUILD reported inert; 11) 0.31.14 everywhere; 12) the clone-role guard refuses a TypeScript-era production clone; verdict) no spawn whose caller is Mirror code

Navigator accepted: yes

Expected observation: Every runtime logs its turns and makes its injections from Node with no interpreter reachable; concurrent writes all complete; names nothing owns get TypeScript's usage answers; an old schema migrates on open; the version reads 0.31.14 everywhere; the guard refuses a TypeScript-era production clone

Pass condition: Every walked step observed as described; the shadow log holds no spawn whose caller is Mirror code; hooks.log is empty and mirror-logger.log holds no failure. Accepted by the Navigator on 2026-09-25 with named deviations: step 3 skipped; step 12 on a TypeScript-era clone, the Python-era production clone being F20, an accepted known risk; step 1's first attempt fell outside the race window and was repeated; steps 4, 4b, 5, and 7-11 stand on the first walk, by the Navigator's scope for the second

Fail condition: Any spawn from Mirror code; any lost turn, lost injection, or failed maintenance; any usage answer or refusal with a different exit code; a migration deferred, or nothing pending on the first run; a version null or 0.0.0; the guard accepting a TypeScript-era production clone

## Missing Evidence

- none
