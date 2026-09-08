# Review — CV22.DS7.TS1

## Status

Reviewed

## Debt Findings

- Five findings, none blocking parity, all captured as CRs at this review: CR059 (RS009) the Pi extension and Gemini hooks bypass the front door, so flipped hook routes reach live sessions only for the one call TS1 moved; CR060 backup --silent exits 0 on failure; CR061 backup raw-copies a live WAL database while detached maintenance may write (snapshot via VACUUM INTO); CR062 archives written 0644 under umask while the front door's snapshot is 0600; CR063 repair-encoding repairs journey slug cells without the identity side of the join. Reproduced on purpose: this is a parity story, and TS owns backup/repair-encoding only since the flip.

## Debt Decision

defer

## Defer Reason

Each finding changes observable behavior and belongs to the RS009/RS010 route (authority first, port second, golden and oracle baseline in the same commit), not to a story graded by byte-equality with Python. CR059 is the highest-impact one and is independent of TS1's code.

## Revisit Trigger

CR059 before the next DS7 flip is claimed as reaching live sessions (US6/TS3 at the latest); CR060/CR061/CR062 before DS8 makes the shutdown backup the last line of defense under live extraction; CR063 before DS10 deletes the Python side so both cores can still be compared.

## Missing Decision

- none
