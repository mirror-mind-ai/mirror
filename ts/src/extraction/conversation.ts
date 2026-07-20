import type { LlmProvider } from "../providers/llm.ts";
import {
  fenceTranscript,
  MAX_MEMORIES_PER_CONVERSATION,
  MAX_TASKS_PER_CONVERSATION,
  sanitizeExtracted,
} from "./fencing.ts";
import { parseJsonResponse } from "./json.ts";

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

export async function extractMemories(
  provider: LlmProvider,
  messages: readonly ExtractionMessage[],
  options: { persona?: string | null; journey?: string | null; userName?: string } = {},
): Promise<ExtractedMemory[]> {
  if (messages.length === 0) return [];
  const response = await provider.complete({
    role: "extraction",
    prompt: fenceTranscript(formatTranscript(messages, options.userName ?? "User")),
    temperature: 0.3,
  });
  const data = parseJsonResponse(response.content);
  if (!Array.isArray(data)) return [];
  const memories: ExtractedMemory[] = [];
  for (const item of data) {
    const memory = toExtractedMemory(item, options);
    if (memory) memories.push(memory);
  }
  return sanitizeExtracted(memories, MAX_MEMORIES_PER_CONVERSATION).kept;
}

export async function extractTasks(
  provider: LlmProvider,
  messages: readonly ExtractionMessage[],
  options: { journey?: string | null; userName?: string } = {},
): Promise<ExtractedTask[]> {
  if (messages.length === 0) return [];
  const response = await provider.complete({
    role: "task_extraction",
    prompt: fenceTranscript(formatTranscript(messages, options.userName ?? "User")),
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
      prompt: `${formatCandidates(candidates)}\n${formatExisting(existing)}`,
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

function formatCandidates(candidates: readonly ExtractedMemory[]): string {
  return candidates
    .map(
      (candidate, index) =>
        `${index + 1}. **${candidate.title}** (${candidate.memory_type}/${candidate.layer})\n   Content: ${candidate.content}`,
    )
    .join("\n\n");
}

function formatExisting(existing: readonly ExistingMemoryForCuration[]): string {
  return existing
    .map(
      (memory) =>
        `- **${memory.title}** (${memory.memory_type}/${memory.layer})\n  ${memory.content.slice(0, 200)}`,
    )
    .join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
