[< CV21.DS2 Mirror Plugin & MCP Foundation](../index.md)

# CV21.DS2.US7 — Mirror Mode's explicit form works from every runtime's skill syntax

**Status:** ✅ Done
**Type:** User Story
**Delivery Story:** CV21.DS2 — Mirror Plugin & MCP Foundation

---

## User Story

As a person who invokes the Mirror skill by name in Claude Code, Codex, or Grok,
I want the inject hook to recognize the skill however my runtime spells it,
So that an explicit Mirror turn gets its session-aware activation and its context from
the hook, in every runtime, and not only in the standalone Claude wiring.

## Outcome

One grammar, in `ts/src/hooks/mirrorForm.ts`, recognizes the explicit form at the start
of a prompt in every runtime's spelling, and the inject hook loads context for the
query that follows it. The grammar is shared with the prompt logger (US8), which records
a Mirror turn's question without its form.

The forms, and where DS12 measured them:

| Form | Runtime |
|------|---------|
| `/mm:mirror` | standalone Claude Code |
| `/mirror-mind:mm-mirror` | the Claude Code plugin (TS1 L4) |
| `/mirror-mind:mm:mirror` | Claude Code's menu (TS1 static 6) |
| `$mirror-mind:mm:mirror` | the Codex plugin (TS2 L10) |
| `/mm-mirror` | Grok (TS4 L5) |
| `$mm-mirror` | Codex's own skill form |

The grammar is the product of the three choices a runtime makes, so the other two
combinations (`$mirror-mind:mm-mirror`, `$mm:mirror`) are recognized as well. A longer
skill name (`/mm-mirrors`), another skill, a form in the middle of a sentence, or an
upper-case spelling is not.

## Acceptance Behavior

```text
Given a prompt that opens with any of the six forms
When the inject hook receives it in a fresh session
Then it loads Mirror context for the rest of the prompt and returns that context

Given a prompt that opens with a longer skill name, another skill, or mentions the
  form elsewhere
When the inject hook receives it in a fresh session
Then it returns nothing
```

## Scope

- `ts/src/hooks/mirrorForm.ts`, and its use in `claudeInject`.
- The `mm-mirror` Claude skill's hook note, and the plugin copy generated from it.

## Out Of Scope

- Grok: the form is recognized, but Grok discards UserPromptSubmit context (DS12.TS4
  L3), so Mirror Mode there still comes from the skill.
- Dropping one of the two identity loads an explicit turn pays (the hook's and the
  skill's): DS4's.

## Evidence

| # | Finding | How it was measured | Result |
|---|---------|---------------------|--------|
| 1 | The grammar recognizes the six forms and the two other combinations, strips the form, and refuses thirteen look-alikes | `node --test ts/test/hooks/mirrorForm.test.ts` | ✓ 26 pass |
| 2 | Through the real wrapper, each form in a fresh session returns context, and a longer name, a mention, or another skill returns nothing | `node --test ts/test/hooks/injectForms.test.ts`, against a scratch Mirror home | ✓ 7 pass |

Before this story, DS12.TS1 static 6: `/mm:mirror` returned 7,067 bytes, and
`/mirror-mind:mm:mirror` returned 0.

## Validation

`bash route.sh static` feeds the plugin's inject wrapper each form from a copy outside
the tree, against the scratch Mirror home, and prints the bytes of context out.
