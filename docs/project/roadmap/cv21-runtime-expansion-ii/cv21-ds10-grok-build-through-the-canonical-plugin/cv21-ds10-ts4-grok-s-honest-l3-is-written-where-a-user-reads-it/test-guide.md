[< Story](index.md)

# Test Guide — CV21.DS10.TS4

## Automated Validation

From the repository root:

```bash
npm run typecheck
npm run lint
npm test
node ts/scripts/checkDocLinks.ts
node ts/scripts/buildClaudePlugin.ts --check
bash scripts/smoke_claude_plugin.sh
```

Expected: all green (the plugin smoke through step 4 on a machine with a global
`mirror-hook`: CR142). The tests this story adds — `runtimePolicy.test.ts`
(`runtimeReadsPromptContext` on `claude_code`, `codex`, `grok_build`, `null`) and the
inject case in `ts/test/hooks/` (a `grok_build` payload: exit 0, no stdout, no
front-door call, nothing marked injected; a `claude_code` payload unchanged) — fail on
the tree before the change and pass after it. `buildClaudePlugin.ts --check` holds
the regenerated `rules/AGENTS.md`.

## E2E Decision

Not required for the documents. For CR143 the direct wrapper run (step 2) is the
measure: on Grok the model never saw the injected context, so no session could show a
difference — only the hook's own clock can.

## Navigator Validation

All steps run from this package directory; `hook` writes only under a scratch
directory (`/tmp/cv21-ds10-ts4` unless `DS10_TS4_DIR` says otherwise).

**Step 1 — the docs.**

```bash
bash route.sh docs
```

- Expected observation: each sentence the plan names found in its document — the
  contract's `### Grok Build` section and its three table rows and five-runtime
  opening; README's five runtimes; Getting Started's `### Grok Build` section with
  `/mm-mirror`, the home rule, `search_tool`/`use_tool`, `grok_build`, the close at
  exit; REFERENCE's `/mm-` prefix for Grok and the three finding codes with their
  repairs; AGENTS.md's naming sentence; `1.0.62` beside every measured claim;
  `checkDocLinks` and `buildClaudePlugin --check` clean. Then read Getting Started's
  `### Grok Build` and the contract's `### Grok Build` as a user and a maintainer
  would.
- Pass: every grep found, both checks clean, and the honest line reads as honest to
  you.
- Fail: a sentence missing or placed elsewhere, a claim without its version, a stale
  "four runtimes", or a line that promises what Grok does not do.

**Step 2 — the hook.**

```bash
bash route.sh hook
```

Runs the installed plugin's `mirror-inject.sh` directly against a scratch Mirror
home, no model and no Grok: once with a `UserPromptSubmit` payload shaped as Grok
sends it (`GROK_HOOK_EVENT`, `GROK_SESSION_ID`, `promptId`, an explicit `/mm-mirror`
prompt), once shaped as Claude Code sends it.

- Expected observation: the Grok-shaped run exits 0 in tens of milliseconds with
  nothing on stdout and no `mirror load` in the scratch home's front-door log; the
  Claude-shaped run prints context (the explicit form loads it) as before.
- Pass: both as expected. Fail: a load on the Grok payload, or a change on the Claude
  one.

**Step 3 — untouched.**

```bash
bash route.sh untouched
```

- Expected observation: the real `~/.grok`, `~/.claude`, and `~/.config/mirror/env`
  as before.
- Pass: every hash equal.

## Validation Evidence

**Driver, 2026-10-18.** `npm run typecheck`, `npm run lint`, `npm test` (3333 tests,
3330 pass, 0 fail), `checkPackContents` (488 files, clean), `checkDocLinks` (clean),
`buildClaudePlugin.ts --check` (in sync, the regenerated `rules/AGENTS.md`
included), `smoke_claude_plugin.sh` green through step 4 (step 5 is CR142 on this
machine). The new tests — `runtimePolicy.test.ts` (`runtimeReadsPromptContext` on
`grok_build` false; `claude_code`, `codex`, `pi`, `antigravity`, `""`, `null`,
`undefined` true) and the three CR143 cases in `injectForms.test.ts` (a Grok-shaped
payload by `hookEventName`/`promptId` and by `GROK_HOOK_EVENT`/`GROK_SESSION_ID`:
empty stdout; a Codex-shaped payload: context loaded) — were red before the change
and green after it; the six explicit-form cases unchanged.

**Step 1, `docs`: 43 passed, 0 failed.** Every sentence found where the plan puts
it: the contract's five-runtime opening, `### Grok Build`, the session-id,
extraction, and injection rows, L3 with `grok 1.0.62 (1474f9cbdd91), 2026-10-18`, the
measured close, the MCP route, both printed steps; README's five runtimes and the
multi-runtime bullet; Getting Started's harness link and `### Grok Build` section
with `/mm-mirror` first, "approve it", `grok_build`, `search_tool`/`use_tool`, "What
Grok does not do", the rule you linked in step 2, 2.2k tokens — and no story code,
no parity level, no millisecond figure, no "injected"/"once per turn"; REFERENCE's
`/mm-` prefix, the three finding codes, the repair line, the update hint; AGENTS.md
and the plugin's rules copy naming Grok Build. Negative: zero "four runtimes" across
the four documents. `checkDocLinks` and `buildClaudePlugin --check` clean.

**Step 2, `hook`: 5 passed, 0 failed.** The installed `mirror-inject.sh` against a
scratch home, no model: Grok-shaped by payload **176 ms**, by environment **166 ms**,
nothing on stdout, nothing loaded; Claude-shaped 305–317 ms and Codex-shaped 263 ms,
context loaded as before. On grok 1.0.62 the same load had held the turn
2,293–2,610 ms (CR143's evidence).

**Step 3, `untouched`:** nothing under the real `~/.grok`, `~/.claude`, or
`~/.config/mirror` newer than the route.

**The Navigator's read** of Getting Started's `### Grok Build` and the contract's
`### Grok Build`: recorded at Validation.
