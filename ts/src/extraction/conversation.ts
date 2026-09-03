import { resolveExtractionModel } from "#providers/config.ts";
import type { LlmProvider } from "#providers/llm.ts";
import {
  fenceTranscript,
  MAX_MEMORIES_PER_CONVERSATION,
  MAX_TASKS_PER_CONVERSATION,
  type SanitizeDropped,
  sanitizeExtracted,
} from "./fencing.ts";
import { parseJsonResponse } from "./json.ts";
import { CURATION_PROMPT, EXTRACTION_PROMPT, TASK_EXTRACTION_PROMPT } from "./prompts.ts";

export interface ExtractionMessage {
  role: string;
  content: string;
}

export interface ExtractedMemory {
  title: string;
  content: string;
  context: string | null;
  memory_type: string;
  layer: string;
  tags: string[];
  journey: string | null;
  persona: string | null;
}

export interface ExistingMemoryForCuration {
  title: string;
  content: string;
  memory_type: string;
  layer: string;
}

export interface ExtractedTask {
  title: string;
  due_date: string | null;
  journey: string | null;
  stage: string | null;
  context: string | null;
}

export function formatTranscript(
  messages: readonly ExtractionMessage[],
  userName = "User",
): string {
  return messages
    .map((message) => {
      const role = message.role === "user" ? userName : "Mirror";
      return `**${role}:** ${message.content}`;
    })
    .join("\n\n");
}

export function naiveSummary(messages: readonly ExtractionMessage[]): string {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => message.content.slice(0, 500))
    .join(" ")
    .slice(0, 2000);
}

export type ExtractionStatusValue = "parse_failed" | "no_signal" | "ok";

export interface ExtractionStatus {
  status: ExtractionStatusValue;
  dropped?: SanitizeDropped;
}

export interface ExtractMemoriesOutcome {
  memories: ExtractedMemory[];
  status: ExtractionStatus;
}

/**
 * Extracts memories and reports why the result is what it is, mirroring
 * Python's `extract_memories(status=...)` (AI-10, CV9.E2.S16). A caller can
 * distinguish unreadable model output (parse_failed) from a genuinely empty
 * result (no_signal) instead of both looking identical to an empty array.
 *
 * `"llm_failed"` is deliberately not part of `ExtractionStatusValue`: this
 * function cannot structurally report it -- that value only exists when the
 * call throws, which is the orchestration layer's (`runConversationExtraction`)
 * concern, not this function's return shape.
 *
 * Documented divergence: Python's status dict is left untouched (no key set
 * at all) for a truly-empty messages call -- a mutate-if-present out-param
 * behavior this return-based design cannot replicate exactly. This returns
 * `{ status: "no_signal" }` instead. Zero observable impact:
 * `runConversationExtraction` already guards `messages.length < 4` before
 * ever calling this, so the path is unreachable from the real orchestration
 * call site.
 */
export async function extractMemoriesWithStatus(
  provider: LlmProvider,
  messages: readonly ExtractionMessage[],
  options: { persona?: string | null; journey?: string | null; userName?: string } = {},
): Promise<ExtractMemoriesOutcome> {
  if (messages.length === 0) return { memories: [], status: { status: "no_signal" } };
  const response = await provider.complete({
    role: "extraction",
    prompt: buildExtractionPrompt(messages, options.userName ?? "User"),
    model: resolveExtractionModel(),
    temperature: 0.3,
  });
  const data = parseJsonResponse(response.content);
  if (!Array.isArray(data)) {
    return { memories: [], status: { status: "parse_failed" } };
  }
  const memories: ExtractedMemory[] = [];
  for (const item of data) {
    const memory = toExtractedMemory(item, options);
    if (memory) memories.push(memory);
  }
  const { kept, dropped } = sanitizeExtracted(memories, MAX_MEMORIES_PER_CONVERSATION);
  return { memories: kept, status: { status: kept.length > 0 ? "ok" : "no_signal", dropped } };
}

/** Thin, non-breaking wrapper over `extractMemoriesWithStatus`, returning only
 * the memories array for existing callers -- mirrors Python's `extract_memories`
 * default (`status=None`) shape. */
export async function extractMemories(
  provider: LlmProvider,
  messages: readonly ExtractionMessage[],
  options: { persona?: string | null; journey?: string | null; userName?: string } = {},
): Promise<ExtractedMemory[]> {
  return (await extractMemoriesWithStatus(provider, messages, options)).memories;
}

export async function extractTasks(
  provider: LlmProvider,
  messages: readonly ExtractionMessage[],
  options: { journey?: string | null; userName?: string } = {},
): Promise<ExtractedTask[]> {
  if (messages.length === 0) return [];
  const response = await provider.complete({
    role: "task_extraction",
    prompt: buildTaskExtractionPrompt(messages, options.userName ?? "User"),
    model: resolveExtractionModel(),
    temperature: 0.3,
  });
  const data = parseJsonResponse(response.content);
  if (!Array.isArray(data)) return [];
  const tasks: ExtractedTask[] = [];
  for (const item of data) {
    const task = toExtractedTask(item, options.journey ?? null);
    if (task) tasks.push(task);
  }
  return tasks.length > MAX_TASKS_PER_CONVERSATION
    ? tasks.slice(0, MAX_TASKS_PER_CONVERSATION)
    : tasks;
}

export async function curateAgainstExisting(
  provider: LlmProvider,
  candidates: readonly ExtractedMemory[],
  existing: readonly ExistingMemoryForCuration[],
): Promise<ExtractedMemory[]> {
  if (candidates.length === 0) return [];
  if (existing.length === 0) return [...candidates];
  try {
    const response = await provider.complete({
      role: "curation",
      prompt: buildCurationPrompt(candidates, existing),
      model: resolveExtractionModel(),
      temperature: 0.2,
    });
    const data = parseJsonResponse(response.content);
    if (!Array.isArray(data)) return [...candidates];
    const curated: ExtractedMemory[] = [];
    for (const item of data) {
      const memory = toExtractedMemory(item, {});
      if (memory) curated.push(memory);
    }
    return sanitizeExtracted(curated, MAX_MEMORIES_PER_CONVERSATION).kept;
  } catch {
    return [...candidates];
  }
}

export function toExtractedMemory(
  item: unknown,
  defaults: { persona?: string | null; journey?: string | null },
): ExtractedMemory | null {
  if (!isRecord(item)) return null;
  if (
    typeof item.title !== "string" ||
    typeof item.content !== "string" ||
    typeof item.memory_type !== "string"
  ) {
    return null;
  }
  return {
    title: item.title,
    content: item.content,
    context: typeof item.context === "string" ? item.context : null,
    memory_type: item.memory_type,
    layer: typeof item.layer === "string" ? item.layer : "ego",
    tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag)) : [],
    journey: typeof item.journey === "string" ? item.journey : (defaults.journey ?? null),
    persona: typeof item.persona === "string" ? item.persona : (defaults.persona ?? null),
  };
}

function toExtractedTask(item: unknown, journey: string | null): ExtractedTask | null {
  if (!isRecord(item) || typeof item.title !== "string") return null;
  return {
    title: item.title,
    due_date: typeof item.due_date === "string" ? item.due_date : null,
    journey: typeof item.journey === "string" ? item.journey : journey,
    stage: typeof item.stage === "string" ? item.stage : null,
    context: typeof item.context === "string" ? item.context : null,
  };
}

/**
 * Python's `_format_candidates`. Each candidate emits its header line, a
 * `Content:` line, an optional `Context:` line, and a trailing blank entry, all
 * joined with newlines -- so the block ends with a newline. The optional
 * context line and that trailing newline are both part of the prompt bytes.
 */
function formatCandidates(candidates: readonly ExtractedMemory[]): string {
  const lines: string[] = [];
  candidates.forEach((candidate, index) => {
    lines.push(
      `${index + 1}. **${candidate.title}** (${candidate.memory_type}/${candidate.layer})`,
    );
    lines.push(`   Content: ${candidate.content}`);
    if (candidate.context) lines.push(`   Context: ${candidate.context}`);
    lines.push("");
  });
  return lines.join("\n");
}

/** Python's `_format_existing`: header line, truncated body, trailing blank. */
function formatExisting(existing: readonly ExistingMemoryForCuration[]): string {
  const lines: string[] = [];
  for (const memory of existing) {
    lines.push(`- **${memory.title}** (${memory.memory_type}/${memory.layer})`);
    lines.push(`  ${memory.content.slice(0, 200)}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Assemble the exact extraction prompt Python sends.
 *
 * Note the asymmetry with the close-tail surfaces: extraction and task
 * extraction carry no post-fence reminder, while title/tags/summary do. That
 * is Python's shape, reproduced rather than harmonized.
 */
export function buildExtractionPrompt(
  messages: readonly ExtractionMessage[],
  userName = "User",
): string {
  return EXTRACTION_PROMPT + fenceTranscript(formatTranscript(messages, userName));
}

/** Assemble the exact task-extraction prompt Python sends. */
export function buildTaskExtractionPrompt(
  messages: readonly ExtractionMessage[],
  userName = "User",
): string {
  return TASK_EXTRACTION_PROMPT + fenceTranscript(formatTranscript(messages, userName));
}

/** Assemble the exact curation prompt Python sends, section headers included. */
export function buildCurationPrompt(
  candidates: readonly ExtractedMemory[],
  existing: readonly ExistingMemoryForCuration[],
): string {
  return (
    CURATION_PROMPT +
    "## Candidate memories (from this conversation)\n\n" +
    formatCandidates(candidates) +
    "\n## Existing similar memories (already stored)\n\n" +
    formatExisting(existing)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
