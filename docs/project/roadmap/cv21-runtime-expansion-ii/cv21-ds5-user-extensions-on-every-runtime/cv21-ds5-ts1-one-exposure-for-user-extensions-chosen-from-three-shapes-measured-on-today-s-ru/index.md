[< CV21.DS5 User Extensions On Every Runtime](../index.md)

# CV21.DS5.TS1 — One exposure for user extensions, chosen from three shapes measured on today's runtimes

**Status:** ✅ Done — 2026-10-19
**Type:** Technical Story (spike)
**Delivery Story:** CV21.DS5 — User Extensions On Every Runtime

---

## Technical Story

In order to give US2 one design to build, rather than three to argue about,
as the Driver of DS5,
I want each of DS12.TS5's three shapes measured on the installed Claude Code, Codex,
agy, and Grok, in scratch homes and with no change to the product,
so that the design user extensions take to every runtime is chosen on what those
runtimes do today, with the price of each shape known before anything is built.

## Outcome

**Done 2026-10-19: (b), the per-home generated plugin**, on claude 2.1.296, codex
0.163.0, agy 1.4.2, and grok 1.0.62, package 0.35.0. (b) is listed and found on all
four; (c) attaches everywhere and reaches no model; (a) is three roots, none reaching
all four, each shared by every home. The decision, the table, and the price per
runtime are in [decisions.md](../../../../decisions.md#user-extensions-reach-every-runtime-as-a-per-home-plugin);
the CV21 index no longer says the shared package carries extensions. Carried out:
CR144 (the DS7 routes remove agy's credential at 1.3.x's location); Claude Code's
login facts for TS4; the disk-search behaviour for US2. The route re-runs from this
package.

As planned, decisions.md records which shape user extensions take to Claude Code, Codex,
Antigravity, and Grok, and why, with the measurements behind it: for each runtime and
each shape, whether the runtime lists a projected extension skill, by which reader, at
which version, binary, and date, and what the shape costs on refresh, on two homes on
one machine, and on the manifests already installed. The shapes not chosen are
recorded with the measurement that ruled them out. CV21's Product Outcome and Done
Condition no longer say that the shared package carries extensions. US2 starts from
one design and a probe route it can re-run.

## Acceptance Behavior

```text
Given review-copy installed into a scratch Mirror home from the shipped package
      and each of Claude Code, Codex, agy, and Grok run with a scratch HOME
When shape (a) is tried: the review-copy skill placed in ~/.claude/skills/,
     ~/.agents/skills/, and ~/.gemini/config/skills/, one root at a time
Then for each runtime and each root the record says listed or not listed,
     read by the runtime's own reader and not by the file's presence,
     and for Grok with the skill in two roots at once, whether it is listed twice

Given the same scratch homes
When shape (b) is tried: a per-home plugin in the canonical plugin's format,
     carrying the review-copy skill, installed the way each runtime takes the
     canonical plugin
Then for each runtime the record says whether the skill is listed,
     and for each runtime that installs a copy, what a changed skill costs to refresh

Given the same scratch homes and a probe MCP server that serves one prompt
When shape (c) is tried: the server registered the way each runtime takes the
     canonical plugin's server
Then for each runtime the record says whether the prompt is offered to the user,
     under what name, and whether the model can find it when asked for the
     extension by name, in at most one headless turn per runtime

Given the three records
When the decision rule stated in plan.md is applied
Then one shape is chosen, or the rule says why none qualifies and what US2 needs,
     and decisions.md carries the choice, the table, and the shapes not chosen

Given the real ~/.claude, ~/.codex, ~/.gemini, ~/.grok, and ~/.agents
When the route has run
Then they hash as they did before it started
```

## Scope

- The probe route `route.sh` beside this file: `setup`, `probe`, `shape-a`, `shape-b`,
  `shape-c`, `static`, `untouched`, `clean`, and one optional headless turn per runtime
  for the model-finding question in (c).
- `probe-mcp.mjs`: a test fixture after DS10.TS2's `control-mcp.mjs`, serving one
  prompt and nothing else.
- The decision entry in `docs/project/decisions.md`.
- Two sentences in `docs/project/roadmap/cv21-runtime-expansion-ii/index.md`: the
  Product Outcome's "riding the same plugin/MCP package" and the Done Condition's "via
  the shared package", corrected to what TS5 found and this story decided.
- The evidence summary in `test-guide.md`, with version, binary, and date per runtime.

## Out Of Scope

- Any product change: `mirror extensions install`, `expose-claude`, the manifest's
  runtime blocks, `mirror init`, `runtime diagnose`, `mirror mcp`'s capabilities, and
  the plugin builder stay as they are. US2 builds the chosen shape.
- `review-copy` running end to end, on any runtime (US3); the docs that tell a user
  how extensions reach each runtime (TS4); the parity matrix (DS11).
- Extensions other than `review-copy` and one hand-made `command-skill` stand-in. The
  thirteen manifests on the maintainer's home are read for their `runtimes:` keys only.

## Validation

Driver: the route's static checks, `checkDocLinks`, and the two package smokes, green.
Navigator: `route.sh probe`, `shape-a`, `shape-b`, `shape-c`, the headless turns, and
`untouched`, with the decision rule applied to the table they print; details in
[test-guide.md](test-guide.md).
