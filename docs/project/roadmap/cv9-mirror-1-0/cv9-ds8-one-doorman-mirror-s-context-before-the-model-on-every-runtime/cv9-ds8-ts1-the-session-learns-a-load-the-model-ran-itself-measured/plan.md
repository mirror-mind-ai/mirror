# Plan — CV9.DS8.TS1

## Objective

Measure, on the installed Claude Code (2.1.310), Codex (0.164.0), and Pi (1.4.0), how a
`mirror mirror load` the model runs by itself can name its session, and record one
mechanism per runtime — or the absence of one — so that TS2's doorman is designed on
measured facts rather than on CR100's unmeasured lead.

## Scope

**The question.** `mirror load` writes the session's `mirror_active` flag only when it
receives `--session-id` (`writeMirrorState`, `ts/src/mirror/orchestration.ts`). The
Claude-family inject hook passes it; the skill's own load, run by the model from its
shell, does not. So a Mirror Mode the model started by itself is invisible to the
session, and a doorman gated on that flag stays silent afterwards. The candidate
mechanisms, by runtime:

**Claude Code (2.1.310).**
- M1. The Bash tool's environment carries `CLAUDE_CODE_SESSION_ID`, as the status line
  command does (CV21.DS11.US2), equal to the `session_id` the hooks receive. If so, the
  skill's load can read it (`MIRROR_SESSION_ID` is already the front door's
  environment session id; the skill or the front door can also read Claude's name),
  and the hook's per-turn state read works as it does for the explicit form.
- M2, an observation (n=1), not a measurement. The `Stop` hook's
  `last_assistant_message` carries the transition marker (`◌ MIRROR MODE ACTIVE`) or a
  `◇ persona` signature on a skill-driven Mirror turn. CR165's Pi replies: two of three
  carried it. Recorded, never relied on: the rule for TS2 is that a session learns
  from the harness, not from the model's reply; the marker is at most a backstop.
- M3, for TS2's design. Whether the variable is present in the hook's own environment
  as well as the Bash tool's, so one reader in the front door (as `runtimeDetection`
  reads Grok's variables) could serve both paths with no skill text change.
- The comparison source for every "equal to the hooks' session id" is the
  `runtime_sessions.session_id` row the prompt hook wrote in the scratch home, against
  the transcript's Bash output.

**Codex (0.164.0).**
- M1. The model's shell carries any session variable (`env` filtered for `codex`,
  `session`, `turn`), under `codex exec`, compared with the `session_id` the prompt
  hook wrote to `runtime_sessions` (CR152: Stop and SessionEnd never reach Mirror
  under exec; the prompt hook does). `codex exec` runs commands in a sandbox whose
  environment may be filtered, so its verdict is **provisional**: the TUI turn the
  route prints, run by the Navigator, decides Codex.
- If none: Codex's self-started Mirror Mode cannot be learned by naming the session;
  the fallback choices (no learning on Codex, the explicit form still served by the
  hook; or the reply marker as a backstop) go to the Navigator as a decision.

**Pi (1.4.0).**
- One session per mechanism, so the two cannot confound each other, each under a
  session dir whose path holds a space (an unquoted value fails where it is measured).
- P2, first. The probe extension (`--extension`, loaded beside the tree's own) sets
  `process.env.MIRROR_SESSION_ID` to the session file at `session_start`. Measured:
  the model's `env` turn shows the variable; the model's own load binds the session's
  conversation (`bindConversationContext` reads the environment id). **Not** measured
  as a verdict: whether `mirror_active` is written — as the code stands it is not,
  since `writeMirrorState` (`ts/src/mirror/orchestration.ts`) writes with the explicit
  `--session-id` alone and ignores the environment id the route already passes. That
  gap is recorded as TS2's fix, not as P2's failure. Under headless `pi -p --continue`
  every turn is a new process and `session_start` fires in each, so the variable is set
  again each turn; the interactive case (one process, `/new` firing `session_start`
  again) is inferred from the contract and said so.
- P1, second, in its own session. The probe subscribes to `tool_call`, logs every bash
  command, and when the command is `mirror mirror load …` or `mirror load …` with no
  `--session-id`, appends `--session-id` with the session file shell-quoted — the
  narrowest match, every rewrite logged — reading the session file from the handler's
  `ctx.sessionManager.getSessionFile()`. Measured: the probe log names the load; the
  scratch home's `runtime_sessions` row for that session has `mirror_active = 1`,
  which only the appended option can have written.
- Which of P1 and P2 TS2 uses is decided here. P2 declares the session once, visibly
  in `env`, rewrites nothing, and uses an existing contract; P1 does not depend on the
  environment the bash tool inherits but edits the model's commands, the precedent a
  hostile extension would set. P2 is the lean unless it fails to arrive.

**Files.** A route, `route.sh`, in this package, with the Pi probe extension beside it
(`probe.ts`), loaded only by the route's explicit `--extension`; the facts written into
this story's `index.md` and into DS8's package ("The Policy", rule 3). No product file
changes.

**What a session id in the model's shell grants**, recorded for TS2 to bound: the
model can already run every `mirror` command; with its session named it can also
write session-scoped state for its own session — mode, persona, journey — which the
contract's abuse cases (journey redirection) cover. `CLAUDE_CODE_SESSION_ID` is not
known to be documented by Claude Code; its record says "undocumented, measured on
2.1.310", and TS2 must fall back to today's behavior when it is absent, never fail.

## Non-Goals

- Do not implement sibling roadmap item: The doorman: one decision in the core, with its command.
- Do not implement sibling roadmap item: The skill trusts delivered context, and one signature rule.
- Do not implement sibling roadmap item: Antigravity through the one doorman.
- Do not implement sibling roadmap item: Written where a user reads it.
- Do not implement sibling roadmap item: Claude Code and Codex through the one doorman.
- Do not implement sibling roadmap item: Pi through the one doorman, at L4.
- No change to `mirror load`, the hooks, the skill, or the Pi extension. The probe is
  the route's, not the product's.
- No measurement on Antigravity (its SessionStart marks every session active) or Grok
  Build (outside DS8).

## Acceptance Behavior

```text
Given a scratch cell per runtime: a seeded scratch Mirror home, a scratch session dir
      or config dir, the real binaries
When one Mirror turn is run on each runtime and the model's own load is observed
Then for Claude Code the record says whether CLAUDE_CODE_SESSION_ID reaches the Bash
     tool and equals the hooks' session id, from the transcript and the front-door log
And for Codex the record says which session variables the model's shell carries, if
     any, against the hooks' session id
And for Pi the record says that tool_call saw the load, whether the appended
     --session-id reached the front door, and whether MIRROR_SESSION_ID set at
     session_start reached the model's shell and marked the session
And one mechanism per runtime is written in DS8's package, or the runtime with none is
    named for the Navigator's decision, each with version, binary, and date
```

## Validation Route

Automated: none to add; the probe and the route are measurement instruments, not
product code. `npm test` stays green because nothing in `ts/` changes.

Navigator-visible route (`route.sh`, scratch directory `DS8_TS1_DIR`, default
`/tmp/cv9-ds8-ts1`). Every fact is a row — expected, observed, source — and **fail** is
a claimed fact with no log behind it, or a route step that did not run. The verdict per
runtime is "mechanism found: which" or "none", never "pass".

1. `route.sh setup`: the baseline of the real configuration (DS11's manifest plus
   `~/.codex`: `auth.json`, `config.toml`, the plugin cache), the versions and binaries,
   the seeded scratch home, the probe staged under the scratch dir.
2. **Pi**, the Driver's: `route.sh pi p2`, one session: the explicit Mirror question,
   then `Run the shell command: env | grep MIRROR_`. Rows: the variable in the reply
   and the transcript; the load seen in the probe log; the session's conversation
   bound; `mirror_active` as found (expected unwritten, TS2's gap). Then
   `route.sh pi p1`, a second session: the explicit Mirror question. Rows: the load
   seen and rewritten in the probe log; `runtime_sessions.mirror_active = 1`.
3. **Claude Code**, the Navigator's login once (`route.sh login claude`, `/login`,
   `/exit`), the plugin wired in the scratch config dir, then the Driver's
   `route.sh claude`: two headless turns. Turn 1: `Run the shell command: env | grep
   CLAUDE_`. Rows: `CLAUDE_CODE_SESSION_ID` in the transcript's Bash output, against
   `runtime_sessions.session_id`; the same variable in the hook's own environment
   (a probe hook keeps `env` names). Turn 2, a new session: a plain personal question
   with no form (CR165's session B), so the model runs the skill by itself. Rows:
   the load in the transcript; whether the session's conversation was bound or the
   flag written (expected neither, today); M2's marker in the Stop payload, n=1.
4. **Codex**, the Driver's: `route.sh codex`, the real `auth.json` borrowed into a
   scratch `CODEX_HOME` under a `trap` that removes it on any exit: `codex exec` with
   the plugin from Mirror's marketplace, one turn running `env | grep -i -E
   'codex|session|turn'`. Rows: what the shell carries, against the prompt hook's
   `runtime_sessions.session_id`; marked provisional. The route prints the TUI command
   for the Navigator's interactive turn, which decides Codex.
5. `route.sh clean` and `route.sh untouched`: scratch removed, nothing left under
   `.pi/` or the tree, the keychain entry named, the Codex credential gone, the real
   configuration and the real homes compared with the baseline.

E2E decision: required — the three measurements are the story. Cost: a few cheap-model
turns on each runtime, cents.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable. None here: no
  product behavior changes; the probe is route-only.
- Keep changes scoped to `CV9.DS8.TS1`: the route, the probe, this package's records,
  and DS8's package where the mechanisms are written.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- A fact is written only as the transcript, the probe log, or the front-door log shows
  it; the model's own report of its environment is an observation, not the gate.
- Isolation as the contract's "Smoke test isolation" and "Claude Code's login in
  isolated routes": scratch homes and config dirs, nothing of the Navigator's written;
  `untouched` proves it.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed — in particular, a runtime where no mechanism names the
  session (Codex is the likely one): the choice between the reply marker and no
  learning is the Navigator's, and TS2 waits for it.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
