[< Story](index.md)

# Plan — CV21.E2.S1b Claude skill parity

## Design

Author Claude-tuned versions of the four Pi-only skills into `.claude/skills/`,
then regenerate the plugin (S1's generator picks them up → 25 skills). This is a
faithful runtime re-tuning of existing skill behavior, not new product behavior.

### The `.pi` → `.claude` tuning rules (derived from existing pairs)

A diff of skills that exist on both surfaces (`mm-mirror`, `mm-new`, `mm-help`,
`mm-build`) yields the consistent transformation:

1. Frontmatter `name: "mm-X"` → `name: "mm:X"`; keep `description` and
   `user-invocable: true`.
2. `/mm-X` invocation tokens → `/mm:X`.
3. Usage section: Claude-only (`/mm:X`); drop the Pi/Gemini/Codex multi-runtime
   listing.
4. `uv run python -m memory ...` command bodies stay identical (shared CLI).
5. English only — the existing `.claude` skills carry no Portuguese examples, so
   translate the Pi natural-language triggers to English.
6. Replace Pi runtime notes with Claude semantics (session ids are hook-owned;
   logging/backfill is transcript-based).

### Per-skill notes

- **`mm:update`** — runtime-agnostic; calls `memory runtime update`. Pure token +
  usage + frontmatter tuning. Lowest risk.
- **`mm:explore`** — mode skill calling `memory explore ...`. Token/usage tuning
  + English triggers. The surface-rendering contract and Explorer→Builder
  boundary copy carry over unchanged (they are runtime-agnostic).
- **`mm:soul`** — mode skill calling `memory soul ...`. Token/usage/English. The
  one Pi-specific line — "Use `--session-id` when a Pi session id is available"
  on `soul fruit set` — becomes a Claude note that session ids are hook-owned, so
  the skill does not fabricate one.
- **`mm:discard`** — the only skill with runtime-specific mechanics.
  `discard_current_conversation(interface="pi")` is parameterized; the dispatch
  accepts `--interface`. The Claude skill uses
  `conversation-logger discard-current --interface claude_code`, which resolves
  the active Claude runtime session and marks it discarded so transcript backfill
  skips it. User-facing copy becomes English; the exit instruction stays generic
  (no assumed slash command).

## Implementation steps

1. Author the four `.claude/skills/mm-{update,explore,soul,discard}/SKILL.md`
   files per the rules above.
2. Regenerate: `uv run python scripts/build_claude_plugin.py` → 25 plugin skills.
3. Run the plugin tests: the drift guard and the "plugin skill set ==
   `.claude/skills/` set" test now pass at 25 (no hardcoded count to change).
4. `claude plugin validate plugins/mirror-mind`.
5. Run the smoke test; confirm production DB unchanged.

## Design decisions (to confirm at the plan checkpoint)

1. **`mm:discard` interface:** use `--interface claude_code` (resolves the active
   Claude session). Recommended.
2. **`mm:soul` session id:** drop the Pi `--session-id` guidance; note that
   session routing is hook-owned in Claude Code. Recommended.
3. **Language:** English-only copy, translating Pi's Portuguese triggers, to match
   the existing `.claude` house style. Recommended.
4. **Usage block:** Claude-only `/mm:X`, dropping the multi-runtime listing, to
   match existing `.claude` skills. Recommended.

## Risks

- **Behavioral drift from the Pi source.** The skills must preserve behavior, not
  redesign it. Mitigation: transform mechanically; change only runtime-specific
  lines.
- **Soul/Explorer contract surfaces.** Both carry required-surface-rendering and
  Builder-boundary contracts. These are runtime-agnostic and must carry over
  verbatim (only tokens/English change), or Claude users lose the contract.
- **Scope creep.** No edits to the 21 existing skills, no core changes.

## Verification

See [test-guide.md](test-guide.md). Automated: plugin tests (drift guard + skill
set == 25), ruff/format/mypy unaffected (no Python change beyond regenerated
artifacts), `claude plugin validate`, smoke test.
