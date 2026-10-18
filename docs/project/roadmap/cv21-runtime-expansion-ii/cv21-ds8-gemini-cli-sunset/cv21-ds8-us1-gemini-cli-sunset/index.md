[< CV21.DS8](../index.md)

# CV21.DS8.US1 — The package and `mirror init` drop Gemini CLI

**Status:** ✅ Done — 2026-10-18
**Type:** User Story

---

## User Story

As a Mirror user installing or updating the package,
I want the package to carry no Gemini CLI integration and `mirror init` to
print no Gemini steps,
So that the runtime the Navigator retired is not the one the product still
offers me.

## Outcome

The shipped package no longer contains the Gemini CLI integration: no
`.gemini/hooks` wrappers, no `gemini` hook family, no Gemini `init` steps, no
Gemini smoke. A guard row keeps it gone. Gemini models, Antigravity's
`~/.gemini/` home, and `gemini_cli` conversation history are untouched.

## Acceptance Behavior

```text
Given the package built from main
When I run `npm pack --dry-run` on it
Then no path under `.gemini/` is listed
And `package.json` names no `gemini-cli` keyword and no Gemini CLI runtime

Given `gemini` is on the PATH
When I run `mirror init`
Then no Gemini CLI section is printed
And the Pi, Claude Code, Codex, and Antigravity sections print as before

Given the installed `mirror-hook`
When it is invoked as `gemini:session-start` (or any `gemini:*` entry)
Then it fails as an unknown hook family, the way any unknown family fails

Given the test suite and the smokes
When they run
Then `smoke_gemini_cli.sh` no longer exists and `smoke_npm_package.sh` has no
  Gemini section
And the retired-surface guard reports `.gemini/`, `gemini:` hook entries, and
  `smoke_gemini_cli` as retired, and the tree is clean of them

Given a home with conversations logged as `gemini_cli`
When I run `mirror conversations` / `mm-recall` on one of them
Then it lists and loads as before
```

## Scope

- Delete `.gemini/hooks/*.sh`, the checkout's `.gemini/settings.json`, and
  the four `.gemini/hooks` rows in `scripts/generate_hook_wrappers.sh`.
- Delete `ts/src/hooks/gemini.ts`; remove the `gemini` case from
  `ts/src/hooks/main.ts`; drop the Gemini cases from `ts/test/hooks/hooks.test.ts`
  and `ts/test/frontDoor/hookPayloadRedaction.test.ts`. `ts/src/hooks/payload.ts`
  keeps reading `prompt_response` only if another runtime needs it; otherwise
  the Gemini-only branch goes with its comment.
- Remove `gemini` from `RuntimeName`, `ORDER`, the wiring table, and
  `geminiHooksSettings` in `ts/src/runtime/wiring.ts`; update
  `ts/test/runtime/wiring.test.ts` and `ts/test/frontDoor/initCli.test.ts`.
- `package.json`: drop `.gemini/hooks` from `files`, the `gemini-cli` keyword,
  and the runtime from `description`. Drop the `.gemini/hooks/` rows from
  `ts/src/guards/packContents.ts`.
- Delete `scripts/smoke_gemini_cli.sh`; remove section 9 from
  `scripts/smoke_npm_package.sh` and renumber; remove the smoke from the loop
  in `docs/process/development-guide.md` and from CI if it is wired there.
- Add a retired-surface row to `ts/src/guards/retiredSurfaces.ts` for the
  Gemini CLI integration, with a test in `retiredSurfaces.test.ts`, and drop
  `.gemini/hooks/` from the "no longer catches the runtime hooks" list there.
- Sweep code comments that describe the Gemini hooks as live
  (`hooks/runtime.ts`, `conversation/commandTurn.ts`,
  `conversation/deferredCloseTail.ts`, `conversation/logger.ts`,
  `frontDoor/stdinSource.ts`, `guards/piSourcedSkills.ts`).

## Out Of Scope

- Runtime-facing docs and skills (US2); the cutoff record and release (US3).
- The `gemini_cli` interface label in the logger, runtime policy, and tests:
  it names history and stays valid.
- Gemini models: `consult/modelCatalog.ts`, `providers/config.ts`,
  `providers/cost.ts`, and their tests and goldens.
- Anything under `~/.gemini/` that Antigravity owns, and the `.gemini-plugin/`
  marker in `guards/claudePlugin.ts`.

## Done (2026-10-18)

Removed as planned, Navigator validation accepted on the five observations in
`test-guide.md`. Two things the plan did not foresee: the retired-surface sweep
found one more live line (the runtime-interface spec's smoke reference), edited
here; and the P1 redaction test was ported to the Claude family rather than
dropped, so the invariant outlives the runtime. Debt Review deferred two
pre-existing findings (the `agy.ts` typecheck error, paid in the commit after
this one; D-031, the Claude plugin smoke's local non-hermeticity). The
`gemini-cli` guard row carries the code/CI names; US2 widens it.

## Validation

Navigator-visible: `npm pack --dry-run` output, `mirror init` output with
`gemini` on the PATH, `mirror-hook gemini:session-start` failing as unknown.
Automated: `npm test`, `smoke_npm_package.sh`, the retired-surface guard.
