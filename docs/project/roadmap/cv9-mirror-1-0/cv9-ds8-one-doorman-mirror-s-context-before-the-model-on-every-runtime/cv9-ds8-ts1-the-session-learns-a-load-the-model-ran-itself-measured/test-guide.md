[< Story](index.md)

# Test Guide — CV9.DS8.TS1

## Automated Validation

None added: the story measures and records; no product code changes. `npm test` stays
as it is, and `node ts/scripts/checkDocLinks.ts` holds the records' links.

## Navigator Validation

The route is `route.sh` in this package; every step runs under `DS8_TS1_DIR` (default
`/tmp/cv9-ds8-ts1`, resolved to its physical path). Every fact is a row — expected,
observed, source — and fail is a claimed fact with no log behind it, or a step that did
not run. The verdict per runtime is the mechanism found, or none.

1. **Pi** (the Driver's; you read the rows). `route.sh pi p2`, then `route.sh pi p1`,
   one session each.
   P2 rows: `MIRROR_SESSION_ID=<session file>` in the `env` turn's reply and
   transcript; the load in the probe log; the session's conversation bound
   (`runtime_sessions.conversation_id`); `mirror_active` as found (expected unwritten:
   `writeMirrorState` ignores the environment id, TS2's fix).
   P1 rows: the load seen and rewritten in the probe log, with the quoted path; `mirror_active = 1`.
2. **Claude Code.** `route.sh login claude` once (your `/login` in the route's config
   dir, then `/exit`), then the Driver's `route.sh claude`.
   Rows: `CLAUDE_CODE_SESSION_ID` in the Bash output against `runtime_sessions.session_id`;
   the variable in the hook's own environment; on the plain personal question, the
   model's own load in the transcript and whether the session learned it (expected
   not, today); M2's marker, n=1.
3. **Codex.** The Driver's `route.sh codex` (`codex exec`, the credential borrowed under
   a `trap`). Rows: the shell's session-like variables against the prompt hook's id,
   marked provisional. Yours, deciding Codex: the printed TUI command, one turn running
   the same `env`; tell the Driver what it printed.
4. **The decision.** DS8's package names one mechanism per runtime, each backed by a
   row above, or names the runtime with none and the choice it needs.

Cleanup: `route.sh clean` (scratch removed, nothing under `.pi/`, the keychain entry
named, the Codex credential gone) and `route.sh untouched` (the real configuration
including `~/.codex`, and the real homes, against the baseline).

## Validation Evidence

Pending implementation and validation.
