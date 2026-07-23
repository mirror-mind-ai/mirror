import type { WritableDatabase } from "../db/database.ts";
import { embeddingToBytes } from "../db/decode.ts";
import { optionalString, requireString } from "../db/rowDecode.ts";
import {
  curateAgainstExisting,
  type ExistingMemoryForCuration,
  type ExtractedMemory,
  type ExtractionMessage,
  type ExtractionStatus,
  extractMemoriesWithStatus,
  extractTasks,
  formatTranscript,
  naiveSummary,
} from "../extraction/conversation.ts";
import { createMemoryRow } from "../memory/memoryWrite.ts";
import { logLlmCall } from "../observability/llmCalls.ts";
import { resolveEmbeddingModel, resolveExtractionModel } from "../providers/config.ts";
import {
  addEmbeddingProvenance,
  type EmbeddingAttemptInfo,
  type EmbeddingProvider,
  generateEmbeddingSafely,
} from "../providers/embedding.ts";
import type { LlmProvider } from "../providers/llm.ts";
import { newId, nowIso } from "../util/pyGenerators.ts";

export interface ConversationExtractionOptions {
  llm: LlmProvider;
  embeddings: EmbeddingProvider;
  now?: () => string;
  id?: () => string;
  summarize?: boolean;
  twoPass?: boolean;
  curationExisting?: readonly ExistingMemoryForCuration[];
}

export interface ConversationExtractionResult {
  memoryIds: string[];
  taskIds: string[];
  extracted: number;
}

interface ConversationRow {
  id: string;
  persona: string | null;
  journey: string | null;
  metadata: string | null;
}

export async function runConversationExtraction(
  db: WritableDatabase,
  conversationId: string,
  options: ConversationExtractionOptions,
): Promise<ConversationExtractionResult> {
  const conv = getConversation(db, conversationId);
  const messages = getMessages(db, conversationId);
  if (!conv?.journey || messages.length < 4) {
    return { memoryIds: [], taskIds: [], extracted: 0 };
  }

  const now = options.now ?? nowIso;
  const id = options.id ?? newId;
  const userName = resolveUserName(db);

  let extractedMemories: ExtractedMemory[];
  let extractionStatus: ExtractionStatus;
  try {
    const outcome = await extractMemoriesWithStatus(options.llm, messages, {
      persona: conv.persona,
      journey: conv.journey,
      userName,
    });
    extractedMemories = outcome.memories;
    extractionStatus = outcome.status;
  } catch (error) {
    // Mirrors Python's exception path (AI-10, CV9.E2.S16): record why, then
    // still propagate. Deliberately does NOT set `extracted` -- a failed
    // attempt is not "done" -- and re-throws the original error unmodified.
    const failureMetadata = metadataDict(conv.metadata);
    failureMetadata.extraction_status = "llm_failed";
    db.prepare("UPDATE conversations SET metadata = ? WHERE id = ?").run(
      JSON.stringify(failureMetadata),
      conversationId,
    );
    throw error;
  }

  if (options.twoPass && extractedMemories.length > 0) {
    extractedMemories = await curateAgainstExisting(
      options.llm,
      extractedMemories,
      options.curationExisting ?? [],
    );
  }

  const taskIds = await persistExtractedTasks(db, options.llm, messages, {
    journey: conv.journey,
    userName,
    now,
    id,
  });

  const summaryText =
    options.summarize === false
      ? naiveSummary(messages)
      : await replayedSummary(options.llm, messages, userName);
  const finalSummary = summaryText || naiveSummary(messages);
  if (finalSummary) {
    // Logged to the ledger (AI-09/D-003), but NOT provenance-stamped:
    // conversation_embeddings has no metadata column, matching Python's own
    // narrower scope (add_embedding_provenance is called from
    // add_memory/add_attachment only, never from the summary path).
    const summaryEmbedding = await generateEmbeddingSafely(options.embeddings, finalSummary, {
      onAttempt: logEmbeddingAttempt(db, conversationId),
    });
    db.prepare(
      `INSERT INTO conversation_embeddings (conversation_id, summary_embedding) VALUES (?, ?) ` +
        `ON CONFLICT(conversation_id) DO UPDATE SET summary_embedding = excluded.summary_embedding`,
    ).run(conversationId, embeddingToBytes(summaryEmbedding));
    db.prepare("UPDATE conversations SET summary = ? WHERE id = ?").run(
      finalSummary.slice(0, 1000),
      conversationId,
    );
  }

  const memoryIds: string[] = [];
  for (const memory of extractedMemories) {
    const memoryId = id();
    const embeddingText = `${memory.title}. ${memory.content}${memory.context ? ` Context: ${memory.context}` : ""}`;
    const embedding = await generateEmbeddingSafely(options.embeddings, embeddingText, {
      onAttempt: logEmbeddingAttempt(db, conversationId),
    });
    insertMemory(db, memoryId, conversationId, memory, embeddingToBytes(embedding), now());
    memoryIds.push(memoryId);
  }

  const metadata = metadataDict(conv.metadata);
  metadata.extracted = true;
  metadata.extraction_status = extractionStatus.status;
  if (
    extractionStatus.dropped &&
    Object.values(extractionStatus.dropped).some((count) => count > 0)
  ) {
    metadata.extraction_dropped = extractionStatus.dropped;
  }
  db.prepare("UPDATE conversations SET metadata = ? WHERE id = ?").run(
    JSON.stringify(metadata),
    conversationId,
  );

  return { memoryIds, taskIds, extracted: memoryIds.length };
}

async function persistExtractedTasks(
  db: WritableDatabase,
  llm: LlmProvider,
  messages: readonly ExtractionMessage[],
  options: { journey: string; userName: string; now: () => string; id: () => string },
): Promise<string[]> {
  try {
    const tasks = await extractTasks(llm, messages, {
      journey: options.journey,
      userName: options.userName,
    });
    const inserted: string[] = [];
    for (const task of tasks) {
      const existing = db
        .prepare("SELECT id FROM tasks WHERE title LIKE ? AND journey = ? ORDER BY created_at DESC")
        .all(`%${task.title}%`, task.journey ?? options.journey);
      if (existing.length > 0) continue;
      const taskId = options.id();
      const now = options.now();
      db.prepare(
        `INSERT INTO tasks ` +
          `(id, journey, title, status, due_date, scheduled_at, time_hint, stage, context, source, created_at, updated_at, completed_at, metadata) ` +
          `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        taskId,
        task.journey,
        task.title,
        "todo",
        task.due_date,
        null,
        null,
        task.stage,
        task.context,
        "conversation",
        now,
        now,
        null,
        null,
      );
      inserted.push(taskId);
    }
    return inserted;
  } catch {
    return [];
  }
}

async function replayedSummary(
  llm: LlmProvider,
  messages: readonly ExtractionMessage[],
  userName: string,
): Promise<string> {
  try {
    const response = await llm.complete({
      role: "summary",
      prompt: formatTranscript(messages, userName),
      model: resolveExtractionModel(),
      temperature: 0.3,
    });
    return response.content.trim();
  } catch {
    return naiveSummary(messages);
  }
}

function getConversation(db: WritableDatabase, conversationId: string): ConversationRow | null {
  const row = db
    .prepare("SELECT id, persona, journey, metadata FROM conversations WHERE id = ?")
    .get(conversationId);
  if (!row) return null;
  return {
    id: requireString(row, "id"),
    persona: optionalString(row, "persona"),
    journey: optionalString(row, "journey"),
    metadata: optionalString(row, "metadata"),
  };
}

function getMessages(db: WritableDatabase, conversationId: string): ExtractionMessage[] {
  return db
    .prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(conversationId)
    .map((row) => ({ role: requireString(row, "role"), content: requireString(row, "content") }));
}

function resolveUserName(db: WritableDatabase): string {
  const row = db
    .prepare("SELECT content FROM identity WHERE layer = ? AND key = ? LIMIT 1")
    .get("user", "identity");
  const content = row ? optionalString(row, "content") : null;
  const match = content?.match(
    /(?:You are talking to|Você está falando com) ([A-Z][a-zA-Záéíóúãõ]+)/,
  );
  return match?.[1] ?? "User";
}

/** Wires generateEmbeddingSafely's onAttempt hook to the llm_calls ledger
 * (AI-09/D-003), reusing CR040's fail-soft logLlmCall unchanged -- "a vector
 * is not text", so response is always empty; the input text itself gets the
 * same metadata-mode body-withholding logLlmCall already applies to consult. */
function logEmbeddingAttempt(
  db: WritableDatabase,
  conversationId: string,
): (info: EmbeddingAttemptInfo) => void {
  return (info) => {
    logLlmCall(db, {
      role: "embedding",
      model: resolveEmbeddingModel(),
      prompt: info.text,
      response: "",
      latencyMs: info.latencyMs,
      conversationId,
    });
  };
}

function insertMemory(
  db: WritableDatabase,
  id: string,
  conversationId: string,
  memory: ExtractedMemory,
  embedding: Uint8Array,
  createdAt: string,
): void {
  createMemoryRow(db, {
    id,
    conversationId,
    memoryType: memory.memory_type,
    layer: memory.layer,
    title: memory.title,
    content: memory.content,
    context: memory.context,
    journey: memory.journey,
    persona: memory.persona,
    tags: memory.tags.length > 0 ? JSON.stringify(memory.tags) : null,
    createdAt,
    embedding,
    metadata: addEmbeddingProvenance(null),
  });
}

function metadataDict(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
