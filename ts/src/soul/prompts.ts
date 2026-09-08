// CV22.DS7.US6 plateau 3 — the Soul Mode voice prompts, ported from
// `src/memory/services/soul_prompt.py`.
//
// The three templates live beside this module as verbatim `.md` files rather
// than as TypeScript string literals. Two reasons, both load-bearing:
//
//   * They carry 38 backticks between them, so vendoring them as template
//     literals would mean escaping every one -- an unreviewable diff against
//     the Python originals and a permanent divergence hazard.
//   * The TS core has no other runtime dependency on the Python tree; every
//     reference to `src/memory/...` in this codebase is a comment naming an
//     oracle. Reading the templates from there would create the first real one,
//     immediately before DS10 deletes that tree and ships `ts/` as an npm
//     package. The plan proposed exactly that; the packaging evidence overruled
//     it, and `prompts.test.ts` asserts the vendored copies are byte-identical
//     to the Python originals so the copy cannot drift.
//
// The injection is a security surface, not a formatting one. Python's
// `str.replace` is literal; JavaScript's is not, twice: `replace` with a string
// pattern replaces only the first occurrence, and in both `replace` and
// `replaceAll` the sequences `$&`, "$`", `$'`, `$1`, and `$$` inside the
// REPLACEMENT are interpreted. The replacement here is the user's own identity
// document, so a naive port lets identity text rewrite the template around it.
// The replacer-function form below is the only one that cannot.

import { readFileSync } from "node:fs";
import type { Database } from "#db/database.ts";
import { getIdentityContent } from "#identity/identityRead.ts";
import { pyStrip } from "#util/pythonText.ts";

export const SELF_IDENTITY_PLACEHOLDER = "{user_self_identity}";
export const SELF_IDENTITY_UNAVAILABLE =
  "No user Self identity layer is available yet. Use only the base Self Voice grammar.";

function loadPrompt(filename: string): string {
  return readFileSync(new URL(`./prompts/${filename}`, import.meta.url), "utf8");
}

/** Port of `load_soul_self_voice_template`. */
export function loadSoulSelfVoiceTemplate(): string {
  return loadPrompt("soul_self_voice.md");
}

/** Port of `load_soul_wisdom_voice_template`. */
export function loadSoulWisdomVoiceTemplate(): string {
  return loadPrompt("soul_wisdom_voice.md");
}

/** Port of `load_soul_beauty_voice_template`. */
export function loadSoulBeautyVoiceTemplate(): string {
  return loadPrompt("soul_beauty_voice.md");
}

/**
 * Port of `compose_soul_self_voice_prompt`: inject the user's `self/soul`
 * identity, or Python's exact unavailable sentence when there is none.
 */
export function composeSoulSelfVoicePrompt(db: Database): string {
  const identity = getIdentityContent(db, "self", "soul");
  const injected =
    typeof identity === "string" && pyStrip(identity)
      ? pyStrip(identity)
      : SELF_IDENTITY_UNAVAILABLE;
  return injectSelfIdentity(loadSoulSelfVoiceTemplate(), injected);
}

/**
 * Python `template.replace(placeholder, value)`: every occurrence, and the
 * value inserted literally. The replacer FUNCTION is what makes it literal --
 * passing `injected` as a replacement string would let `$&` and friends inside
 * a user's identity document rewrite the prompt.
 */
export function injectSelfIdentity(template: string, injected: string): string {
  return template.replaceAll(SELF_IDENTITY_PLACEHOLDER, () => injected);
}

/** Port of `compose_soul_wisdom_voice_prompt`. */
export function composeSoulWisdomVoicePrompt(): string {
  return loadSoulWisdomVoiceTemplate();
}

/** Port of `compose_soul_beauty_voice_prompt`. */
export function composeSoulBeautyVoicePrompt(): string {
  return loadSoulBeautyVoiceTemplate();
}
