// The two inputs `cmd_scan` resolves from the database before calling the
// LLM (CV22.DS8.TS2): the owner's first name and the identity context the
// consolidation prompt shows the model. Ports `cli/shadow_cmd.py:_user_name`
// and `cli/consolidate_cmd.py:_identity_context`.
//
// On the name: Python has TWO resolvers for these leaves. `shadow_cmd` uses
// the regex below; `consolidate_cmd` first short-circuits on the literal
// owner's name being anywhere in the content (a distribution defect, CR014).
// TS ships one resolver, the regex form. The only input where the two Python
// forms disagree is content that names the owner without the seed template's
// "speaking with" line, which no shipped template produces; the golden's
// `resolvers` section records both columns so the deviation stays visible
// (plan decision D1, docs/project/decisions.md).
//
// This is NOT the close tail's `resolveUserName` (`conversation/extraction.ts`),
// which ports a third oracle (`You are talking to`). Unifying the three is
// CR014's job, not this story's.

import type { Database } from "#db/database.ts";
import { getIdentityContent } from "#identity/identityRead.ts";
import { sliceCodePoints } from "#util/pythonText.ts";

/** Python's `\w+` on a `str` pattern: Unicode letters, digits, underscore. A
 * combining mark (Mn) is not a word character in either engine. */
const SPEAKING_WITH = /speaking with ([\p{L}\p{N}_]+)/u;

/** Python's fallback when the row or the marker phrase is absent. */
export const FALLBACK_USER_NAME = "the user";

/** Port of `shadow_cmd._user_name`: the owner's first name from `user/identity`. */
export function cultivationUserName(db: Database): string {
  const content = getIdentityContent(db, "user", "identity");
  const match = content?.match(SPEAKING_WITH);
  return match?.[1] ?? FALLBACK_USER_NAME;
}

/** `entry.content[:600]` -- code points, not UTF-16 units. */
export const IDENTITY_CONTEXT_CODE_POINTS = 600;

/** The layers `_identity_context` reads, in Python's order. */
const IDENTITY_CONTEXT_LAYERS: readonly (readonly [string, string])[] = [
  ["ego", "behavior"],
  ["ego", "identity"],
  ["self", "soul"],
];

/** Python's fallback when none of the three rows exists. */
export const FALLBACK_IDENTITY_CONTEXT = "(no identity context loaded)";

/**
 * Port of `consolidate_cmd._identity_context`: a brief, system-side identity
 * digest for the consolidation prompt's IDENTITY_UPDATE reference.
 */
export function consolidationIdentityContext(db: Database): string {
  const parts: string[] = [];
  for (const [layer, key] of IDENTITY_CONTEXT_LAYERS) {
    const content = getIdentityContent(db, layer, key);
    if (content === null) continue;
    parts.push(`## ${layer}/${key}\n${sliceCodePoints(content, IDENTITY_CONTEXT_CODE_POINTS)}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : FALLBACK_IDENTITY_CONTEXT;
}
