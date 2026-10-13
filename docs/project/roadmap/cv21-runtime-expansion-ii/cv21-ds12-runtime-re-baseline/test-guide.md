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
   `live-codex`, `live-antigravity`, `live-grok`.
   - **Expected:** one short session, at most two turns. The script prints the
     runtime's version and binary, which hooks fired, whether the canary reached the
     model at session start and on the second turn, and whether `mm-*` skills and the
     MCP server answered.
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

Pending implementation and validation.
