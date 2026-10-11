import { metadataDict } from "#conversation/closeTail.ts";
import type { WritableDatabase } from "#db/database.ts";
import { embeddingToBytes } from "#db/decode.ts";
import { optionalString, requireString } from "#db/rowDecode.ts";
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
  type OnLlmCall,
} from "#extraction/conversation.ts";
import { createMemoryRow } from "#memory/memoryWrite.ts";
import { chatLedgerHook, embeddingLedgerHook } from "#observability/ledgerHooks.ts";
import { resolveExtractionModel } from "#providers/config.ts";
import {
  addEmbeddingProvenance,
  type EmbeddingAttemptInfo,
  type EmbeddingProvider,
  generateEmbeddingSafely,
} from "#providers/embedding.ts";
import type { LlmProvider } from "#providers/llm.ts";
import { newId, nowIso, pythonJsonDumps, pythonJsonDumpsEnsureAscii } from "#util/pyGenerators.ts";

export interface ConversationExtractionOptions {
  llm: LlmProvider;
  embeddings: EmbeddingProvider;
  now?: () => string;
  id?: () => string;
  summarize?: boolean;
  twoPass?: boolean;
  curationExisting?: readonly ExistingMemoryForCuration[];
  /**
   * Model-call ledger (CV9.E2.S13/S14). Python's `_make_logger(role,
   * conversation_id)` writes one `llm_calls` row per successful call in
   * `extraction`, `curation`, `task_extraction`, and `summary`; the embedding
   * rows were already logged. Off by default so the DS5 unit surface stays
   * ledger-free; the front door turns it on.
   */
  ledger?: boolean;
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
  const ledger = options.ledger ? llmLedger(db, conversationId, now) : undefined;

  // A failure anywhere below propagates unmodified. Python records it -- the
  // `llm_failed` status, the attempt counter, and quarantine at the max --
  // OUTSIDE this orchestration, in `_run_extraction`; the port keeps that
  // accounting in `extractionRun.ts` for the same reason: the stored metadata
  // key order depends on it being written once, there, never partly here.
  const outcome = await extractMemoriesWithStatus(options.llm, messages, {
    persona: conv.persona,
    journey: conv.journey,
    userName,
    onLlmCall: ledger?.("extraction"),
  });
  let extractedMemories: ExtractedMemory[] = outcome.memories;
  const extractionStatus: ExtractionStatus = outcome.status;

  if (options.twoPass && extractedMemories.length > 0) {
    extractedMemories = await curateAgainstExisting(
      options.llm,
      extractedMemories,
      options.curationExisting ?? [],
      { onLlmCall: ledger?.("curation") },
    );
  }

  const taskIds = await persistExtractedTasks(db, options.llm, messages, {
    journey: conv.journey,
    userName,
    now,
    id,
    onLlmCall: ledger?.("task_extraction"),
  });

  const summaryText =
    options.summarize === false
      ? naiveSummary(messages)
      : await replayedSummary(options.llm, messages, userName, ledger?.("summary"));
  const finalSummary = summaryText || naiveSummary(messages);

  // Stage EVERY network embedding first -- the summary and each memory -- so a
  // failure leaves nothing persisted. The retry then starts clean and does not
  // duplicate rows or re-spend on embeddings (AI-03 / CV9.E2.S9).
  //
  // This mirrors Python's `_extract_and_persist` deliberately. The port
  // originally interleaved embed -> insert per memory, which is invisible
  // under replay -- replayed embeddings never fail -- and becomes a partial
  // write the moment a live provider is on the other end: memories 1..n-1
  // persisted, `extracted` unset, and a retry that inserts them a second time
  // with a second paid embedding each (CV22.DS8.US2 plan review).
  const summaryEmbeddingBytes = finalSummary
    ? embeddingToBytes(
        // Logged to the ledger (AI-09/D-003), but NOT provenance-stamped:
        // conversation_embeddings has no metadata column, matching Python's own
        // narrower scope (add_embedding_provenance is called from
        // add_memory/add_attachment only, never from the summary path).
        await generateEmbeddingSafely(options.embeddings, finalSummary, {
          onAttempt: logEmbeddingAttempt(db, conversationId, now),
        }),
      )
    : null;

  const stagedMemories: { memory: (typeof extractedMemories)[number]; embedding: Uint8Array }[] =
    [];
  for (const memory of extractedMemories) {
    const embeddingText = `${memory.title}. ${memory.content}${memory.context ? ` Context: ${memory.context}` : ""}`;
    const embedding = await generateEmbeddingSafely(options.embeddings, embeddingText, {
      onAttempt: logEmbeddingAttempt(db, conversationId, now),
    });
    stagedMemories.push({ memory, embedding: embeddingToBytes(embedding) });
  }

  // All embeddings succeeded -- only local writes remain.
  if (summaryEmbeddingBytes !== null && finalSummary) {
    db.prepare(
      `INSERT INTO conversation_embeddings (conversation_id, summary_embedding) VALUES (?, ?) ` +
        `ON CONFLICT(conversation_id) DO UPDATE SET summary_embedding = excluded.summary_embedding`,
    ).run(conversationId, summaryEmbeddingBytes);
    db.prepare("UPDATE conversations SET summary = ? WHERE id = ?").run(
      finalSummary.slice(0, 1000),
      conversationId,
    );
  }

  const memoryIds: string[] = [];
  for (const { memory, embedding } of stagedMemories) {
    const memoryId = id();
    insertMemory(db, memoryId, conversationId, memory, embedding, now());
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
    pythonJsonDumps(metadata),
    conversationId,
  );

  return { memoryIds, taskIds, extracted: memoryIds.length };
}

async function persistExtractedTasks(
  db: WritableDatabase,
  llm: LlmProvider,
  messages: readonly ExtractionMessage[],
  options: {
    journey: string;
    userName: string;
    now: () => string;
    id: () => string;
    onLlmCall?: OnLlmCall;
  },
): Promise<string[]> {
  try {
    const tasks = await extractTasks(llm, messages, {
      journey: options.journey,
      userName: options.userName,
      onLlmCall: options.onLlmCall,
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
  onLlmCall?: OnLlmCall,
): Promise<string> {
  try {
    const prompt = formatTranscript(messages, userName);
    const response = await llm.complete({
      role: "summary",
      prompt,
      model: resolveExtractionModel(),
      temperature: 0.3,
    });
    onLlmCall?.(response, prompt);
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

/**
 * The close tail's two ledger hooks. Roles match Python's `build_llm_logger`
 * roles so the `llm_calls` ledger agrees across engines; the orchestration's
 * clock stamps every row.
 */
function llmLedger(
  db: WritableDatabase,
  conversationId: string,
  now: () => string,
): (role: string) => OnLlmCall {
  return (role) => chatLedgerHook(db, role, { conversationId, now });
}

function logEmbeddingAttempt(
  db: WritableDatabase,
  conversationId: string,
  now: () => string,
): (info: EmbeddingAttemptInfo) => void {
  return embeddingLedgerHook(db, { conversationId, now });
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
    // Memory tags go through `services/memory.py`'s plain `json.dumps(tags)`,
    // which keeps `ensure_ascii=True` -- unlike conversation tags above.
    tags: memory.tags.length > 0 ? pythonJsonDumpsEnsureAscii(memory.tags) : null,
    createdAt,
    embedding,
    metadata: addEmbeddingProvenance(null),
  });
}
