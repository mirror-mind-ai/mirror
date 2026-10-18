[< Parent](../index.md)

# CV21.DS7.US4 — Antigravity at the bar, measured live

**Status:** ✅ Done
**Type:** User Story

---

## User Story

In order for DS8 to remove Gemini CLI knowing nothing is lost,
As the Driver of CV21,
I want one isolated live session on the installed agy, Mirror installed only
through the shipped package, that walks all five items of DS12.TS3's
successor bar and records each with version, binary, and date,
So that Antigravity's parity is a measured fact, and DS8 reads this result
as its gate.

## Outcome

TS1–TS3 built and measured each mechanism in isolation. US4 measures them
TOGETHER, as a Gemini CLI user would meet them, in one session on the
installed agy (1.4.2), and moves the parity row to the level the evidence
supports. No new production code: US4 is a measurement, carried by the
`route.sh` scripts TS1–TS3 already built, composed into one bar-walk.

## The bar (DS12.TS3, Navigator 2026-10-13)

1. all of Mirror's skills reachable;
2. the Operating Instructions at session start;
3. Mirror Mode context injected once per user turn while Mirror Mode is
   active;
4. user and assistant messages logged, labelled `antigravity`, the
   conversation closed at the end;
5. setup in no more documented steps than Gemini CLI's two.

MCP is not part of the bar (v0.32.1's Gemini wiring carries none), but its
reachability is recorded.

## Acceptance Behavior

```text
Given Mirror installed through the shipped package only, on the installed agy
When one live session walks the five bar items
Then each item is observed and recorded with version, binary, and date:
  the skills reachable, the instructions at start, injection once per turn,
  the turns logged as antigravity and the conversation closed, the install
  in one step
And the parity row moves to the level the evidence supports
And any red line is explained and, if a Mirror defect, fixed under a named
  scope change, or recorded as agy's behavior
```

## Scope

- One live session on the installed agy, Mirror from the shipped package,
  the Navigator's real key.
- A bar-walk route composing TS1–TS3's `route.sh` steps, with the five
  items checked and recorded.
- The parity row updated (DS7 index, CV21 index, the parity matrix note)
  with version, binary, date.
- Sanitized evidence: observations and readings, never conversation content.

## Out Of Scope

- DS8's Gemini CLI removal (US4 is only its gate).
- New production behavior: US4 measures what TS1–TS3 shipped. A red line
  that is a Mirror defect is fixed under an explicit scope change, as
  Codex's US4 did.
- The cross-session write defect (DS12.TS2 L9), routed.

## Validation

The live session is the validation: each bar item green on the installed
agy with version, binary, and date, Navigator-accepted. Automated checks
(the suite, lint, wrappers) confirm the shipped mechanisms are intact before
the walk.
