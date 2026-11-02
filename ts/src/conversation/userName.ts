// The owner's first name for the prompts the conversation lifecycle sends: memory
// and task extraction, and the close tail's title, summary, and tags (CR180).
//
// Ported from Python's `conversation.py` resolver, which matched only "You are
// talking to" and "Você está falando com". The shipped identity template writes
// "You are speaking with {{user_name}}", so against a seeded identity the port
// matched nothing and every prompt labelled the speaker `**User:**`, silently
// (CR014's finding, confirmed on the development home 2026-10-28). The template's
// phrasing is accepted here. The cultivation path keeps its own resolver
// (`cultivation/promptContext.ts`, fallback "the user"); unifying them is CR014's.

import type { Database } from "#db/database.ts";
import { optionalString } from "#db/rowDecode.ts";

/** Python's fallback when the row or the marker phrase is absent. */
export const FALLBACK_USER_NAME = "User";

/** One name token: Unicode letters, so an accented first name is whole (a plain `\w` stops at the accent). */
const MARKER =
  /(?:You are (?:talking to|speaking with)|Você está (?:falando com|conversando com)) (\p{Lu}[\p{L}]*)/u;

/** The first name after the identity's marker phrase, or the fallback. */
export function userNameFromIdentity(content: string | null | undefined): string {
  const match = content?.match(MARKER);
  return match?.[1] ?? FALLBACK_USER_NAME;
}

/**
 * Read `user/identity` and resolve the name; the fallback when the row is absent.
 * Fail-soft: a database without the table, or a read that throws, is the fallback
 * too. The close tail runs inside the session-end hooks, where a throw becomes an
 * extraction attempt and three attempts quarantine a conversation (CR178); a name
 * is never worth that.
 */
export function resolveUserName(db: Database): string {
  try {
    const row = db
      .prepare("SELECT content FROM identity WHERE layer = ? AND key = ? LIMIT 1")
      .get("user", "identity");
    return userNameFromIdentity(row ? optionalString(row, "content") : null);
  } catch {
    return FALLBACK_USER_NAME;
  }
}
