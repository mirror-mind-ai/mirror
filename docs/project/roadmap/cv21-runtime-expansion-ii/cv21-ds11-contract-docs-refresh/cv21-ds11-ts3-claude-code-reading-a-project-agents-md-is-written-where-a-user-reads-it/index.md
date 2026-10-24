[< Parent](../index.md)

# CV21.DS11.TS3 — Claude Code reading a project `AGENTS.md` is written where a user reads it

**Status:** 🟢 Implemented — awaiting DS11's aggregate Navigator validation
**Type:** Technical Story
**Delivery Story:** CV21.DS11 — Contract & Docs Refresh

---

## Technical Story

In order to tell a Claude Code user what happens to their project's own `AGENTS.md`
beside Mirror's Operating Instructions,
As the engineering team,
I want DS12.TS1 L8 re-checked on the installed Claude Code, read from the transcript
rather than the model's answer, and written in the contract and Getting Started,
So that a user knows whether their file is read and whether anything needs merging,
and this repository knows how many copies of its instructions a checkout carries.

## Outcome

Measured on Claude Code 2.1.310 (`~/.local/share/claude/versions/2.1.310`), 2026-10-24,
model `claude-haiku-5-5`, one headless turn per case, in the route's scratch config
directory. Read from the API request blobs Claude Code 2.1.310 records in each session's
transcript, which show what reached the model:

| Case | User blob (project instructions) | System blob | Mirror's instructions |
|---|---|---|---|
| (a) a project with only `AGENTS.md` (a canary), the plugin wired | `AGENTS.md`, the canary once | the plugin hook's context | 1 copy, from the hook |
| (a′) the same, beside a `CLAUDE.md` that does not import it | `CLAUDE.md` only; the canary absent | the plugin hook's context | 1 copy, from the hook |
| (b) a worktree of this checkout, the plugin unwired | `CLAUDE.md` and the imported `AGENTS.md` | no hook context | 1 copy, from the import; 28,443 input tokens |
| (b′) the same, the `@AGENTS.md` line removed | `CLAUDE.md` only | no hook context | none; 25,033 input tokens |

So DS12.TS1 L8 holds only for a project with no `CLAUDE.md`: Claude Code reads
`AGENTS.md` by itself then, and beside a `CLAUDE.md` only through `@AGENTS.md`. Where
both reach the model, the project's file arrives among the project instructions and
Mirror's in the system prompt, one copy each. In the checkout the tree's hooks ran
(each session logged as `claude_code` in the scratch home) and delivered no context,
so the import is the only carrier: it is **not** redundant, and the instructions cost
3,410 input tokens (stop condition 2 not reached). The model's answers, kept as
observations, matched the blobs: in (a′) it said it had not read `AGENTS.md`.

Written: the contract's `### Claude Code` section (both facts, version and date, no
precedence claimed) and Getting Started's Claude Code section (a project with a
`CLAUDE.md` adds `@AGENTS.md`; Mirror's instructions arrive beside it; nothing to
merge). The package `AGENTS.md` header, which says Claude Code reads the file "through
the `@AGENTS.md` import in `CLAUDE.md`", was checked against (b) and stands; it is not
edited, so no session pays for a longer header.

## Acceptance Behavior

```text
Given a Claude Code user whose project carries its own AGENTS.md, the plugin wired
When they read the contract's Claude Code section or Getting Started
Then they learn when Claude Code reads that file, how to have it read beside a
     CLAUDE.md, and that Mirror's instructions reach the model beside it
And the docs claim nothing the transcripts do not show
```

## Scope

- The four cases, the contract, Getting Started.

## Out Of Scope

- Removing or changing `CLAUDE.md`'s import; re-measuring parity.

## Validation

The route: `route.sh agents-md`, `route.sh agents-md beside-claude-md`,
`route.sh checkout` (DS11 test guide, step 3).
