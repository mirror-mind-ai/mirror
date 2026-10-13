# Delivery Story Plan — CV21.DS12

**Journey:** mirror
**Method:** ariad
**Cadence:** stepwise
**Navigator Flow Unit:** delivery_story

## Delivery Story

Runtime Re-Baseline

## Objective

Re-measure CV21's runtime evidence on the installed Claude Code, Codex, Antigravity, and
Grok Build, in isolation and under the evidence rule. Run the plugin imports DS1
deferred. Re-ground the extension surface on the TypeScript extension contract. Set the
bar DS7 must reach before DS8 removes Gemini CLI. Close with one decision that confirms
or revises the convergence and reshapes DS2's remainder and DS4–DS11.

## Child Work Packages

- CV21.DS12.TS1 — Claude Code re-probe
- CV21.DS12.TS2 — Codex re-probe
- CV21.DS12.TS3 — Antigravity re-probe, and the bar for removing Gemini CLI
- CV21.DS12.TS4 — Grok Build re-probe
- CV21.DS12.TS5 — Extension surface re-grounding
- CV21.DS12.TS6 — Re-baseline decision and roadmap reshape

## Prepare

What the probes start from (v0.32.1, the package `npm install -g mirror-mind` installs):

- **Claude Code.** The plugin `plugins/mirror-mind` carries 25 skills, three hook
  events, and the MCP server through `mcp/launch.sh` → `mirror mcp`. Its hooks run the
  installed `mirror-hook`. It is wired in one step, as a skills-dir plugin. CV22 proved
  it in a real Claude Code 2.1.283 session.
- **Codex.** Mirror ships a wrapper, `scripts/codex-mirror.sh`, which logs around the
  session and imports the JSONL afterwards. Skills reach Codex through
  `~/.codex/skills/`, instructions through `~/.codex/AGENTS.md`. That is two steps,
  verified on 0.157.0 with `codex debug prompt-input`. The wrapper's own header still
  says "Codex has no hook system", which DS3 contradicted in June.
- **Antigravity and Grok Build.** Nothing ships for either.
- **The June "universal skill surface" is weaker than DS3, DS6, and DS9 recorded.**
  `.agents/skills/` exists only in the checkout, links 21 of the 25 skills (no
  `mm-discard`, `mm-explore`, `mm-soul`, `mm-update`), and is not in the npm package.
  The probes therefore measure what an npm user can wire, not what a checkout happens
  to expose.

Risks:

- authentication: a scratch `HOME` has no login, and live sessions need one;
- cost: model turns;
- leakage: a probe that writes into a real config or a real Mirror home;
- drift: a version that moves mid-story.

## Scope

1. **One route script**, `route.sh` in this package, one step per probe, each printing
   ✓ / ✗ and the evidence to read. This follows CV22's route 3: a script run with
   `bash`, proven by running it.
2. **A scratch install** of the working tree's package into a scratch npm prefix, a
   scratch `HOME`, and a scratch Mirror home with no provider key. Every Driver step runs
   there.
3. **Static probes, run by the Driver.** No login and no model call. They read what the
   installed binaries, their bundled docs, and their discovery commands say:
   - `claude plugin validate` and `claude plugin details`;
   - `codex debug prompt-input` and `codex plugin`;
   - `agy plugin validate`;
   - `grok inspect` and `grok plugin validate`, `grok plugin details`.
4. **The imports DS1 deferred, run in the scratch `HOME`** against `plugins/mirror-mind`:
   - `agy plugin import claude`;
   - `grok plugin install <path>`;
   - Codex's plugin or marketplace route, if it accepts the Claude format.

   Each records what survives: skills, hooks, MCP, instructions.
5. **Live probes, run by the Navigator** when the Driver hands them over during
   implementation, because TS6 depends on their results. Each is one session of at most
   two turns, per runtime. A probe hook injects a unique canary line, and the prompt asks
   the model to quote any canary in its context. The two turns separate injection at
   session start from injection on every turn. The same session records which hooks
   fired, the session identity and transcript a hook receives, and whether `mm-*` skills
   and the MCP server are reachable. TS1's session also covers DS2.TS4: Mirror Mode
   reached through the plugin.
6. **Per-runtime findings.** Each of TS1–TS4 authors its `index.md`: the story statement,
   an outcome, and a Findings table with claim, command, version, binary, date, and
   result.
7. **TS3 also sets the successor bar**: what Antigravity must give a Gemini CLI user
   before DS8 removes Gemini CLI, and what the cutoff must say about the difference.
8. **TS5** reads the TypeScript extension contract and catalog code. It installs the
   `review-copy` reference extension into the scratch home and states, per runtime, how
   a user-owned extension reaches it today, or that it does not.
9. **TS6** writes one decision record:
   - convergence confirmed or revised;
   - a parity matrix with level, mechanism, version, binary, and date per runtime;
   - the successor bar;
   - the extension path.

   It also reshapes the CV21 index: DS2's remainder and DS4–DS11 confirmed, reshaped,
   merged, or dropped, each with the finding that decides it.

## Non-Goals

- No runtime integration: no hooks, wrappers, plugin changes, or `interface` labels.
  Those belong to DS2, DS4, DS5, DS7, and DS10.
- No change to anything that ships (`plugins/`, `scripts/`, `ts/src/`, `AGENTS.md`).
  Probes run on copies.
- No Gemini CLI removal (DS8), and no runtime-facing docs refresh (DS11). Errors found
  in shipped docs become findings for those stories.
- No marketplace publication of the plugin.
- No product bug fixed in place. A defect a probe uncovers is captured as a Change
  Request for triage.
- No release. DS12 ships nothing; its release intent is the Navigator's to record.

## Acceptance Behavior

```text
Given Claude Code, Codex, Antigravity, and Grok Build installed on the Navigator's machine
When DS12 closes
Then each runtime's findings state its hook events, injection at session start and per
  turn, session identity, skill discovery, instructions file, MCP configuration, and
  plugin consumption
And every finding names the command that measured it, the version, the binary path,
  and the date
And the imports DS1 deferred have run, with what survived each recorded

Given the findings
When the Navigator reads the decision record
Then it states each runtime's honest parity level with the mechanism behind it
And it states the bar DS7 must reach before DS8 removes Gemini CLI
And DS2's remainder and DS4–DS11 each read confirmed, reshaped, merged, or dropped,
  with the finding that decided it

Given the probes have run
When the route's untouched step compares the real runtime configs with their baseline
Then no settings, hooks, plugins, skills, or MCP configuration file changed
And no real Mirror home holds a canary line or a scratch session
```

## Validation Route

E2E is required, and it is the live probes: real runtimes, real sessions, run by the
Navigator.

- **During implementation**, the Driver runs every static step. Then the Driver hands
  over `bash route.sh live-<runtime>` for each runtime, one short session each, and
  records what the Navigator saw.
- **At Validation**, the Navigator:
  1. reads the decision record and the parity matrix;
  2. runs `bash route.sh verify`, which re-checks the installed versions against the
     recorded ones and re-runs the cheap static claims, flagging any drift;
  3. runs `bash route.sh untouched`;
  4. runs `bash route.sh clean`, which removes the scratch directory, including any
     login made in it.

The full route, with expected observations and pass and fail conditions, is in
[test-guide.md](test-guide.md).

## Implementation Contract

- **The evidence rule binds every finding:** version, binary path, date, and the
  command that measured it. A claim without them is not a finding.
- **Isolation.**
  - Driver steps run only in the scratch `HOME`, npm prefix, and Mirror home.
  - Real credentials are never copied.
  - Where a live probe needs a login, the Navigator either logs in inside the scratch
    `HOME` or uses a session-scoped flag that writes no config, such as Claude Code's
    `--plugin-dir`.
  - Scratch directories are `700`, and `clean` deletes them.
- **Cost.**
  - The scratch Mirror home has no provider key, so Mirror cannot spend.
  - `PI_SESSIONS_DIR` points at an empty directory, so no Pi history is imported
    (CR106's lesson).
  - The Driver makes no model calls. The Navigator's live steps use at most two turns
    per runtime, eight in total.
- **Untouched, proven.** Before any probe, the route records checksums of the real
  runtime config files. `untouched` compares them, and searches the real Mirror homes
  for the canary.
- **No TDD for product code**, because DS12 changes none. The route is tested by
  running it: `bash -n`, and every Driver step run end to end before hand-over.
- **Scope discipline.** A finding that calls for product work becomes a reshaped
  Delivery Story row or a Change Request, never an edit in DS12.
- **Commits.** Small and DS12-scoped: the route, each runtime's findings, the
  extension re-grounding, the decision. Nothing is pushed or released.

## Stop Conditions

- A probe that can only run by changing a real runtime config: stop and ask.
- A runtime that refuses to run isolated, even after a login inside the scratch
  `HOME`: record it as not measurable in isolation, and ask.
- A live probe that needs more than its two turns: ask before spending.
- An installed version that changes mid-story: re-run that runtime's static steps,
  and record both readings.

## Delivery Sequence

1. Route skeleton: scratch install, scratch homes, and the real-config checksum
   baseline (`route.sh setup`).
2. TS1–TS4 static steps and the deferred imports, with findings drafted under the
   evidence rule.
3. TS5 extension re-grounding.
4. The live steps written, checked with `bash -n`, and handed to the Navigator; their
   results recorded in TS1–TS4.
5. TS6: the decision record and the reshaped CV21 index.
6. The DS12 test guide's evidence, then Navigator Validation.

---

_Approval and lifecycle state are tracked by the Builder runtime, not duplicated in this plan._
