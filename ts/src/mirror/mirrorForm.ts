// The explicit Mirror Mode form, in every runtime's skill syntax (CV21.DS2.US7).
//
// Lives with the mirror core rather than with the hooks because two readers
// share it: the inject hook (context for the question) and the prompt logger
// (the question as the conversation turn, US8).
//
// A person invokes the Mirror skill by name, and each runtime spells that
// name its own way before handing the prompt to the hooks (DS12):
//
//     /mm:mirror …                 standalone Claude Code
//     /mirror-mind:mm-mirror …     the Claude Code plugin (TS1 L4)
//     /mirror-mind:mm:mirror …     Claude Code's menu form (TS1 static 6)
//     $mirror-mind:mm:mirror …     the Codex plugin (TS2 L10)
//     /mm-mirror …                 Grok (TS4 L5)
//     $mm-mirror …                 Codex's own skill form
//
// Three choices, each made by the runtime, not the person: the sigil (`/` or
// `$`), whether the plugin's name prefixes the skill, and whether the skill's
// `name: "mm:mirror"` or its directory `mm-mirror` is used. The grammar is
// their product, so a runtime that combines them differently is covered too.
//
// The form must open the prompt and end at whitespace or the end of it: a
// longer skill name (`/mm-mirrors`) is another skill, and a form quoted in the
// middle of a sentence is a mention. The inject hook loads context for the
// query that follows the form, and the prompt logger records that query as
// the conversation turn (US8), so both read the same grammar.

export interface MirrorForm {
  /** The form as the runtime sent it, e.g. `/mirror-mind:mm-mirror`. */
  readonly form: string;
  /** What follows the form, with the whitespace between them removed. */
  readonly query: string;
}

const FORM = /^([/$])(mirror-mind:)?mm[:-]mirror(?=\s|$)/;

/** The explicit Mirror Mode form at the start of a prompt, or null. */
export function mirrorForm(prompt: string): MirrorForm | null {
  const match = FORM.exec(prompt);
  if (!match) return null;
  const form = match[0];
  return { form, query: prompt.slice(form.length).replace(/^\s+/, "").trimEnd() };
}
