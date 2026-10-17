[< CV21](../index.md)

# CV21.DS4 — Codex Through The Canonical Plugin

**Status:** 🟢 In Progress
**Type:** Delivery Story
**Renamed from:** CV21.E4, in the CV21 Ariad taxonomy migration (2026-10-13). The
[code map](../index.md#code-map) resolves the old code.
**User-visible outcome:** A Codex user installs Mirror Mind as the canonical plugin
from a marketplace the package ships, trusts its hooks once, and has what a Claude
Code user has: the skills, the Operating Instructions at session start, Mirror Mode
on every turn, the MCP server, and a session logged as `codex` with its replies.
The two wiring steps and the wrapper v0.32.1 ships for Codex are gone.

---

## What This Is

[DS3](../cv21-ds3-codex-upgrade-spike/index.md) found in June that Codex had grown a
Claude-style hook system, so CV8's L3 ceiling was gone. [DS12.TS2](../cv21-ds12-runtime-re-baseline/cv21-ds12-ts2-codex-re-probe/index.md)
re-measured it on Codex 0.162.1 (2026-10-13) and settled the mechanism live: Codex
installs the shipped Claude-format plugin from a local marketplace (static 5), the
plugin alone exposes all 25 skills (static 6), the hooks run after a one-time trust
(L1), context reaches the model at session start and on every turn (L3), and the
SessionStart hook delivers the Operating Instructions as a developer message (L4).
The [decision](../../../decisions.md#cv21-converges-on-the-canonical-plugin-with-a-native-layer-for-antigravity-and-shared-hooks-that-know-their-runtime)
that followed made Codex one of the three runtimes that take the plugin as it is.

[DS2](../cv21-ds2-mirror-plugin-mcp-foundation/index.md) then fixed what TS2 found
broken, and validated it live on the same Codex: the hooks know their runtime and log
replies from Stop (US8, L7/L8), the MCP entry starts without `${CLAUDE_PLUGIN_ROOT}`
(US6, L6), and the inject hook reads `$mirror-mind:mm:mirror` (US7, L10).

What DS4 owns is the distance between that evidence and a shipped product:

- **No marketplace ships.** DS12 and DS2 installed from a scratch marketplace the
  route wrote. `mirror init` still prints v0.32.1's two steps (a skills link and an
  `AGENTS.md` link) and tells the user to start Codex through
  `scripts/codex-mirror.sh`.
- **The wrapper still ships**, with its two generated hook wrappers, the `codex:*`
  hook family, `smoke_codex.sh`, a CI step, and docs in README, Getting Started,
  REFERENCE, and the runtime interface contract. Its header still says Codex has no
  hook system (TS2 static 9).
- **Two debts carried from DS2's Debt Review.** Codex bounds a SessionEnd hook that
  names no timeout at 1 s, which can cut the close tail's extraction once a provider
  key is set (nothing lost: the conversation closes first, and the next session start
  extracts it). And the prompt hook skips a turn that starts with `/` as a command,
  so a Codex `$`-skill turn other than Mirror is logged as conversation today, reply
  included; whether it should be is undecided.
- **Codex caches a plugin at a version.** Claude Code's link reads the plugin in
  place; Codex copies it into its cache at install, so an updated Mirror does not
  reach Codex until the plugin is installed again.
- **No L4 claim.** The parity row for Codex reads "L4 reachable". The claim needs a
  live session through the shipped install path, with version, binary, and date
  ([evidence rule](../cv21-ds12-runtime-re-baseline/index.md#evidence-rule)).

## Outcome

Codex is at **L4** on the installed version, through the canonical plugin alone,
installed from a marketplace the npm package ships, in steps `mirror init` prints.
v0.32.1's Codex wiring (two steps and the wrapper) is removed from the package, the
tests, and the docs. The two debts DS2 carried are decided, implemented, and recorded.

## Candidate Stories

Ordered so the one live session the Navigator runs (US4) proves the shipped install
path and both debt fixes together, and gates the wrapper's retirement (TS5).

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV21.DS4.US1](cv21-ds4-us1-codex-installs-mirror-from-the-marketplace-the-package-ships/index.md) | Codex installs Mirror from the marketplace the package ships | User Story | The npm package carries a Codex marketplace manifest naming `plugins/mirror-mind` as a local source. `mirror init` prints the Codex wiring as `codex plugin marketplace add` and `codex plugin add`, in place of the two steps and the wrapper. In a scratch `CODEX_HOME`, those steps install the plugin, `codex plugin list` shows it, and `codex debug prompt-input` renders all 25 skills with no skills link. The manifest is guarded in the pack contents | ✅ Done |
| [CV21.DS4.TS2](cv21-ds4-ts2-sessionend-s-close-tail-survives-codex-s-1-s-bound/index.md) | SessionEnd's close tail survives Codex's 1 s bound | Technical Story | Carried from DS2's Debt Review. The plugin's SessionEnd hook is given a timeout Codex honors, or the close is separated from the extraction it triggers, so a Codex session end with a provider key set does not cut extraction. Measured on the installed Codex; Grok's 1.5 s bound (DS10) is considered in the same change | ✅ Done |
| [CV21.DS4.TS3](cv21-ds4-ts3-codex-s-skill-turns-follow-the-slash-command-rule/index.md) | Codex's `$`-skill turns follow the slash-command rule | Technical Story | Carried from DS2's Debt Review. The prompt hook applies the slash-command skip to Codex's `$` skill forms, with Mirror's explicit form the one exception on every runtime, as US8 decided. Or the opposite is decided and recorded. Either way the rule is one for all runtimes, and decisions.md says why | ✅ Done |
| [CV21.DS4.US4](cv21-ds4-us4-codex-at-l4-through-the-shipped-plugin-measured-live/index.md) | Codex at L4 through the shipped plugin, measured live | User Story | One isolated live session on the installed Codex, Mirror installed from the shipped marketplace only: 25 skills, the Operating Instructions as a developer message, Mirror Mode on an ordinary turn and on `$mirror-mind:mm:mirror`, the 7 MCP tools reached through `tool_search`, every prompt and reply logged as `codex`, the conversation closed at exit with its extraction intact. The parity row moves to **L4** with version, binary, and date | ✅ Done |
| [CV21.DS4.TS5](cv21-ds4-ts5-v0-32-1-s-codex-wiring-retires/index.md) | v0.32.1's Codex wiring retires | Technical Story | Gated on US4. `scripts/codex-mirror.sh`, `scripts/codex-hooks/`, the `codex:*` hook family, their pack-contents guards, and the CI step are removed; `smoke_codex.sh` follows the plugin path or retires with the wrapper; README, Getting Started, REFERENCE, and the runtime interface contract name the marketplace install and nothing else. The Codex JSONL backfill stays only if the plugin's SessionEnd fallback reads it | 🟡 Planned |
| [CV21.DS4.TS6](cv21-ds4-ts6-an-updated-mirror-reaches-codex-s-plugin-cache/index.md) | An updated Mirror reaches Codex's plugin cache | Technical Story | Codex copies the plugin into its cache at install. After the npm package updates, the Codex user is told, by `mirror update` or `runtime diagnose` or both, that the cached plugin is behind and which command brings it level; the message is measured against what the installed Codex offers for updating a plugin. Carries from US1's Debt Review: `runtime diagnose` knows nothing of Codex's wiring (nor Claude Code's link) | 🟡 Planned |

## Non-Goals

- Antigravity, Grok Build, Gemini CLI's removal, and user extensions on Codex: DS7,
  DS10, DS8, and DS5.
- The cross-session write DS12.TS2 L9 measured (a `mirror mirror log` with no session of
  its own appended to another runtime's open conversation): a core defect outside
  CV21, routed by DS2's Debt Review.
- The parity matrix across every doc: DS11 folds DS4's L4 row in with the others.

## Done Condition

Codex is at L4 on the installed version, measured in US4 with version, binary, and
date; the plugin installs from the shipped marketplace in the steps `mirror init`
prints; the wrapper and the two steps are gone from the package, the tests, and the
docs; and the two carried debts are decided, implemented, and recorded in
decisions.md.
