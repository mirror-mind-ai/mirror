[< CV8 Runtime Expansion](../index.md)

# CV8.E3 — Gemini CLI Operational Validation & Docs

**Epic:** Prove the Gemini CLI runtime works end-to-end, does not touch production state during tests, and is documented honestly
**Status:** Done
**Depends on:** CV8.E2 Gemini CLI Runtime Implementation

---

## What This Is

This epic validates the Gemini CLI integration end-to-end and updates all
public-facing documentation to reflect the new runtime.

---

## Done Condition

- ✅ Isolated Gemini CLI smoke test proves session start, user logging, assistant
  logging, session end, and production DB safety
- ✅ Resulting SQLite rows show `interface='gemini_cli'`
- ✅ Production DB checksum guard proves no production DB was touched
- ✅ README updated: three runtimes, prerequisites, commands table, start-using section
- ✅ Getting Started updated: three runtimes, prerequisites, start section
- ✅ Runtime Interface Contract updated: Gemini CLI reference implementation added
- ✅ mm-help skill updated: description now mentions both Pi and Gemini CLI
- ✅ Gemini CLI SessionEnd best-effort limitation documented (deferred extraction)
- ✅ Worklog records validation result and final parity level

---

## Parity Result

**Gemini CLI: L4 Full Parity**

| Level | Status | Notes |
|-------|--------|-------|
| L1 Logged runtime | ✅ | `BeforeAgent` + `AfterAgent` + `SessionStart` + `$GEMINI_SESSION_ID` |
| L2 Command surface | ✅ | 19 skills at shared `.agents/skills/mm-*/SKILL.md` surface |
| L3 Mirror Mode | ✅ | `BeforeAgent` `additionalContext` — automatic per-turn injection |
| L4 Full parity | ✅ | All of the above + smoke test + docs |

Honest limitation: `SessionEnd` is best-effort (CLI exits without waiting).
Mitigated by deferred extraction at next `SessionStart` — same model as Pi.

---

## Smoke Test

```bash
./scripts/smoke_gemini_cli.sh
```

Validates end-to-end without touching production. Verified:

1. `SessionStart` hook → `conversation-logger session-start` → exits 0, returns `{}`
2. `BeforeAgent` hook (regular prompt) → `log-user --interface gemini_cli` → exits 0
3. `BeforeAgent` hook (skill invocation `/...`) → skipped, returns `{}`
4. `AfterAgent` hook → `log-assistant --interface gemini_cli` → exits 0
5. `SessionEnd` hook → `session-end-pi` + `backup --silent` → exits 0
6. DB inspection: 1 conversation with `interface='gemini_cli'`, 2 messages in conversation, correct content
7. Production DB checksum unchanged

---

## Stories

| Code | Story | Status |
|------|-------|--------|
| CV8.E3.S1 | Write isolated Gemini CLI smoke test script | Done |
| CV8.E3.S2 | Validate Gemini CLI session lifecycle end-to-end | Done |
| CV8.E3.S3 | Validate Gemini CLI Mirror Mode injection path | Done (tested via `mirror load --context-only` in hook) |
| CV8.E3.S4 | Update public and operational docs for Gemini CLI | Done |
| CV8.E3.S5 | Record Gemini CLI parity level and limitations | Done |

---

## See also

- [CV8.E2 Gemini CLI Runtime Implementation](../cv8-e2-gemini-cli-runtime-implementation/index.md)
- [CV8.E4 Runtime Adapter Hardening](../cv8-e4-runtime-adapter-hardening/index.md)
- [Runtime Interface Contract](../../../../product/specs/runtime-interface/index.md)
- [Smoke test script](../../../../../scripts/smoke_gemini_cli.sh)
