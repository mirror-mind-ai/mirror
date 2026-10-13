[< CV21](../index.md)

# CV21.DS12 — Runtime Re-Baseline

**Status:** 🟢 In Progress — findings and decision written, awaiting Validation
**Type:** Delivery Story (spike)

---

## Outcome

CV21's runtime evidence describes June 2026. Back then the core was Python, the plugin
assumed a checkout, and the four spikes ran on `claude` 2.1.114, `codex` 0.139.0, `agy`
1.0.8, and `grok` 0.2.51. Since then:

- CV22 moved the core to TypeScript and the distribution to npm;
- every runtime has shipped new versions;
- the bet [DS1](../cv21-ds1-unified-plugin-mcp-spike/index.md) made, that runtimes
  import a Claude-format plugin, was never executed, because DS1 deferred the live
  imports to the per-runtime epics.

This Delivery Story re-measures what the remaining stories build on, on the versions
installed when each probe runs, and runs the imports DS1 deferred. It ends in a
decision, not in code. DS2's remainder and DS4–DS11 are confirmed, reshaped, merged, or
dropped against the evidence
([decision](../../../decisions.md#cv21-re-baselines-its-runtime-evidence-before-building-on-it)).

## Evidence Rule

Every finding names the runtime's version, the binary it ran (its `which -a` path), and
the date. A version is evidence at a date, never a property of the runtime. On the day
CV21 resumed, two readings minutes apart found Codex, Antigravity, and Grok Build on
different versions, because they had been updated in between. A later story that builds
on a finding re-checks the installed version at its Plan, and re-probes what it depends
on if the version moved.

Versions for orientation only: each probe reads its own.

| Runtime | June spikes | CV22.DS10.US3 (Oct 2026) | Installed at authoring (2026-10-13) |
|---------|-------------|--------------------------|-------------------------------------|
| Claude Code | 2.1.114 | 2.1.283 | 2.1.296 (`~/.local/bin/claude`) |
| Codex | 0.139.0 | 0.157.0 | 0.162.1 (Homebrew cask) |
| Antigravity | 1.0.8 | — | 1.3.4 (`~/.local/bin/agy`) |
| Grok Build | 0.2.51 | — | 1.0.52 (`~/.grok/bin/grok`) |

## Scope

- **Baseline is the shipped package, not the June design:**
  - `plugins/mirror-mind`, whose hooks run the installed `mirror-hook` and whose MCP
    launcher runs `mirror mcp`;
  - the Codex wrapper `scripts/codex-mirror.sh`;
  - the per-runtime steps `mirror init` prints.
- **Isolated probes only.** Scratch `HOME` or config directories and a scratch Mirror
  home. No production runtime config, Mirror home, or repository state is mutated, the
  discipline DS1, DS3, DS6, DS9, and CV22's routes kept.
- **Per runtime**, each measured:
  - the hook events available;
  - per-turn and session-start context injection;
  - session identity and transcript access;
  - skill discovery;
  - the instructions file;
  - MCP configuration;
  - the plugin format.
- **The deferred live imports**, run in scratch config against `plugins/mirror-mind`:
  - `agy plugin import claude`;
  - Grok's plugin install or import;
  - Codex's plugin or marketplace install.
- **The extension surface**, against CV22.DS7.TS4's declared extension contract and the
  npm package.
- **Steps that need the Navigator** (Navigator, 2026-10-13). Probes that need a logged-in
  session or a model call become steps of a route script. The Navigator runs them when the
  Driver hands them over during implementation, because TS6's decision depends on them.
  Paid calls are kept to the minimum. Mirror itself cannot spend in them: the scratch Mirror
  home holds no provider key.

Out of scope:

- implementing any runtime integration (DS2, DS4, DS5, DS7, DS10);
- removing Gemini CLI (DS8);
- editing any shipped artifact.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV21.DS12.TS1 | Claude Code re-probe | Technical Story (spike) | On the installed Claude Code, the npm-era plugin loads, fires its hooks, delivers the operating instructions at session start, and reaches the MCP server. The probe finds out whether a plugin can carry a status line, and whether DS2.TS4 can close on the evidence | 🟢 Findings complete |
| CV21.DS12.TS2 | Codex re-probe | Technical Story (spike) | DS3's hook mapping is re-measured on the installed Codex, starting from the shipped wrapper: per-turn `additionalContext`, the `async` and `SessionEnd` caveats, and whether Codex consumes the Claude-format plugin through a plugin or marketplace install | 🟢 Findings complete |
| CV21.DS12.TS3 | Antigravity re-probe | Technical Story (spike) | DS6's hook surface is re-measured on the installed `agy`, including any per-turn or session-start injection. `agy plugin import claude` runs live on `plugins/mirror-mind` in a scratch config. The result is the parity Antigravity can honestly claim as Gemini CLI's successor. It also sets the bar DS7 must reach before DS8 can remove Gemini CLI (Navigator, 2026-10-13) | 🟢 Findings complete |
| CV21.DS12.TS4 | Grok Build re-probe | Technical Story (spike) | DS9's findings are re-measured on the installed `grok`, now 1.x where June's was 0.2.x: whether any hook can now inject, and which Claude locations Grok still reads. A plugin install or import of `plugins/mirror-mind` runs live in a scratch config | 🟢 Findings complete |
| CV21.DS12.TS5 | Extension surface re-grounding | Technical Story (spike) | The External Extension Surface Assessment is rewritten against the TypeScript extension contract and the npm package. It states how a user-owned extension reaches each runtime today, and the gap that remains | 🟢 Findings complete |
| CV21.DS12.TS6 | Re-baseline decision and roadmap reshape | Technical Story (decision) | A decision record confirms or revises the DS1 convergence decision. It confirms, reshapes, merges, or drops DS2's remainder and DS4–DS11, and states the parity matrix per runtime with version, binary, and date | 🟢 Findings complete |

## Done Condition

DS12 is done when:

- each remaining runtime (Claude Code, Codex, Antigravity, Grok Build) is probed in
  isolation on its installed version, under the evidence rule;
- the imports DS1 deferred have run live;
- the extension surface is re-grounded;
- the bar DS7 must reach before DS8 can remove Gemini CLI is stated;
- the decision record and the reshaped DS2 remainder and DS4–DS11 are in the CV21
  index;
- no production runtime config, Mirror home, or repository state was mutated.

## References

- [CV21 — Runtime Expansion II](../index.md)
- [CV21.DS1 Unified Plugin & MCP Spike](../cv21-ds1-unified-plugin-mcp-spike/index.md) ·
  [DS3 Codex](../cv21-ds3-codex-upgrade-spike/index.md) ·
  [DS6 Antigravity](../cv21-ds6-antigravity-runtime-spike/index.md) ·
  [DS9 Grok Build](../cv21-ds9-grok-build-runtime-spike/index.md)
- [CV22.DS10.US3 — npm distribution](../../cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-us3-npm-distribution/index.md)
- [Runtime Interface Contract](../../../../product/specs/runtime-interface/index.md)
