[< CV21.E2](../index.md)

# CV21.E2.S1b — Claude skill parity

**Status:** ✅ Done
**Type:** Implementation
**User-visible outcome:** The four Pi-only skills (`discard`, `explore`, `soul`, `update`) gain Claude-tuned versions, so the canonical plugin reaches full 25-skill parity with the Pi runtime and Claude users can invoke every Mirror skill.

---

## Context

S1 established the plugin and generated its `skills/` from `.claude/skills/` (the
Claude-tuned source). The Claude skill set was at 21 because four Pi skills had
no Claude-tuned form. This story authors those four as Claude skills, which is
content work — not the mechanical packaging S1 deliberately kept separate.

Authoring happens in `.claude/skills/` (the generator's source). Unlike S1, this
story **does** add to standalone `.claude/` — additively, the deliberate parity
fix — and also closes the standalone's own gap.

---

## Scope

- Author four Claude-tuned skills from their Pi sources:
  - `.claude/skills/mm-discard/SKILL.md`
  - `.claude/skills/mm-explore/SKILL.md`
  - `.claude/skills/mm-soul/SKILL.md`
  - `.claude/skills/mm-update/SKILL.md`
- Apply the established `.pi` → `.claude` tuning: `mm:` tokens, Claude-only
  usage, English-only copy, and Claude runtime semantics (e.g.
  `discard-current --interface claude_code`; session ids are hook-owned).
- Regenerate the plugin so it carries all 25 skills; keep the drift guard green.

---

## Non-goals

- No change to the 21 existing skills (Pi or Claude).
- No new behavior in the `memory` core, no new CLI commands.
- No MCP, no `statusLine`.
- No Pi skill changes.

---

## Acceptance Criteria

- Four Claude-tuned `SKILL.md` files exist under `.claude/skills/`, English-only,
  using `mm:` invocation and Claude runtime semantics.
- `discard` uses `--interface claude_code`; `soul`/`explore` carry no Pi-specific
  session-id or multi-runtime instructions.
- Regenerating yields 25 plugin skills; the drift guard
  (`build_claude_plugin.py --check`) is green.
- `claude plugin validate plugins/mirror-mind` passes; the plugin skill set
  equals the `.claude/skills/` set (25).
- The smoke test still passes; production DB unchanged.

---

## See also

- [Plan](plan.md)
- [Test Guide](test-guide.md)
