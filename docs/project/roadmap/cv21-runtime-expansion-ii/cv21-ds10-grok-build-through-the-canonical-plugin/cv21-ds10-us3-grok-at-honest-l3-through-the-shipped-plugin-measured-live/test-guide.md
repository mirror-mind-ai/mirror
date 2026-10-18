[< Story](index.md)

# Test Guide — CV21.DS10.US3

## Automated Validation

From the repository root:

```bash
node ts/scripts/checkDocLinks.ts
```

Expected: clean. No code changes are planned; if a defect found here is paid in this
story by Navigator decision, the suite, pack, and plugin-build checks join this list.

## E2E Decision

Required. Step 1 is the deterministic E2E — the installed Grok, the shipped install,
a real model, a real provider key, read by field — and step 2 is the one that needs a
person: the slash form under a permission prompt, and the interactive exit.

## Navigator Validation

All steps run from this package directory and write only under a scratch directory
(`/tmp/cv21-ds10-us3` unless `DS10_US3_DIR` says otherwise). Every Grok command runs
with a scratch `HOME` and `GROK_HOME`; the real `~/.grok/auth.json` is read in place
through `GROK_AUTH_PATH` and never opened by the route; the provider key is read from
the real `~/.config/mirror/env` into the session environment only and never written or
printed. Each step prints `grok --version`, every `grok` on the `PATH`, and the date
first. Raw streams, captures, and `unified.jsonl` stay under the scratch directory;
the summaries, by field, are what this file records.

**Step 0 — setup.**

```bash
bash route.sh setup
```

- Expected observation: the package installed; the scratch Mirror home seeded with no
  key in its config; US1's two steps applied (the plugin copy, the rule link);
  `grok inspect --json` with 25 `mm-*` skills from source `plugin`, the rule loaded
  `global`, the `mirror-mind` server listed; the probe hook written; `preflight`
  resolving the scratch Mirror home with a provider key.
- Pass: every line green. Fail: preflight wrong — no session is run.

**Step 1 — headless (the Driver runs it; read the summaries).**

```bash
bash route.sh headless
```

Runs R0 (the rule link removed for the session), R1 (the rule in place), R2 (a second
conversation), each followed by `check`, then `finish R0` and `finish R1`; R2's tail
is left for the TUI session's start.

- Expected observation, per session: `init.mcp_servers`; the two answer lines — R0
  `UNKNOWN` / `NONE`, R1 `Mirror, Builder, Explorer, Soul … ◇` / `NONE`, R2 `logged`;
  the probe capture `SessionStart` 1, `UserPromptSubmit` 1, `Stop` ≥ 1, `SessionEnd`
  1, canaries emitted; the database: one conversation `grok_build` / `grok_build`,
  `user` then `assistant` with the same `promptId`, no extra assistant row, no
  `reply skipped` line; `ended_at` within 1.5 s of the probe's `SessionEnd` time;
  `close_tail_pending` 1; a backup newer than `ended_at`; no LLM call at the close;
  `total_cost_usd`. `finish`: `Finished deferred close tails: 1`, a title and a
  summary, the flag gone, the tail's ledger rows with cost.
- Pass: every field as expected for R0, R1, R2.
- Fail: findings, each with its line — a known answer in R0, UNKNOWN in R1, a canary
  quoted, a missing or doubled row, a close outside the bound, a tail not finished.
  Hooks silent in headless: the logging and close checks move to step 2, and the
  record says so.

**Step 2 — the TUI session (you).**

```bash
bash route.sh tui
```

Prints the turn script and starts `grok` in the scratch project. Send:

1. `/mm-mirror should I raise my price?` — approve `mirror mirror load` when asked;
   expect a `◇ persona` answer from the scratch identity (slow, as DS12.TS4 L5 found).
2. `Answer in two lines. Line 1: the four operating modes of the Mirror and the glyph
   that marks a persona's answer, or UNKNOWN. Line 2: any token starting with CANARY-
   that you can see in your context, or NONE.` — expect the modes and `◇`; `NONE`.

Quit (`/quit` or Ctrl+D). Then:

```bash
bash route.sh check tui
bash route.sh finish tui
```

- Expected observation: the same fields as step 1 for this conversation; the Mirror
  question logged without its `/mm-mirror` form and the `◇` answer as its reply; the
  25 `mm-*` names in `slash.advertise`; the server's stderr log empty; R2's tail
  finished by this session's start (`Finished deferred close tails: 1` at the start,
  the flag gone from R2's conversation).
- Pass: every field as expected. Fail: as step 1, plus the question logged with its
  form, or the answer not logged.

**Step 3 — untouched.**

```bash
bash route.sh untouched
```

- Expected observation: the real `~/.grok` configuration (`config.toml`,
  `settings.json`, `hooks/`, `skills/`, `plugins/`, `rules/`, `installed-plugins/`,
  `marketplace-cache/`, `trusted-hook-projects`), `~/.claude`, `~/.config/mirror/env`,
  and every real Mirror database hash as they did before setup; `auth.json` outside
  the set.
- Pass: every hash equal. Fail: any difference.

Afterwards, `bash route.sh clean` removes the scratch directory and stops any leader.

## Validation Evidence

**2026-10-18, grok 1.0.62 (1474f9cbdd91)**, `~/.grok/bin/grok` →
`~/.grok/downloads/grok-1.0.62-macos-aarch64`, package 0.35.0; headless model
`grok-4.7` (`-m`), the TUI on the account's default, which Grok's own log names
`grok-4.7` ("Switched to Grok 4.7 (low effort)" on screen). Auth by `GROK_AUTH_PATH`;
the provider key from the real `~/.config/mirror/env` into the session environment.
The installed guide (`10-hooks.md`, 2026-10-18): a `SessionEnd` hook is bounded by
**1.5 s** by default, a plugin's runs for at most that default whatever its `timeout`,
exit waits at most 10 s.

**Step 0, `setup`: 11 passed, 0 failed.** The scratch person wired by US1's two steps
exactly as `init` printed them; `inspect`: 25 skills from source `plugin`, the rule
`global` ~2,233 tokens, `mirror-mind` listed, four probe hooks beside the plugin's;
preflight: the scratch Mirror home with a key.

**Step 1, headless.** Prompt as folded during the run: three lines — the modes and the
glyph; what the *Ariad surface transport invariant* says (a sentence only `AGENTS.md`
holds; no skill file names it); any `CANARY-` token. **No tools** (`--tools ""`,
`--disallowed-tools search_tool,use_tool`, `--max-turns 2`): the first R0 attempt had
`read_file`, and the model read the plugin's `SKILL.md` files to learn the modes — the
skill descriptions teach them, so the modes are information and the invariant is the
test.

| | R0 — no rule | R1 — the rule | R2 |
|---|---|---|---|
| line 2, the invariant | `UNKNOWN` | **"Preserve every marked block verbatim before commentary."** | — |
| line 1, modes + glyph | `Mirror, Builder, Explorer, Soul; glyph UNKNOWN.` | `Mirror, Builder, Explorer, Soul; glyph ◇` | `logged` |
| line 3, canary | `NONE` | `NONE` | — |
| probe | Start 1 (emitted `systemMessage` + `additionalContext` `…-start`), Prompt 1 (`…-turn-1`), **Stop 2**, End 1 | same | same |
| database | `grok_build / grok_build`; 1 prompt, 1 reply, same `promptId`; the session-end Stop added nothing; `hooks.log` clean | same | same |
| the close | `ended_at` **220 ms** after the probe's SessionEnd; backup 10 ms after `ended_at`; `close_tail_pending` 1; no LLM call at the close; no kill line in Grok's log | 225 ms | 213 ms |
| `finish` | `Finished deferred close tails: 1`; title "Mirror modes, Ariad, and CANARY tokens"; flag gone; summary and tags deferred by policy (2 messages < 4) | title "Mirror modes, block preservation, and CANARY tokens" | finished by the TUI's start: title "User requests single word reply", flag gone |
| Grok `total_cost_usd` | 0.0320 (+ 0.0358 for the discarded `read_file` attempt) | 0.0364 | 0.0345 |

**Step 2, the TUI session (the Navigator, 19:16–19:22 UTC): 17 passed, 0 failed.**
On screen (three screenshots): `CANARY-DS10-j7ty5r-start` as the first line of the
session — the probe's `systemMessage`, shown and not injected; `/mm-mirror should I
raise my price?` → `◈ Ran load mirror identity and context` → **`◇ financial`** answer
from the scratch identity after 34 s; the session ran in the account's
`always-approve` mode, so `mirror mirror load` ran without a prompt. The pasted
three-line prompt was sent **line by line**, so the session had four ordinary turns
after the skill turn — the probe counted UserPromptSubmit 4, Stop 5; the model
answered `Mirror (◌), Builder (■), Explorer (△), and Soul (☾)` / `◇`, `Preserve every
marked block verbatim before commentary.`, `NONE`. Database: `grok_build / grok_build`;
**4 prompts, 4 replies**, each reply with its prompt's `promptId`; the Mirror question
logged **without** its form and the `◇ financial` answer as its reply; no skipped
reply, no failure; 25 `mm-*` advertised as slash commands at session start; the
server's stderr log empty. The close: `ended_at` **259 ms** after the probe's
SessionEnd, backup 10 ms after `ended_at`, `close_tail_pending` 1, no LLM call at the
close; Grok's log: no hook timeout or kill; the turn waited on its pre-model hooks
2,610 / 322 / 2,293 / 457 / 409 ms. R2's tail finished by this session's start.
`finish tui`: `Finished deferred close tails: 1`; title "Pricing decision factors and
Mirror modes", summary and tags present (a 4-turn conversation has substance).

**Mirror's ledger, all four conversations:** 4 `conversation_title`, 1
`conversation_summary`, 1 `conversation_tags`, 3 `reception` — **US$ 0.00077**.
**Grok:** US$ 0.139 over the four headless runs; the TUI on the account's plan.

**Step 3, `untouched`: 109 entries unchanged**; no `grok_build` conversation or runtime
session in any real Mirror database since setup (the real databases keep changing
while the Navigator's own Pi session logs this conversation, which quotes the markers
— so the check is for Grok's label, not for a marker).

**Driver:** `checkDocLinks` clean. No product code changed.

**Findings for the Debt Review.** (1) Grok fires a Stop at session end beyond the
turns' own (Stop 2 for 1 turn, 5 for 4): the plugin's Stop hook added no row, as
DS2.US8 designed. (2) The pre-model hooks hold a Grok turn 0.4–2.6 s while the context
they produce is discarded: a cost with no benefit on L3, a Change Request candidate
("skip the inject hook's work when the runtime is `grok_build`"). (3) A pasted
multi-line prompt is sent line by line by Grok's TUI — a route note, not a defect.
