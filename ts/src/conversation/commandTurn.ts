// A command turn: a prompt that opens with a skill invocation, in any runtime's
// sigil (CV21.DS4.TS3).
//
// The prompt hook skips a command turn and records it, so the Stop hook skips
// its reply too (`command_turn`, CV21.DS2.US8): a skill's rendering -- a
// journey table, help text -- is not conversation, and extraction reading it
// as if the person said it is noise. What you say to the mirror is remembered;
// a skill you invoke is not. The one exception is the Mirror skill's explicit
// form, whose question IS the conversation turn (`mirrorForm.ts`); the prompt
// hook checks that form first, and a test holds every Mirror form to be a
// command turn, so the exception always sits inside this rule.
//
// The two sides are deliberately asymmetric:
//
//   `/`  skips ANYTHING. Every runtime uses `/` for its own built-ins as well as
//        for skills (`/hooks`, `/mcp`, `/compact`), so a prompt opening with it
//        is a command whatever follows. This is the rule US8 inherited.
//   `$`  skips only a SKILL NAME. `$` is Codex's skill sigil and nothing else
//        (`$mirror-mind:mm:journeys` through the plugin, DS12.TS2 L10;
//        `$mm-journeys` through a skills link), and `$5 a month` is English.
//        The name is lowercase segments -- letters, digits, hyphens, and
//        underscores after the first letter, since Codex discovers
//        `~/.codex/skills/<dir>` by directory name -- with an optional
//        plugin-name prefix joined by `:`, ending at whitespace or the end of
//        the prompt, the boundary `mirrorForm` draws. A comma is not a boundary
//        and a leading space is not a prompt start, as ` /help` is not a
//        command today.
//
// One rule for every runtime: a Claude Code user who types `$mm-journeys`,
// which Claude Code does not understand, is still invoking a skill, and that
// turn is not conversation either. The rule has one home for every hook that
// runs in our process (the Claude-family logger, agy's Stop); the Pi
// extension, a separate process in Pi's file, keeps its own `/` check.

const SKILL_SEGMENT = "[a-z][a-z0-9_-]*";
const DOLLAR_SKILL_FORM = new RegExp(`^\\$${SKILL_SEGMENT}(?::${SKILL_SEGMENT})*(?=\\s|$)`);

/** Whether the prompt opens with a skill invocation in any runtime's sigil. */
export function isCommandTurn(prompt: string): boolean {
  if (prompt.startsWith("/")) return true;
  return DOLLAR_SKILL_FORM.test(prompt);
}
