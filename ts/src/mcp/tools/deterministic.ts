// The five MCP tools that never cross a provider (CV22.DS9.US2 plateau 3).
//
// `list_journeys`, `journey_status`, `list_conversations`, `recall_conversation`,
// and `detect_persona` are plain database reads. Each returns the exact text its
// Python handler returns -- `json.dumps(value, ensure_ascii=False, indent=2,
// default=str)` -- which is what the model on the other end reads.
//
// The two provider-crossing tools (`search_memories` with a query, and
// `mirror_context`) live in their own module.

import { listRecentConversationSummaries } from "#conversation/listing.ts";
import { findConversationByIdPrefix, pythonTailSliceStart } from "#conversation/recall.ts";
import type { Database, Row } from "#db/database.ts";
import { optionalString, requireString } from "#db/rowDecode.ts";
import { detectPersona, type PersonaRoutingRow } from "#persona/detectPersona.ts";
import { pyFloat, pythonJson } from "../payload.ts";
import { journeyStatus, listActiveJourneyDtos, recallMessages } from "../readModels.ts";

/** Python's `_json`: pretty, unescaped, two-space indent. */
export function toolJson(value: unknown): string {
  return pythonJson(value, { indent: 2 });
}

/** Read an argument that Python would have taken straight off the dict. */
function argument(args: unknown, key: string): unknown {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return undefined;
  return (args as Record<string, unknown>)[key];
}

/**
 * Python's `int(args.get("limit", fallback))`.
 *
 * `int("5")` and `int(5.9)` both succeed in Python, so a string or float limit
 * is coerced rather than rejected. Argument VALIDATION is CV22.DS9.TS1's; this
 * reproduces the oracle, including the limits US1's threat model recorded as
 * unbounded.
 */
function pythonInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
    throw new Error(`invalid literal for int() with base 10: '${value}'`);
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new Error(`int() argument must be a string or a number, not '${typeof value}'`);
}

export function listJourneysTool(db: Database, _args: unknown): string {
  return toolJson(listActiveJourneyDtos(db));
}

export function journeyStatusTool(db: Database, args: unknown): string {
  const slug = argument(args, "slug");
  return toolJson(journeyStatus(db, typeof slug === "string" ? slug : null));
}

export function listConversationsTool(db: Database, args: unknown): string {
  const summaries = listRecentConversationSummaries(db, {
    limit: pythonInt(argument(args, "limit"), 20),
    journey: (argument(args, "journey") as string | undefined) ?? undefined,
    persona: (argument(args, "persona") as string | undefined) ?? undefined,
  });
  return toolJson(
    summaries.map((summary) => ({
      id: summary.id,
      title: summary.title,
      started_at: summary.started_at,
      persona: summary.persona,
      journey: summary.journey,
      message_count: summary.message_count,
    })),
  );
}

export function recallConversationTool(db: Database, args: unknown): string {
  const conversationId = argument(args, "conversation_id");
  if (!conversationId) throw new Error("'conversation_id' is required");
  const conversation = findConversationByIdPrefix(db, String(conversationId));
  if (conversation === null) throw new Error(`no conversation matching '${conversationId}'`);

  const limit = pythonInt(argument(args, "limit"), 50);
  const messages = recallMessages(db, conversation.id);
  // `messages[-limit:]` -- and `-0 == 0` in Python, so limit=0 returns the WHOLE
  // transcript rather than none. Recorded in the golden and owned by the DS9
  // threat model; TS1 caps it, and this stays faithful until it does.
  const tail = messages.slice(pythonTailSliceStart(messages.length, limit));

  return toolJson({
    conversation_id: conversation.id,
    messages: tail.map((message) => ({
      role: message.role,
      content: message.content,
      created_at: message.created_at,
    })),
  });
}

/** Python's `_persona_metadata(identity).get("routing_keywords") or []`. */
function routingKeywords(metadata: unknown): string[] {
  if (typeof metadata !== "string" || metadata === "") return [];
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    if (!Array.isArray(parsed.routing_keywords)) return [];
    return parsed.routing_keywords.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function personaRoutingRows(db: Database): PersonaRoutingRow[] {
  return db
    .prepare("SELECT key, metadata FROM identity WHERE layer = 'persona' ORDER BY key")
    .all()
    .map((row: Row) => ({
      key: requireString(row, "key"),
      routing_keywords: routingKeywords(optionalString(row, "metadata")),
    }));
}

export function detectPersonaTool(db: Database, args: unknown): string {
  const query = argument(args, "query");
  if (!query) throw new Error("'query' is required");
  const matches = detectPersona(String(query), personaRoutingRows(db));
  return toolJson(
    matches.map((match) => ({
      persona: match.key,
      // Python types this as float, and hit counts are routinely whole -- 2.0,
      // not 2. JavaScript cannot tell the two apart, so the mapper says so.
      score: pyFloat(match.score),
      // Python appends the literal "keyword" as the third tuple element; the TS
      // port carries it as `matchType`, and the tool renders it as `descriptor`.
      descriptor: match.matchType,
    })),
  );
}
