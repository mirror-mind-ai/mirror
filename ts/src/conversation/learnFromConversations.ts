// CV24.DS7: learn from a host's Conversations without ending them.
//
// The terminal learns from a Conversation once, when it ends, over its whole
// transcript (`extractionDriver.ts`). A host such as Mirror Desktop keeps one
// Conversation open for its whole life and appends every turn to it, so it is
// never ended, and ending it by idleness would leave every later turn in an
// extracted Conversation (an append does not check `ended_at`). Here the unit
// is the stretch a Conversation gained since it was last learned from:
//
//   - a Conversation of the host's `interface`, with a Journey, not ended, and
//     idle at least `idleMinutes` -- an ended one is the terminal's to extract;
//   - its messages after the watermark (`learned_through` in its metadata),
//     at least 4, the terminal's rule;
//   - cut into bounded pieces, each extracted with the terminal's prompts,
//     its embeddings staged before any write, then its memories and the moved
//     watermark written in one transaction;
//   - at most `limit` pieces per call; a piece failing 3 times is skipped, so
//     one bad stretch never blocks the next.
//
// It never ends a Conversation and never writes its title, summary, tags or
// `extracted`. The key is an argument; this module reads no environment
// variable. The write goes behind the front door's snapshot, once per call.

import { metadataDict } from "#conversation/closeTail.ts";
import { insertMemory, persistExtractedTasks } from "#conversation/extraction.ts";
import { DEFAULT_MAINTENANCE_MAX_EXTRACTIONS } from "#conversation/extractionDriver.ts";
import { DEFAULT_EXTRACTION_MAX_ATTEMPTS } from "#conversation/extractionRun.ts";
import { DatabaseNotCurrentError } from "#conversation/hostCalls.ts";
import { STALE_ORPHAN_THRESHOLD_MINUTES } from "#conversation/sessionComposites.ts";
import { resolveUserName } from "#conversation/userName.ts";
import {
  type Database,
  openDatabaseReadOnly,
  type WritableDatabase,
  withTransaction,
} from "#db/database.ts";
import { embeddingToBytes } from "#db/decode.ts";
import { inspectMigrationState } from "#db/migrationReport.ts";
import {
  type ExtractedMemory,
  type ExtractionMessage,
  extractMemoriesWithStatus,
} from "#extraction/conversation.ts";
import { openLiveWriteDatabase } from "#frontDoor/liveBackup.ts";
import { chatLedgerHook, embeddingLedgerHook } from "#observability/ledgerHooks.ts";
import {
  type EmbeddingProvider,
  generateEmbeddingSafely,
  LiveEmbeddingProvider,
} from "#providers/embedding.ts";
import { LiveLlmProvider, type LlmProvider } from "#providers/llm.ts";
import { newId, nowIso, pythonJsonDumps } from "#util/pyGenerators.ts";

/** Fewer messages than this wait for more: the terminal's extraction rule. */
export const LEARNING_MIN_MESSAGES = 4;
export const LEARNING_PIECE_MAX_MESSAGES = 40;
export const LEARNING_PIECE_MAX_CHARS = 60_000;
/** A longer message is cut for the prompt, never in the database. */
export const LEARNING_MESSAGE_MAX_CHARS = 20_000;
export const LEARNING_MAX_LIMIT = 50;
const MAX_IDLE_MINUTES = 7 * 24 * 60;
const INTERFACE = /^[a-z0-9_-]{1,64}$/;

export type LearningRejection = "invalid_request" | "no_key";

/** A call's own refusal; nothing was written. */
export class LearningRejectedError extends Error {
  readonly reason: LearningRejection;

  constructor(reason: LearningRejection) {
    super(reason);
    this.reason = reason;
  }
}

export interface LearnRequest {
  /** The host's `interface`, as it named it to `ensureConversation`. */
  interface: string;
  idleMinutes?: number;
  /** Pieces per call. */
  limit?: number;
}

export interface LearnOptions {
  /** The OpenRouter key for this call; never read from anywhere else. */
  apiKey?: string | null;
  /** Tests only: providers in place of the live ones the key would build. */
  providers?: { llm: LlmProvider; embedding: EmbeddingProvider };
  /** Tests only: the clock. */
  now?: () => string;
}

/** Counts only: what was learned is the home's, not the report's. */
export interface LearnReport {
  pieces: number;
  memories: number;
  tasks: number;
  failed: number;
  skipped: number;
  /** Conversations with a stretch still to learn after this call. */
  waiting: number;
}

interface Mark {
  created_at: string;
  id: string;
}

export interface StoredMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface Candidate {
  id: string;
  journey: string;
  persona: string | null;
}

/**
 * The providers' environment for learning: the key, and one retry per call.
 * Not on a turn's path, so the terminal's extraction timeout stands.
 */
export function learningProviderEnv(apiKey: string): Record<string, string> {
  return { OPENROUTER_API_KEY: apiKey, MEMORY_LLM_MAX_RETRIES: "1" };
}

function boundedInteger(value: unknown, fallback: number, max: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new LearningRejectedError("invalid_request");
  }
  return value;
}

/** The stretch cut in order: bounded pieces, a short remainder joining the piece before. */
export function cutPieces(messages: readonly StoredMessage[]): StoredMessage[][] {
  const pieces: StoredMessage[][] = [];
  let index = 0;
  while (messages.length - index >= LEARNING_MIN_MESSAGES) {
    const piece: StoredMessage[] = [];
    let chars = 0;
    while (index < messages.length && piece.length < LEARNING_PIECE_MAX_MESSAGES) {
      const size = Math.min(messages[index]?.content.length ?? 0, LEARNING_MESSAGE_MAX_CHARS);
      if (piece.length > 0 && chars + size > LEARNING_PIECE_MAX_CHARS) break;
      piece.push(messages[index] as StoredMessage);
      chars += size;
      index += 1;
    }
    const remaining = messages.length - index;
    if (remaining > 0 && remaining < LEARNING_MIN_MESSAGES) {
      piece.push(...messages.slice(index));
      index = messages.length;
    }
    pieces.push(piece);
  }
  return pieces;
}

function readMark(metadata: Record<string, unknown>): Mark | null {
  const mark = metadata.learned_through as Partial<Mark> | undefined;
  return mark && typeof mark.created_at === "string" && typeof mark.id === "string"
    ? { created_at: mark.created_at, id: mark.id }
    : null;
}

function messagesAfter(
  db: Pick<Database, "prepare">,
  conversationId: string,
  mark: Mark | null,
): StoredMessage[] {
  const rows = mark
    ? db
        .prepare(
          `SELECT id, role, content, created_at FROM messages
            WHERE conversation_id = ? AND (created_at > ? OR (created_at = ? AND id > ?))
            ORDER BY created_at, id`,
        )
        .all(conversationId, mark.created_at, mark.created_at, mark.id)
    : db
        .prepare(
          "SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at, id",
        )
        .all(conversationId);
  return rows.map((row) => ({
    id: String(row.id),
    role: String(row.role),
    content: String(row.content),
    createdAt: String(row.created_at),
  }));
}

function idleCandidates(
  db: Pick<Database, "prepare">,
  surface: string,
  threshold: string,
): (Candidate & { metadata: string | null })[] {
  return db
    .prepare(
      `SELECT c.id, c.journey, c.persona, c.metadata,
              (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id) AS last_at
         FROM conversations c
        WHERE c.interface = ? AND c.ended_at IS NULL AND c.journey IS NOT NULL
          AND last_at IS NOT NULL AND last_at < ?
        ORDER BY last_at ASC`,
    )
    .all(surface, threshold)
    .map((row) => ({
      id: String(row.id),
      journey: String(row.journey),
      persona: typeof row.persona === "string" ? row.persona : null,
      metadata: typeof row.metadata === "string" ? row.metadata : null,
    }));
}

/** Read the metadata inside the write, so a host's concurrent write is not lost. */
function updateMetadata(
  db: WritableDatabase,
  conversationId: string,
  change: (metadata: Record<string, unknown>) => void,
): void {
  const row = db.prepare("SELECT metadata FROM conversations WHERE id = ?").get(conversationId);
  const metadata = metadataDict(typeof row?.metadata === "string" ? row.metadata : null);
  change(metadata);
  db.prepare("UPDATE conversations SET metadata = ? WHERE id = ?").run(
    pythonJsonDumps(metadata),
    conversationId,
  );
}

function markThrough(metadata: Record<string, unknown>, piece: readonly StoredMessage[]): void {
  const last = piece[piece.length - 1] as StoredMessage;
  metadata.learned_through = { created_at: last.createdAt, id: last.id };
  delete metadata.learning_attempts;
}

async function learnPiece(
  db: WritableDatabase,
  conversation: Candidate,
  piece: readonly StoredMessage[],
  deps: { llm: LlmProvider; embedding: EmbeddingProvider; now: () => string; userName: string },
): Promise<{ memories: number; tasks: number }> {
  const context = { conversationId: conversation.id, now: deps.now };
  const messages: ExtractionMessage[] = piece.map((message) => ({
    role: message.role,
    content: message.content.slice(0, LEARNING_MESSAGE_MAX_CHARS),
  }));
  const outcome = await extractMemoriesWithStatus(deps.llm, messages, {
    persona: conversation.persona,
    journey: conversation.journey,
    userName: deps.userName,
    onLlmCall: chatLedgerHook(db, "extraction", context),
  });

  // Every embedding before any write, as the terminal's extraction does.
  const staged: { memory: ExtractedMemory; embedding: Uint8Array }[] = [];
  for (const memory of outcome.memories) {
    const text = `${memory.title}. ${memory.content}${memory.context ? ` Context: ${memory.context}` : ""}`;
    const vector = await generateEmbeddingSafely(deps.embedding, text, {
      onAttempt: embeddingLedgerHook(db, context),
    });
    staged.push({ memory, embedding: embeddingToBytes(vector) });
  }

  withTransaction(db, () => {
    for (const { memory, embedding } of staged) {
      insertMemory(db, newId(), conversation.id, memory, embedding, deps.now());
    }
    updateMetadata(db, conversation.id, (metadata) => {
      markThrough(metadata, piece);
      metadata.learning_status = outcome.status.status;
    });
  });

  // Best-effort and de-duplicated by title, as on the terminal.
  const tasks = await persistExtractedTasks(db, deps.llm, messages, {
    journey: conversation.journey,
    userName: deps.userName,
    now: deps.now,
    id: newId,
    onLlmCall: chatLedgerHook(db, "task_extraction", context),
  });
  return { memories: staged.length, tasks: tasks.length };
}

/** A failed piece: counted, and skipped at the terminal's maximum. */
function recordFailure(
  db: WritableDatabase,
  conversationId: string,
  piece: readonly StoredMessage[],
): "failed" | "skipped" {
  let outcome: "failed" | "skipped" = "failed";
  withTransaction(db, () => {
    updateMetadata(db, conversationId, (metadata) => {
      const attempts = Math.trunc(Number(metadata.learning_attempts ?? 0)) + 1;
      if (attempts >= DEFAULT_EXTRACTION_MAX_ATTEMPTS) {
        outcome = "skipped";
        markThrough(metadata, piece);
        metadata.learning_status = "skipped";
        metadata.learning_skipped_messages =
          Math.trunc(Number(metadata.learning_skipped_messages ?? 0)) + piece.length;
      } else {
        metadata.learning_attempts = attempts;
        metadata.learning_status = "llm_failed";
      }
    });
  });
  return outcome;
}

/**
 * Learn from the newest stretch of the host's idle Conversations: memories and
 * tasks, and the watermark moved past what was learned. See the module comment.
 */
export async function learnFromConversations(
  dbPath: string,
  request: LearnRequest,
  options: LearnOptions = {},
): Promise<LearnReport> {
  const surface = request?.interface;
  if (typeof surface !== "string" || !INTERFACE.test(surface)) {
    throw new LearningRejectedError("invalid_request");
  }
  const idleMinutes = boundedInteger(
    request.idleMinutes,
    STALE_ORPHAN_THRESHOLD_MINUTES,
    MAX_IDLE_MINUTES,
  );
  const limit = boundedInteger(
    request.limit,
    DEFAULT_MAINTENANCE_MAX_EXTRACTIONS,
    LEARNING_MAX_LIMIT,
  );
  const report = inspectMigrationState(dbPath);
  if (report.state !== "current") throw new DatabaseNotCurrentError(report);

  const now = options.now ?? nowIso;
  const threshold = new Date(Date.parse(now()) - idleMinutes * 60_000).toISOString();

  // What there is to learn, decided on a read-only handle: a quiet call opens
  // nothing for writing and needs no key.
  const read = openDatabaseReadOnly(dbPath);
  const plan: { conversation: Candidate; pieces: StoredMessage[][] }[] = [];
  try {
    for (const candidate of idleCandidates(read, surface, threshold)) {
      const stretch = messagesAfter(read, candidate.id, readMark(metadataDict(candidate.metadata)));
      const pieces = cutPieces(stretch);
      if (pieces.length > 0) plan.push({ conversation: candidate, pieces });
    }
  } finally {
    read.close();
  }
  const learned: LearnReport = {
    pieces: 0,
    memories: 0,
    tasks: 0,
    failed: 0,
    skipped: 0,
    waiting: 0,
  };
  if (plan.length === 0) return learned;

  const apiKey = typeof options.apiKey === "string" ? options.apiKey.trim() : "";
  if (!apiKey && !options.providers) throw new LearningRejectedError("no_key");
  const env = learningProviderEnv(apiKey);
  const llm = options.providers?.llm ?? new LiveLlmProvider({ env });
  const embedding = options.providers?.embedding ?? new LiveEmbeddingProvider({ env });

  const db = openLiveWriteDatabase(dbPath);
  try {
    const userName = resolveUserName(db);
    let budget = limit;
    for (const { conversation, pieces } of plan) {
      let done = 0;
      for (const piece of pieces) {
        if (budget === 0) break;
        budget -= 1;
        try {
          const outcome = await learnPiece(db, conversation, piece, {
            llm,
            embedding,
            now,
            userName,
          });
          learned.pieces += 1;
          learned.memories += outcome.memories;
          learned.tasks += outcome.tasks;
        } catch {
          if (recordFailure(db, conversation.id, piece) === "failed") {
            learned.failed += 1;
            break;
          }
          learned.skipped += 1;
        }
        done += 1;
      }
      if (done < pieces.length) learned.waiting += 1;
    }
  } finally {
    db.close();
  }
  return learned;
}
