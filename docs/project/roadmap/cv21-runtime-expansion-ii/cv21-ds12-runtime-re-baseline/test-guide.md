[< Story](index.md)

# Test Guide — CV21.DS12

## Aggregate Validation

DS12 changes no product code. What is validated is evidence and a decision:

- every runtime finding carries its command, version, binary path, and date;
- the imports DS1 deferred ran, and what survived is recorded;
- the decision record follows from the findings;
- the probes left the real runtime configs and the real Mirror homes untouched.

Driver checks, before hand-over and before Validation:

- `bash -n route.sh`, and every Driver step run end to end in a fresh scratch
  directory;
- the doc link and duplicate-heading check (`node ts/scripts/checkDocLinks.ts`) after
  each findings or decision commit;
- every Findings row in TS1–TS4 has a non-empty command, version, binary, and date.

## Child Work Packages

- CV21.DS12.TS1 — Claude Code re-probe
- CV21.DS12.TS2 — Codex re-probe
- CV21.DS12.TS3 — Antigravity re-probe, and the bar for removing Gemini CLI
- CV21.DS12.TS4 — Grok Build re-probe
- CV21.DS12.TS5 — Extension surface re-grounding
- CV21.DS12.TS6 — Re-baseline decision and roadmap reshape

## Navigator Validation

All commands run from this package's directory. The live steps come first, during
implementation, when the Driver hands them over. Steps 2–5 are the Validation itself.

1. **Live probes**, run once per runtime when handed over: `bash route.sh live-claude`,
   `live-codex`, `live-antigravity`, `live-grok`. After each session, run the matching
   `bash route.sh check-<runtime>`.
   - **Expected:** one short session, at most two turns, typed as the step prints them.
     For Claude Code, the first turn is a Mirror turn through the plugin (DS2.TS4's
     reference turn). The live step prints the runtime's version and binary. The check
     step prints which hooks fired, with what payload fields, and which prompt text
     they saw. It also prints what Mirror logged in the scratch home and under which
     `interface`, and any hook failure. You report the model's answers: the canary
     lines it quoted, whether it saw the Operating Instructions, its `mm` skill count,
     and the `mirror-mind` MCP tools.
   - **Isolation:** every session runs on a scratch config: a scratch
     `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, or `HOME`. A login, if asked for, happens there.
     `DS12_DRY=1` prepares a step without starting the session, which is how the Driver
     checked them.
   - **Pass:** the step ends with its ✓ / ✗ summary, and you can say what you saw in
     the session.
   - **Fail:** the session needed a third turn, a login outside the scratch `HOME`
     where the step did not say so, or a change to a real config.
2. **Read the decision record and the parity matrix.**
   - **Expected:** each runtime has a level, the mechanism that earns it, and its
     version, binary, and date. The successor bar for removing Gemini CLI is stated.
     DS2's remainder and DS4–DS11 each read confirmed, reshaped, merged, or dropped,
     with the finding that decided it.
   - **Pass:** you can trace every level and every reshaped row to a finding.
   - **Fail:** a claim without evidence, or a reshape without a reason.
3. **`bash route.sh verify`.**
   - **Expected:** the installed versions beside the recorded ones, and the cheap
     static claims re-run.
   - **Pass:** they all agree, or the step names the drift and the claims it touches.
   - **Fail:** a recorded claim that no longer holds and is not flagged.
4. **`bash route.sh untouched`.**
   - **Expected:** the real runtime config files compared with the checksums taken at
     setup, and the real Mirror homes searched for the canary.
   - **Pass:** nothing changed, and no canary is found.
   - **Fail:** any changed config file, or a canary or scratch session in a real home.
5. **`bash route.sh clean`.**
   - **Expected:** the scratch directory removed, including any login made inside it.
   - **Pass:** the step reports what it deleted, and the directory is gone.

## Validation Evidence

**Validated by the Navigator on 2026-10-13.** The decision and the reshaped CV21 index were
accepted without corrections, including dropping CV21.DS2.US3.

- **Driver checks.**
  - `route.sh` passes `bash -n` and shellcheck, and every Driver step ran end to end.
  - The doc link and duplicate-heading checks are clean after every commit.
  - The builder and script suites pass (459/459).
  - The retired-surface tripwire is clean.
- **Versions.** `bash route.sh verify` gave 20/20 on 2026-10-13, after the sessions: claude 2.1.296, codex
  0.162.1, agy 1.3.4, and grok 1.0.52, as `recorded-versions.tsv` holds them. There was
  no drift during the story.
- **Live probes (E2E).** The Navigator ran four sessions on 2026-10-13 between 14:18 and
  14:53 UTC, two turns each, on scratch configs, each followed by its `check-<runtime>`
  step. The findings are in TS1–TS4, under "Findings — live".
- **Untouched.** After all four sessions, `bash route.sh untouched` passed 2/2 (15:06
  UTC). The real runtime configuration matched its 315-entry baseline, and no real
  Mirror database held a DS12 canary or probe prompt. The Navigator then ran the
  route's closing steps, and the scratch directory, with its logins, is gone.
- **Deviations, recorded in the findings and fixed in the route (`bf588138`).**
  - A Driver dry run left Mirror's `AGENTS.md` in the shared project folder that the
    Claude Code and Codex sessions used. Both sessions still kept the hook's copy apart
    from the file's.
  - A dry check run after the sessions deleted three raw probe captures. Their
    summaries had been read first, and the runtimes' transcripts carried the canaries.


**A note added by CV21.DS2's Debt Review (2026-10-13).** Two things this route's isolation
did not cover, found while DS2 reused it:

- The Claude Code live session kept the Navigator's `HOME` for its login, and unset
  `OPENROUTER_API_KEY` only from the environment. Mirror's config loader fills an unset
  variable from `~/.config/mirror/env`, so the real provider key could have reached that
  session's Mirror processes. "The scratch Mirror has no provider key: it cannot spend"
  held for the static steps, not necessarily for that session. `MIRROR_USER=ds12` was
  set explicitly, which is why the session did not meet the home conflict DS2's first
  run did.
- Codex left its app-server daemon running from the scratch `CODEX_HOME` after the live
  session, holding that login, and recreating `/tmp/cv21-ds12/codex-live` after
  `clean`. It ran from 16:28Z until DS2 stopped it.

Neither changes a DS12 finding. DS2's route fixes both for its own runs.
