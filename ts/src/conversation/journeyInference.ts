// Journey inference for conversations (CV22.DS7.US10 slice E).
//
// Ports `_journey_aliases`, `_first_user_message`, `_activation_text`, and
// `_infer_journey_for_conversation` from
// `src/memory/cli/conversation_logger.py`.
//
// This is the deterministic half of `diagnose-journeys`/`repair-journeys`: it
// decides which journeyless conversation has a high-confidence match. The
// decision matters because `--apply` writes it, so a false positive silently
// reassigns a user's conversation to the wrong journey.
//
// Pure: no storage, no clock, no provider. The caller supplies the alias table
// and the conversation's title and first user message.

import type { WritableDatabase } from "#db/database.ts";

/** slug -> alias strings, longest first (Python sorts by length descending). */
export type JourneyAliases = Record<string, string[]>;

export interface JourneyInference {
  journey: string | null;
  reason: string | null;
}

/**
 * Python's `_journey_aliases`: the slug, the slug with hyphens as spaces, and
 * the first Markdown heading in the journey's identity content.
 *
 * Python builds the value set with `{slug.lower(), slug.replace("-", " ").lower()}`,
 * so a slug without hyphens contributes one alias, not two.
 */
export function journeyAliases(db: WritableDatabase): JourneyAliases {
  const rows = db
    .prepare("SELECT key, content FROM identity WHERE layer = 'journey' ORDER BY key")
    .all() as Record<string, unknown>[];

  const aliases: JourneyAliases = {};
  for (const row of rows) {
    const slug = String(row.key);
    const content = typeof row.content === "string" ? row.content : "";
    const values = new Set([slug.toLowerCase(), slug.replaceAll("-", " ").toLowerCase()]);
    for (const line of content.split("\n")) {
      const heading = line.trim();
      if (heading.startsWith("#")) {
        // Python breaks at the FIRST heading line, whether or not it yielded a
        // title, so a bare `#` stops the scan instead of falling through.
        const title = heading.replace(/^#+/, "").trim();
        if (title) values.add(title.toLowerCase());
        break;
      }
    }
    aliases[slug] = sortByLengthDescending([...values]);
  }
  return aliases;
}

/**
 * Python's `sorted(values, key=len, reverse=True)`, with equal lengths broken
 * lexicographically.
 *
 * Python sorts a SET and its sort is stable, so aliases of equal length come
 * out in set-iteration order -- which string hash randomization varies between
 * processes. Observed directly while building the golden: `beta-two` alternates
 * between `["beta two", "beta-two"]` and the reverse across runs.
 *
 * The ordering is behaviorally inert for inference: only the matched alias's
 * LENGTH feeds the cross-slug tie-break, and equal-length entries tie by
 * definition. Breaking those ties lexicographically therefore preserves
 * behavior while making the alias table reproducible, which is what lets the
 * golden serve as a determinism gate. The generator normalizes the oracle's
 * output the same way and asserts the two agree on membership and lengths.
 */
function sortByLengthDescending(values: string[]): string[] {
  return [...values].sort(
    (left, right) => right.length - left.length || (left < right ? -1 : left > right ? 1 : 0),
  );
}

/** Python's `_first_user_message`. */
export function firstUserMessage(db: WritableDatabase, conversationId: string): string {
  const row = db
    .prepare(
      `SELECT content FROM messages
        WHERE conversation_id = ? AND role = 'user'
        ORDER BY created_at ASC LIMIT 1`,
    )
    .get(conversationId) as Record<string, unknown> | undefined;
  return row && typeof row.content === "string" ? row.content : "";
}

/**
 * Python's `_activation_text`: the title, the text after a closing `</skill>`
 * tag when present, and the first line -- joined with newlines and lowercased.
 */
export function activationText(title: string | null, firstUser: string): string {
  const parts: string[] = [title ?? ""];
  const stripped = firstUser.trim();
  if (stripped.includes("</skill>")) {
    parts.push(stripped.slice(stripped.lastIndexOf("</skill>") + "</skill>".length));
  }
  const firstLine = stripped ? (stripped.split("\n")[0] as string) : "";
  parts.push(firstLine);
  return parts.join("\n").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Python's `_infer_journey_for_conversation`.
 *
 * Two routes: an explicit `/mm-build <slug>` command, or an alias match that is
 * either standalone on its own line or wrapped in an activation phrase. A tie
 * between the two longest matching aliases returns no journey -- ambiguity is
 * resolved by refusing, never by picking, because the caller may write it.
 */
export function inferJourneyForConversation(
  title: string | null,
  firstUser: string,
  aliases: JourneyAliases,
): JourneyInference {
  const text = activationText(title, firstUser);
  if (!text.trim()) return { journey: null, reason: null };

  const buildMatch = /(?:\/mm-build|\$mm-build|\/mm:build)\s+([a-z0-9][a-z0-9_-]*)/.exec(text);
  if (buildMatch) {
    const slug = buildMatch[1] as string;
    if (slug in aliases) return { journey: slug, reason: "explicit build command" };
  }

  const candidates: { slug: string; alias: string; reason: string }[] = [];
  for (const [slug, values] of Object.entries(aliases)) {
    for (const alias of values) {
      const escaped = escapeRegExp(alias);
      // Python's `$` without MULTILINE means end of string, or immediately
      // before a trailing newline -- NOT the end of every line. A JavaScript
      // `m` flag would match an alias sitting mid-text and silently widen the
      // rule that decides what `--apply` rewrites, so the trailing-newline case
      // is spelled out with a lookahead instead.
      if (new RegExp(`(?:^|\\n)\\s*${escaped}\\s*(?=\\n?$)`).test(text)) {
        candidates.push({ slug, alias, reason: "standalone journey slug/name" });
        break;
      }
      const activation =
        `(?:vamos|quero|preciso|let'?s)\\s+` +
        `(?:retomar\\s+)?(?:trabalhar|ativar|continuar|retomar|work)` +
        `(?:\\s+\\w+){0,5}\\s+(?:journey|jornada|travessia|projeto|project)?\\s*` +
        `(?:no|na|em|on|with)?\\s*${escaped}\\b` +
        `(?=$|\\s*[.,;:!?)]|\\s+(?:em|in|journey|jornada|travessia|modo)\\b)`;
      if (new RegExp(activation).test(text)) {
        candidates.push({ slug, alias, reason: "activation phrase" });
        break;
      }
    }
  }

  if (candidates.length === 0) return { journey: null, reason: null };
  candidates.sort((left, right) => right.alias.length - left.alias.length);
  const best = candidates[0] as { slug: string; alias: string; reason: string };
  if (candidates.length > 1 && best.alias.length === (candidates[1]?.alias.length ?? -1)) {
    return { journey: null, reason: null };
  }
  return { journey: best.slug, reason: best.reason };
}
