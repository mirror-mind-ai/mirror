[< Story](index.md)

# Cutoff — the v0.32.1 Codex wiring

**Story:** CV21.DS4.TS5 · recorded at Done, 2026-10-17, for the next release
note to carry (the plan assigned this record to Done so the cutoff is not
lost between the removal and the release).

A cutoff answers three things for a user: **what no longer exists**, **what to
do instead**, and **what still works if they do nothing**.

**Removed.** The Codex wrapper wiring v0.32.1 shipped: `scripts/codex-mirror.sh`
(the script that wrapped the `codex` command), `scripts/codex-hooks/` (its two
generated hook wrappers), the `codex:session-start` / `codex:session-end` hook
entries, and `mirror conversation-logger backfill-codex-session`, the JSONL
import the wrapper drove at exit. None of them ships in the package or exists
in the tree.

**Why.** CV21.DS4.US4 measured Codex at **L4 through the shipped plugin**,
live, on Codex 0.163.0: skills, Operating Instructions, per-turn injection,
logging with replies, MCP tools. The plugin logs Codex turns as they happen,
so nothing re-imports the transcript at exit — the backfill's only caller was
the wrapper, and the plugin's SessionEnd closes the session without reading
it, which is the condition the Delivery Story set for keeping it.

**What to do instead.** Install the plugin:
`codex plugin marketplace add "<pkg>"`, then
`codex plugin add mirror-mind@mirror-mind`, and start `codex` directly. If you
wired Codex before the plugin (a skills link, an `AGENTS.md` link, the wrapper
around each session), undo those three — Getting Started's Codex section has
the exact steps.

**What still works if you do nothing.** Everything, with one seam: an older
installed package keeps its own copy of the wrapper, and running `codex`
through it beside the plugin logs each turn twice — the double-logging
Getting Started already warned about. Sessions, memories, and the database
are untouched; `session-end-pi`, `backfill-pi-sessions`, and
`backfill-assistant-messages` are different features and stay.
