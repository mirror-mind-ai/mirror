# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
- One home for the rule (decision 2): `ts/src/hooks/gemini.ts` imports
  `isCommandTurn` in place of its own `startsWith("/")`, changing no Gemini behavior
  today (no `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
 sigil) and leaving the rule one place for every hook that runs in our
  process. The Pi extension keeps its copy: a separate process, Pi's file; named here
  as the one remaining copy.

**2. Tests, first.**

- `ts/test/conversation/commandTurn.test.ts`: the table above with its edges (decision
  3), both sigils, the non-skill `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
- One home for the rule (decision 2): `ts/src/hooks/gemini.ts` imports
  `isCommandTurn` in place of its own `startsWith("/")`, changing no Gemini behavior
  today (no `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
 sigil) and leaving the rule one place for every hook that runs in our
  process. The Pi extension keeps its copy: a separate process, Pi's file; named here
  as the one remaining copy.

**2. Tests, first.**

 prompts, the boundary at whitespace, newline, and
  end, the comma, the uppercase, the trailing colon, the leading space, the
  underscore; and the relation test, every `mirrorForm` form a command turn.
- `ts/test/conversation/logger-hooks.test.ts`: on a `codex`-labelled session,
  `$mirror-mind:mm:journeys` is skipped with the turn recorded, and the Stop hook then
  skips its reply as `command_turn`; both `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
- One home for the rule (decision 2): `ts/src/hooks/gemini.ts` imports
  `isCommandTurn` in place of its own `startsWith("/")`, changing no Gemini behavior
  today (no `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
 sigil) and leaving the rule one place for every hook that runs in our
  process. The Pi extension keeps its copy: a separate process, Pi's file; named here
  as the one remaining copy.

**2. Tests, first.**

 Mirror forms, `$mm-mirror what matters`
  and `$mirror-mind:mm:mirror what matters`, log the question; on a `claude_code`
  session, `$5 a month seems fine` is logged; the existing `/`-command tests (two,
  one in `replyLogging.test.ts`) keep their behavior under the new reason; and the
  Stop side without a turn id is pinned as unchanged: a prompt skipped with no turn
  id records nothing, and a Stop that then carries one reaches `nothing_waiting`, as
  `/` does today.

**3. Docs.**

- `docs/product/specs/runtime-interface/index.md` "User Prompt": the skip rule names
  both sigils and the grammar, and the Mirror exception in both.
- `docs/project/decisions.md`: "A skill turn is a command turn in every runtime's
  sigil", leading with memory quality (decision 4): on Codex today a `$mm-journeys`
  and its rendered journey list land in the conversation as user and assistant
  turns, and extraction reads a roadmap table as if the person said it; skill
  renderings are noise to extraction. Then the counter-case and why it was not
  taken, what a Codex user loses (the accidental logging of `$mm-journal` and
  `$mm-consult` turns; the journal skill records its entry itself), and the sentence
  a user can learn: what you say to the mirror is remembered, a skill you invoke is
  not. No user-facing doc describes the skip today (REFERENCE and Getting Started
  checked), so the spec and the decision are its homes.
- The DS4 index row for TS3.

**4. The story package.** `route.sh static`, on the pattern of TS2's: the plugin's real
wrappers and this tree's entry against a scratch home, a `codex` session with a
`$`-skill turn and its reply (neither logged, no `hooks.log` line), a `$mm-mirror`
turn (logged as its question), and a `claude_code` session with a `$5 …` prompt
(logged). No model: the prompt and Stop hooks make no LLM call.

## Non-Goals

- Changing what the inject hook does with a `$`-skill turn: it already recognizes
  only the Mirror form (US7) and injects nothing for other skills.
- Gemini CLI's and Pi's copies of the `/` rule (no `$` sigil there).
- Observing the rule on the real Codex: US4's live session, which follows.
- Logging a skill turn's reply for any skill: US8 decided a command turn's reply is
  not recorded; this story extends that rule to a second sigil, it does not reopen it.
- TS5, TS6.

## Acceptance Behavior

```text
Given a session labelled codex
When the prompt hook receives "$mirror-mind:mm:journeys" and then the Stop hook its reply
Then neither is logged, the prompt hook's outcome is command_turn,
     the Stop hook's skip is command_turn, and hooks.log gains no line

Given a session labelled codex
When the prompt hook receives "$mm-mirror what matters today"
Then "what matters today" is logged as the conversation turn, as today

Given a session labelled claude_code
When the prompt hook receives "$5 a month seems fine"
Then the prompt is logged as a conversation turn

Given any session
When the prompt hook receives a prompt opening with "/"
Then it is skipped as a command turn, as today
```

## Validation Route

**Automated (Driver).** `npm run typecheck`, `npm run lint`, `npm test`,
`node ts/scripts/checkDocLinks.ts`. The new tests fail on the tree before the change.

**Navigator — `bash route.sh static`** from this package: the real wrappers and this
tree's entry (pinned and printed, as TS2's route does), a scratch home. Step 1: a
`codex` session, `$mirror-mind:mm:journeys` then a reply through the Stop wrapper —
expected zero messages for the session and no `hooks.log` line. Step 2: the same
session, `$mm-mirror what matters today` — expected one user message, `what matters
today`. Step 3: a `claude_code` session, `$5 a month seems fine` — expected one user
message, the prompt as typed. Fail: any message where none is expected, a `hooks.log`
line, or the Mirror question lost.

**E2E decision:** required, and the route is it: real wrappers, real entry, real
database, no model needed. The real Codex is US4's.

## Implementation Contract

- Tests first (Scope 2); then the change makes them pass.
- Keep changes scoped to `CV21.DS4.TS3`: `commandTurn.ts` (new), `logger.ts`,
  `hooks/gemini.ts`, their tests, the two docs, and this package.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- Evidence that Codex sends a skill turn to the hook in some form other than the
  `$`-prefixed prompt text (DS12.TS2 L10 saw the text; US4 may see otherwise).
- scope_change_detected, plan_rule_conflict, failing_required_check_without_clear_fix,
  navigator_decision_needed.

## Decisions Taken At Approval

Recorded on 2026-10-17, after the plan review by the engineer, quality-assurance,
ai-engineer, security-engineer, and product-designer lenses.

1. **The relation and the asymmetry are pinned.** A test holds every `mirrorForm`
   form to be a command turn; the predicate's comment explains why `/` skips anything
   and `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
- One home for the rule (decision 2): `ts/src/hooks/gemini.ts` imports
  `isCommandTurn` in place of its own `startsWith("/")`, changing no Gemini behavior
  today (no `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
 sigil) and leaving the rule one place for every hook that runs in our
  process. The Pi extension keeps its copy: a separate process, Pi's file; named here
  as the one remaining copy.

**2. Tests, first.**

- `ts/test/conversation/commandTurn.test.ts`: the table above with its edges (decision
  3), both sigils, the non-skill `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
- One home for the rule (decision 2): `ts/src/hooks/gemini.ts` imports
  `isCommandTurn` in place of its own `startsWith("/")`, changing no Gemini behavior
  today (no `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
 sigil) and leaving the rule one place for every hook that runs in our
  process. The Pi extension keeps its copy: a separate process, Pi's file; named here
  as the one remaining copy.

**2. Tests, first.**

 prompts, the boundary at whitespace, newline, and
  end, the comma, the uppercase, the trailing colon, the leading space, the
  underscore; and the relation test, every `mirrorForm` form a command turn.
- `ts/test/conversation/logger-hooks.test.ts`: on a `codex`-labelled session,
  `$mirror-mind:mm:journeys` is skipped with the turn recorded, and the Stop hook then
  skips its reply as `command_turn`; both `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
- One home for the rule (decision 2): `ts/src/hooks/gemini.ts` imports
  `isCommandTurn` in place of its own `startsWith("/")`, changing no Gemini behavior
  today (no `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
 sigil) and leaving the rule one place for every hook that runs in our
  process. The Pi extension keeps its copy: a separate process, Pi's file; named here
  as the one remaining copy.

**2. Tests, first.**

 Mirror forms, `$mm-mirror what matters`
  and `$mirror-mind:mm:mirror what matters`, log the question; on a `claude_code`
  session, `$5 a month seems fine` is logged; the existing `/`-command tests (two,
  one in `replyLogging.test.ts`) keep their behavior under the new reason; and the
  Stop side without a turn id is pinned as unchanged: a prompt skipped with no turn
  id records nothing, and a Stop that then carries one reaches `nothing_waiting`, as
  `/` does today.

**3. Docs.**

- `docs/product/specs/runtime-interface/index.md` "User Prompt": the skip rule names
  both sigils and the grammar, and the Mirror exception in both.
- `docs/project/decisions.md`: "A skill turn is a command turn in every runtime's
  sigil", leading with memory quality (decision 4): on Codex today a `$mm-journeys`
  and its rendered journey list land in the conversation as user and assistant
  turns, and extraction reads a roadmap table as if the person said it; skill
  renderings are noise to extraction. Then the counter-case and why it was not
  taken, what a Codex user loses (the accidental logging of `$mm-journal` and
  `$mm-consult` turns; the journal skill records its entry itself), and the sentence
  a user can learn: what you say to the mirror is remembered, a skill you invoke is
  not. No user-facing doc describes the skip today (REFERENCE and Getting Started
  checked), so the spec and the decision are its homes.
- The DS4 index row for TS3.

**4. The story package.** `route.sh static`, on the pattern of TS2's: the plugin's real
wrappers and this tree's entry against a scratch home, a `codex` session with a
`$`-skill turn and its reply (neither logged, no `hooks.log` line), a `$mm-mirror`
turn (logged as its question), and a `claude_code` session with a `$5 …` prompt
(logged). No model: the prompt and Stop hooks make no LLM call.

## Non-Goals

- Changing what the inject hook does with a `$`-skill turn: it already recognizes
  only the Mirror form (US7) and injects nothing for other skills.
- Gemini CLI's and Pi's copies of the `/` rule (no `$` sigil there).
- Observing the rule on the real Codex: US4's live session, which follows.
- Logging a skill turn's reply for any skill: US8 decided a command turn's reply is
  not recorded; this story extends that rule to a second sigil, it does not reopen it.
- TS5, TS6.

## Acceptance Behavior

```text
Given a session labelled codex
When the prompt hook receives "$mirror-mind:mm:journeys" and then the Stop hook its reply
Then neither is logged, the prompt hook's outcome is command_turn,
     the Stop hook's skip is command_turn, and hooks.log gains no line

Given a session labelled codex
When the prompt hook receives "$mm-mirror what matters today"
Then "what matters today" is logged as the conversation turn, as today

Given a session labelled claude_code
When the prompt hook receives "$5 a month seems fine"
Then the prompt is logged as a conversation turn

Given any session
When the prompt hook receives a prompt opening with "/"
Then it is skipped as a command turn, as today
```

## Validation Route

**Automated (Driver).** `npm run typecheck`, `npm run lint`, `npm test`,
`node ts/scripts/checkDocLinks.ts`. The new tests fail on the tree before the change.

**Navigator — `bash route.sh static`** from this package: the real wrappers and this
tree's entry (pinned and printed, as TS2's route does), a scratch home. Step 1: a
`codex` session, `$mirror-mind:mm:journeys` then a reply through the Stop wrapper —
expected zero messages for the session and no `hooks.log` line. Step 2: the same
session, `$mm-mirror what matters today` — expected one user message, `what matters
today`. Step 3: a `claude_code` session, `$5 a month seems fine` — expected one user
message, the prompt as typed. Fail: any message where none is expected, a `hooks.log`
line, or the Mirror question lost.

**E2E decision:** required, and the route is it: real wrappers, real entry, real
database, no model needed. The real Codex is US4's.

## Implementation Contract

- Tests first (Scope 2); then the change makes them pass.
- Keep changes scoped to `CV21.DS4.TS3`: `commandTurn.ts` (new), `logger.ts`,
  `hooks/gemini.ts`, their tests, the two docs, and this package.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- Evidence that Codex sends a skill turn to the hook in some form other than the
  `$`-prefixed prompt text (DS12.TS2 L10 saw the text; US4 may see otherwise).
- scope_change_detected, plan_rule_conflict, failing_required_check_without_clear_fix,
  navigator_decision_needed.

 skips only a skill name. The shared-grammar refactor was not taken: wrong
   layering direction.
2. **One home for the rule.** `gemini.ts` imports `isCommandTurn`; the Pi extension is
   the one named remaining copy.
3. **Grammar and edges.** Underscore admitted after the first character; the edge
   table pinned; both `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
- One home for the rule (decision 2): `ts/src/hooks/gemini.ts` imports
  `isCommandTurn` in place of its own `startsWith("/")`, changing no Gemini behavior
  today (no `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
 sigil) and leaving the rule one place for every hook that runs in our
  process. The Pi extension keeps its copy: a separate process, Pi's file; named here
  as the one remaining copy.

**2. Tests, first.**

- `ts/test/conversation/commandTurn.test.ts`: the table above with its edges (decision
  3), both sigils, the non-skill `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
- One home for the rule (decision 2): `ts/src/hooks/gemini.ts` imports
  `isCommandTurn` in place of its own `startsWith("/")`, changing no Gemini behavior
  today (no `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
 sigil) and leaving the rule one place for every hook that runs in our
  process. The Pi extension keeps its copy: a separate process, Pi's file; named here
  as the one remaining copy.

**2. Tests, first.**

 prompts, the boundary at whitespace, newline, and
  end, the comma, the uppercase, the trailing colon, the leading space, the
  underscore; and the relation test, every `mirrorForm` form a command turn.
- `ts/test/conversation/logger-hooks.test.ts`: on a `codex`-labelled session,
  `$mirror-mind:mm:journeys` is skipped with the turn recorded, and the Stop hook then
  skips its reply as `command_turn`; both `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
- One home for the rule (decision 2): `ts/src/hooks/gemini.ts` imports
  `isCommandTurn` in place of its own `startsWith("/")`, changing no Gemini behavior
  today (no `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
  own commands too, `/hooks`, `/mcp`, `/compact`), or with `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 followed by a skill
  name: `^\$[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*(?=\s|$)`. The grammar is
  `mirrorForm`'s shape generalized: lowercase segments with digits, hyphens, and
  underscores after the first letter (Codex discovers `~/.codex/skills/<dir>` by
  directory name, and a directory can be `my_skill`), an optional plugin-name prefix
  with `:`, the form ending at whitespace or the end. `$5 a month`, `$HOME is set`,
  `$1,000`, `$`, a bare `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
, `$ 10`, `$mirror-mind:` (a trailing colon), and
  ` $mm-journeys` (a leading space, as ` /help` is not a command today) are not skill
  names and stay conversation on every runtime; `$mm-journeys`,
  `$mirror-mind:mm:journeys`, `$mm-build mirror`, and `$mm-journeys` followed by a
  newline are commands on every runtime, Claude Code and Grok included, where a
  person typing them is still invoking a skill the runtime does not know.
  `$mm-journeys, please` is conversation: a comma is not a boundary, the same
  boundary `mirrorForm` draws.
- The two sides are deliberately asymmetric, and the predicate's comment says why
  (decision 1): `/` skips anything, because every runtime uses `/` for its own
  built-ins; `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 skips only a skill name, because `# Plan — CV21.DS4.TS3

## Objective

Decide, implement, and record whether a Codex skill turn other than Mirror's is a
command or a conversation, so the rule is one for every runtime. Today the prompt
hook skips a prompt that opens with `/` as a command (`slash_command`), with the Mirror
skill's explicit form as the one exception (US8's decision), and the Stop hook then
skips the reply to a skipped turn (`command_turn`). Codex spells a skill invocation
with `$` — `$mirror-mind:mm:journeys` through the plugin (DS12.TS2 L10),
`$mm-journeys` through a skills link — so on Codex `$mm-journeys` is logged as a
conversation turn today, and its reply with it, while the same invocation on Claude
Code (`/mirror-mind:mm:journeys`) is a command and logs nothing. DS2's Debt Review
carried the question here.

**The decision this plan proposes:** a prompt that opens with a skill invocation in
any runtime's sigil is a command turn. `$` followed by a skill name, ending at
whitespace or the end of the prompt, follows the `/` rule; the Mirror form keeps its
exception in both sigils. The counter-case — that a Codex `$mm-journal …` or
`$mm-consult …` turn is content worth keeping — is the same case for `/mm-journal …`
on Claude Code, which US8 decided is a command; a skill turn's reply is a rendering,
not a conversation, and the skill itself records what it needs (a journal entry, a
memory) through the front door. The rule is recorded in `decisions.md` either way.

## Scope

**1. The command-turn predicate, extracted and extended.**

- New `ts/src/conversation/commandTurn.ts`: `isCommandTurn(prompt)` — true for a
  prompt that opens with `/` (as today, any slash command: runtimes use `/` for their
 is Codex's skill sigil and
  nothing else, and `$5 a month` is English.
- A test pins the relation between the rule and its exception (decision 1): every
  prompt `mirrorForm` accepts is also a command turn, so the exception always sits
  inside the rule and the two grammars cannot drift apart unnoticed. The refactor
  that would share one grammar crosses the layering the wrong way (`mirror/` must not
  import `conversation/`) and is not taken.
- `handleUserPromptHook` (`ts/src/conversation/logger.ts`) uses the predicate in
  place of `prompt.startsWith("/")`; `mirrorForm` keeps precedence, so
  `$mirror-mind:mm:mirror what …` and `$mm-mirror …` remain conversation turns with
  the question logged. The skip reason becomes `command_turn` for both sigils — the
  Stop hook already names its own skip that way — with `slash_command` retired from
  the outcome type; its one test moves with it.
 sigil) and leaving the rule one place for every hook that runs in our
  process. The Pi extension keeps its copy: a separate process, Pi's file; named here
  as the one remaining copy.

**2. Tests, first.**

 Mirror forms, `$mm-mirror what matters`
  and `$mirror-mind:mm:mirror what matters`, log the question; on a `claude_code`
  session, `$5 a month seems fine` is logged; the existing `/`-command tests (two,
  one in `replyLogging.test.ts`) keep their behavior under the new reason; and the
  Stop side without a turn id is pinned as unchanged: a prompt skipped with no turn
  id records nothing, and a Stop that then carries one reaches `nothing_waiting`, as
  `/` does today.

**3. Docs.**

- `docs/product/specs/runtime-interface/index.md` "User Prompt": the skip rule names
  both sigils and the grammar, and the Mirror exception in both.
- `docs/project/decisions.md`: "A skill turn is a command turn in every runtime's
  sigil", leading with memory quality (decision 4): on Codex today a `$mm-journeys`
  and its rendered journey list land in the conversation as user and assistant
  turns, and extraction reads a roadmap table as if the person said it; skill
  renderings are noise to extraction. Then the counter-case and why it was not
  taken, what a Codex user loses (the accidental logging of `$mm-journal` and
  `$mm-consult` turns; the journal skill records its entry itself), and the sentence
  a user can learn: what you say to the mirror is remembered, a skill you invoke is
  not. No user-facing doc describes the skip today (REFERENCE and Getting Started
  checked), so the spec and the decision are its homes.
- The DS4 index row for TS3.

**4. The story package.** `route.sh static`, on the pattern of TS2's: the plugin's real
wrappers and this tree's entry against a scratch home, a `codex` session with a
`$`-skill turn and its reply (neither logged, no `hooks.log` line), a `$mm-mirror`
turn (logged as its question), and a `claude_code` session with a `$5 …` prompt
(logged). No model: the prompt and Stop hooks make no LLM call.

## Non-Goals

- Changing what the inject hook does with a `$`-skill turn: it already recognizes
  only the Mirror form (US7) and injects nothing for other skills.
- Gemini CLI's and Pi's copies of the `/` rule (no `$` sigil there).
- Observing the rule on the real Codex: US4's live session, which follows.
- Logging a skill turn's reply for any skill: US8 decided a command turn's reply is
  not recorded; this story extends that rule to a second sigil, it does not reopen it.
- TS5, TS6.

## Acceptance Behavior

```text
Given a session labelled codex
When the prompt hook receives "$mirror-mind:mm:journeys" and then the Stop hook its reply
Then neither is logged, the prompt hook's outcome is command_turn,
     the Stop hook's skip is command_turn, and hooks.log gains no line

Given a session labelled codex
When the prompt hook receives "$mm-mirror what matters today"
Then "what matters today" is logged as the conversation turn, as today

Given a session labelled claude_code
When the prompt hook receives "$5 a month seems fine"
Then the prompt is logged as a conversation turn

Given any session
When the prompt hook receives a prompt opening with "/"
Then it is skipped as a command turn, as today
```

## Validation Route

**Automated (Driver).** `npm run typecheck`, `npm run lint`, `npm test`,
`node ts/scripts/checkDocLinks.ts`. The new tests fail on the tree before the change.

**Navigator — `bash route.sh static`** from this package: the real wrappers and this
tree's entry (pinned and printed, as TS2's route does), a scratch home. Step 1: a
`codex` session, `$mirror-mind:mm:journeys` then a reply through the Stop wrapper —
expected zero messages for the session and no `hooks.log` line. Step 2: the same
session, `$mm-mirror what matters today` — expected one user message, `what matters
today`. Step 3: a `claude_code` session, `$5 a month seems fine` — expected one user
message, the prompt as typed. Fail: any message where none is expected, a `hooks.log`
line, or the Mirror question lost.

**E2E decision:** required, and the route is it: real wrappers, real entry, real
database, no model needed. The real Codex is US4's.

## Implementation Contract

- Tests first (Scope 2); then the change makes them pass.
- Keep changes scoped to `CV21.DS4.TS3`: `commandTurn.ts` (new), `logger.ts`,
  `hooks/gemini.ts`, their tests, the two docs, and this package.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- Evidence that Codex sends a skill turn to the hook in some form other than the
  `$`-prefixed prompt text (DS12.TS2 L10 saw the text; US4 may see otherwise).
- scope_change_detected, plan_rule_conflict, failing_required_check_without_clear_fix,
  navigator_decision_needed.

 Mirror forms tested; the no-turn-id Stop behavior pinned as
   unchanged.
4. **The decision leads with memory quality**, states what Codex users lose, and
   carries the user-facing sentence; no new user doc.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
