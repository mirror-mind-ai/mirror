// CV22.DS7.US5 slice B — the explicit conversation append boundary (v0.31.13).
//
// Ports `src/memory/services/conversation_append.py` and
// `MessageStore.append_conversation_messages`. This is a published contract
// for external shells, so rejections stay bounded and public, metadata is
// canonical JSON, batches are atomic, and replay is idempotent on the caller's
// message ids.
//
// KNOWN DIVERGENCE (registered for Debt Review): caller metadata containing an
// integer-valued float (`1.0`) serializes as `1.0` in Python and `1` in TS,
// because `JSON.parse` collapses the two before either core can see the
// difference. Non-integer floats (`1.5`) agree. Metadata bytes participate in
// the idempotency comparison, so a batch written by one core and replayed
// through the other with such metadata would raise `idempotency_conflict`.

import { type WritableDatabase, withTransaction } from "#db/database.ts";

export const APPEND_SCHEMA_VERSION = "1.0.0";
export const MAX_PAYLOAD_BYTES = 262_144;
export const MAX_MESSAGES = 20;
export const MAX_CONTENT_BYTES = 51_200;
export const MAX_METADATA_BYTES = 4_096;
const MICROSECOND_DIGITS = 6;

const MESSAGE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SOURCE_INTERFACE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const RFC3339_RE =
  /^(?<civil>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d+))?(?<offset>Z|[+-]\d{2}:\d{2})$/;

export type AppendRejectionReason =
  | "malformed_request"
  | "unsupported_schema_version"
  | "limit_exceeded"
  | "conversation_not_found"
  | "journey_mismatch"
  | "duplicate_request_message_id"
  | "idempotency_conflict"
  | "persistence_failure";

const PUBLIC_MESSAGES: Record<AppendRejectionReason, string> = {
  malformed_request: "Request does not match the conversation append contract.",
  unsupported_schema_version: "Request schema version is unsupported.",
  limit_exceeded: "Request exceeds a conversation append limit.",
  conversation_not_found: "Conversation was not found.",
  journey_mismatch: "Conversation belongs to a different journey.",
  duplicate_request_message_id: "Request contains a duplicate message ID.",
  idempotency_conflict: "Message ID conflicts with persisted conversation data.",
  persistence_failure: "Conversation append could not be persisted.",
};

/** A bounded public rejection; never carries caller content. */
export class AppendRejectedError extends Error {
  readonly reason: AppendRejectionReason;
  readonly publicMessage: string;

  constructor(reason: AppendRejectionReason) {
    super(PUBLIC_MESSAGES[reason]);
    this.reason = reason;
    this.publicMessage = PUBLIC_MESSAGES[reason];
  }

  receipt(): Record<string, string> {
    return {
      schemaVersion: APPEND_SCHEMA_VERSION,
      status: "rejected",
      reason: this.reason,
      message: this.publicMessage,
    };
  }
}

export interface AppendMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  metadataJson: string;
}

export interface ConversationAppendRequest {
  conversationId: string;
  journeyId: string;
  sourceInterface: string;
  messages: AppendMessage[];
}

export interface AppendReceipt {
  schemaVersion: string;
  status: "accepted";
  conversationId: string;
  journeyId: string;
  insertedCount: number;
  existingCount: number;
  messages: { id: string; state: "inserted" | "existing" }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Python sorts keys by code point; JS `<` compares UTF-16 code units. */
function compareByCodePoint(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const delta = (left[index]?.codePointAt(0) ?? 0) - (right[index]?.codePointAt(0) ?? 0);
    if (delta !== 0) return delta;
  }
  return left.length - right.length;
}

/** Python `json.dumps(..., ensure_ascii=False, sort_keys=True, separators=(",", ":"))`. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    // Python passes allow_nan=False, so NaN/Infinity are contract failures.
    if (!Number.isFinite(value)) throw new AppendRejectedError("malformed_request");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort(compareByCodePoint)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new AppendRejectedError("malformed_request");
}

function isFiniteJson(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isFiniteJson(item));
  if (isRecord(value)) return Object.values(value).every((item) => isFiniteJson(item));
  return false;
}

function utf8Length(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/**
 * Normalize RFC 3339 input to UTC microseconds. The fraction is padded or
 * truncated as a string so precision never passes through a millisecond-only
 * Date, mirroring the explicit normalization the Python side now performs.
 */
function normalizeTimestamp(value: unknown): string {
  if (typeof value !== "string") throw new AppendRejectedError("malformed_request");
  const match = RFC3339_RE.exec(value);
  const groups = match?.groups;
  if (!groups) throw new AppendRejectedError("malformed_request");

  const civil = groups.civil as string;
  const offset = groups.offset as string;
  const micros = (groups.fraction ?? "")
    .slice(0, MICROSECOND_DIGITS)
    .padEnd(MICROSECOND_DIGITS, "0");

  const year = Number(civil.slice(0, 4));
  const month = Number(civil.slice(5, 7));
  const day = Number(civil.slice(8, 10));
  const hour = Number(civil.slice(11, 13));
  const minute = Number(civil.slice(14, 16));
  const second = Number(civil.slice(17, 19));

  // `Date.UTC` silently rolls over (month 13 -> next January, second 60 -> next
  // minute), which Python's parser rejects, so the components must round-trip.
  const civilMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const roundTrip = new Date(civilMs);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day ||
    roundTrip.getUTCHours() !== hour ||
    roundTrip.getUTCMinutes() !== minute ||
    roundTrip.getUTCSeconds() !== second
  ) {
    throw new AppendRejectedError("malformed_request");
  }

  let utcMs = civilMs;
  if (offset !== "Z") {
    const offsetHours = Number(offset.slice(1, 3));
    const offsetMinutes = Number(offset.slice(4, 6));
    if (offsetHours > 23 || offsetMinutes > 59) {
      throw new AppendRejectedError("malformed_request");
    }
    const totalMinutes = offsetHours * 60 + offsetMinutes;
    utcMs -= (offset.startsWith("-") ? -1 : 1) * totalMinutes * 60_000;
  }
  return `${new Date(utcMs).toISOString().slice(0, 19)}.${micros}Z`;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value) throw new AppendRejectedError("malformed_request");
  return value;
}

const ENVELOPE_KEYS = [
  "schemaVersion",
  "conversationId",
  "journeyId",
  "sourceInterface",
  "messages",
];
const MESSAGE_REQUIRED_KEYS = ["id", "role", "content", "createdAt"];

function sameKeySet(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

function parseMessage(raw: unknown, sourceInterface: string): AppendMessage {
  if (!isRecord(raw)) throw new AppendRejectedError("malformed_request");
  const keys = Object.keys(raw);
  const allowed = new Set([...MESSAGE_REQUIRED_KEYS, "metadata"]);
  if (
    !MESSAGE_REQUIRED_KEYS.every((key) => keys.includes(key)) ||
    !keys.every((key) => allowed.has(key))
  ) {
    throw new AppendRejectedError("malformed_request");
  }

  const id = raw.id;
  if (typeof id !== "string" || !MESSAGE_ID_RE.test(id)) {
    throw new AppendRejectedError("malformed_request");
  }
  const role = raw.role;
  if (role !== "user" && role !== "assistant") {
    throw new AppendRejectedError("malformed_request");
  }
  const content = raw.content;
  if (typeof content !== "string" || !content) {
    throw new AppendRejectedError("malformed_request");
  }
  if (utf8Length(content) > MAX_CONTENT_BYTES) {
    throw new AppendRejectedError("limit_exceeded");
  }

  const callerMetadata = raw.metadata ?? {};
  if (!isRecord(callerMetadata) || !isFiniteJson(callerMetadata)) {
    throw new AppendRejectedError("malformed_request");
  }
  const metadataJson = canonicalJson({
    callerMetadata,
    mirrorAppend: { schemaVersion: APPEND_SCHEMA_VERSION, sourceInterface },
  });
  if (utf8Length(metadataJson) > MAX_METADATA_BYTES) {
    throw new AppendRejectedError("limit_exceeded");
  }

  return { id, role, content, createdAt: normalizeTimestamp(raw.createdAt), metadataJson };
}

export function parseAppendRequest(payload: unknown): ConversationAppendRequest {
  if (!isRecord(payload) || !sameKeySet(Object.keys(payload), ENVELOPE_KEYS)) {
    throw new AppendRejectedError("malformed_request");
  }
  if (payload.schemaVersion !== APPEND_SCHEMA_VERSION) {
    // A non-string version is malformed; a string one is merely unsupported.
    if (typeof payload.schemaVersion !== "string") {
      throw new AppendRejectedError("malformed_request");
    }
    throw new AppendRejectedError("unsupported_schema_version");
  }

  const conversationId = requiredString(payload.conversationId);
  const journeyId = requiredString(payload.journeyId);
  const sourceInterface = payload.sourceInterface;
  if (typeof sourceInterface !== "string" || !SOURCE_INTERFACE_RE.test(sourceInterface)) {
    throw new AppendRejectedError("malformed_request");
  }

  const rawMessages = payload.messages;
  if (!Array.isArray(rawMessages)) throw new AppendRejectedError("malformed_request");
  if (rawMessages.length < 1 || rawMessages.length > MAX_MESSAGES) {
    throw new AppendRejectedError("limit_exceeded");
  }

  const messages: AppendMessage[] = [];
  const seen = new Set<string>();
  for (const raw of rawMessages) {
    const message = parseMessage(raw, sourceInterface);
    if (seen.has(message.id)) {
      throw new AppendRejectedError("duplicate_request_message_id");
    }
    seen.add(message.id);
    messages.push(message);
  }
  return { conversationId, journeyId, sourceInterface, messages };
}

/**
 * Classify and append one validated batch inside a single owned transaction:
 * all-or-nothing, so a conflict anywhere leaves the batch unwritten.
 */
export function appendConversationMessages(
  db: WritableDatabase,
  request: ConversationAppendRequest,
): AppendReceipt {
  const states = withTransaction(db, () => {
    const conversation = db
      .prepare("SELECT journey FROM conversations WHERE id = ?")
      .get(request.conversationId);
    if (conversation === undefined) {
      throw new AppendRejectedError("conversation_not_found");
    }
    if (conversation.journey !== request.journeyId) {
      throw new AppendRejectedError("journey_mismatch");
    }

    const placeholders = request.messages.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT id, conversation_id, role, content, created_at, metadata
         FROM messages WHERE id IN (${placeholders})`,
      )
      .all(...request.messages.map((message) => message.id));
    const existing = new Map(rows.map((row) => [String(row.id), row]));

    const classified: ("inserted" | "existing")[] = [];
    const absent: AppendMessage[] = [];
    for (const message of request.messages) {
      const row = existing.get(message.id);
      if (row === undefined) {
        classified.push("inserted");
        absent.push(message);
        continue;
      }
      if (
        row.conversation_id !== request.conversationId ||
        row.role !== message.role ||
        row.content !== message.content ||
        row.created_at !== message.createdAt ||
        row.metadata !== message.metadataJson
      ) {
        throw new AppendRejectedError("idempotency_conflict");
      }
      classified.push("existing");
    }

    for (const message of absent) {
      db.prepare(
        `INSERT INTO messages
           (id, conversation_id, role, content, created_at, token_count, metadata)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      ).run(
        message.id,
        request.conversationId,
        message.role,
        message.content,
        message.createdAt,
        message.metadataJson,
      );
    }
    return classified;
  });

  const insertedCount = states.filter((state) => state === "inserted").length;
  return {
    schemaVersion: APPEND_SCHEMA_VERSION,
    status: "accepted",
    conversationId: request.conversationId,
    journeyId: request.journeyId,
    insertedCount,
    existingCount: states.length - insertedCount,
    messages: request.messages.map((message, index) => ({
      id: message.id,
      state: states[index] as "inserted" | "existing",
    })),
  };
}
