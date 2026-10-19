[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR144 — The DS7 routes remove agy's credential where 1.3.x kept it, and 1.4.2 keeps it elsewhere

## Problem

The three live routes of CV21.DS7 authenticate agy inside a scratch `HOME` and
promise to remove the credential on exit. `cv21-ds7-us4-…/route.sh` (lines 36–38
and 160–161) removes `.gemini/oauth_creds.json` and `.gemini/google_accounts.json`
and then prints `scratch credential verified absent` when the first is gone;
`cv21-ds7-ts2-…/route.sh` (line 41) and `cv21-ds7-ts3-…/route.sh` (line 30) remove
the same two files from a trap.

agy 1.4.2 keeps its login at `.gemini/antigravity-cli/antigravity-oauth-token`.
CV21.DS5.TS1 found this on 2026-10-19 when a login made inside a scratch `HOME`
produced that file and neither of the two the DS7 routes name. On 1.4.2 the removal
deletes nothing, and US4's "verified absent" passes because it checks a file that was
never there, while the token stays in the scratch directory until the directory is
removed, if it is.

DS7.US4 measured on agy 1.4.2 (2026-10-18) and reported the credential verified
absent (its test guide, line 58–59). That claim was true of the file it checked and
not of the login the session used.

## Expected Behavior

The DS7 routes remove the credential agy actually wrote, on the installed version,
and the "verified absent" check reads that file. The simplest honest form is the one
DS5.TS1's route uses: name both locations (`oauth_creds.json` and
`google_accounts.json` for 1.3.x; `antigravity-cli/antigravity-oauth-token` for
1.4.2), remove all of them, and verify none remains. A route that cannot find any
credential file after a successful login should say so rather than report absence.

## Impact

Low for the product: nothing shipped reads these routes. Real for the evidence rule
and the security posture the routes claim: a scratch login left behind after a
"verified absent" is the exact outcome the check exists to prevent, and the three
routes re-run when agy updates (DS7's own reason for committing them). Sibling:
DS5.TS1's route carries the 1.4.2 location and the same vacuous risk the other way
if agy moves the file again.

## Plan Or Decision

Captured, unassigned, 2026-10-19, from CV21.DS5.TS1's Debt Review, at the Navigator's
direction. Current Focus unchanged.

## Evidence

On agy 1.4.2 (`~/.local/bin/agy`), 2026-10-19: after `agy --print "Reply with the
single word: ready."` in a scratch `HOME` with the interactive auth completed, the
scratch `.gemini/` held `antigravity-cli/antigravity-oauth-token`, `antigravity-cli/installation_id`,
and `config/`, and no `oauth_creds.json` or `google_accounts.json`. A copy of the
real home's `oauth_creds.json` into a scratch home was not honoured: agy opened a
fresh auth flow. Recorded in DS5.TS1's test guide ("Logins").

## Outcome

Open.
