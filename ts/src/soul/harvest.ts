// CV22.DS7.US6 plateau 5 — the harvest journal, ported from
// `src/memory/services/soul_journal.py` and `cmd_harvest("save")`.
//
// This is the ONLY leaf of the Soul command that crosses the provider seam, and
// it crosses it more narrowly than it looks: `soul harvest save` calls
// `add_journal` with title, layer, AND tags all supplied, so Python's
// `classify_journal_entry` never runs and no LLM call happens. What remains is
// the embedding inside `add_memory`, which is why the save routes to TS only
// under the DS5 replay transport and the live call stays DS8's.
//
// The composition is pure and concentrates four Python string behaviors:
// code-point `len()` and slicing in the title, `rstrip(".!?")` as a character
// SET, `splitlines()`'s eleven boundaries in the blockquote, and `str.title()`
// for unknown transcript roles -- which capitalizes after every non-alphabetic
// character, so `tool_call` renders as `Tool_Call`.

import type { WritableDatabase } from "#db/database.ts";
import { createMemoryRow } from "#memory/memoryWrite.ts";
import { addEmbeddingProvenance } from "#providers/embedding.ts";
import { pythonJsonDumps, pythonJsonDumpsEnsureAscii } from "#util/pyGenerators.ts";
import {
  codePointLength,
  PYTHON_WHITESPACE_CLASS,
  pyRStrip,
  pySplitLines,
  pyStrip,
  sliceCodePoints,
} from "#util/pythonText.ts";
import { clearHarvestedFruit, getHarvestedFruit } from "./state.ts";

export class SoulHarvestError extends Error {}

export interface SoulJournalEntry {
  title: string;
  content: string;
  metadata: string;
}

export interface TranscriptMessage {
  role: string;
  content: string;
}

const TRANSCRIPT_LIMIT = 16;

/** Python `re.split(r"(?<=[.!?])\s+", fruit, maxsplit=1)[0]`. */
const SENTENCE_SPLIT = new RegExp(`(?<=[.!?])[${PYTHON_WHITESPACE_CLASS}]+`, "u");

/** Python `str.rstrip(".!?")`: a character SET, not a suffix. */
function rstripSentencePunctuation(text: string): string {
  return text.replace(/[.!?]+$/u, "");
}

/**
 * Python `str.title()`: capitalize the first cased character of every run, and
 * lowercase the rest -- where a run breaks at any NON-ALPHABETIC character. So
 * `tool_call` becomes `Tool_Call`, which `charAt(0).toUpperCase()` does not.
 */
export function pyTitle(text: string): string {
  let previousIsAlpha = false;
  let result = "";
  for (const character of text) {
    const isAlpha = /\p{Alphabetic}/u.test(character);
    result += isAlpha && !previousIsAlpha ? character.toUpperCase() : character.toLowerCase();
    previousIsAlpha = isAlpha;
  }
  return result;
}

/** Port of `_title_from_fruit`. */
export function titleFromFruit(fruit: string): string {
  const firstSentence = pyStrip(fruit.split(SENTENCE_SPLIT)[0] as string);
  const trimmed = pyStrip(rstripSentencePunctuation(firstSentence));
  // `len()` is code points; a UTF-16 `.length` cuts astral text elsewhere.
  if (codePointLength(trimmed) <= 80) return trimmed;
  return `${pyRStrip(sliceCodePoints(trimmed, 77))}...`;
}

/** Port of `_blockquote`. */
function blockquote(text: string): string {
  return pySplitLines(text)
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

/** Port of `_format_transcript`. */
function formatTranscript(messages: readonly TranscriptMessage[]): string {
  if (messages.length === 0) return "";
  const selected = messages.slice(0, TRANSCRIPT_LIMIT);
  const lines: string[] = [];
  for (const message of selected) {
    const role =
      message.role === "user"
        ? "User"
        : message.role === "assistant"
          ? "Mirror"
          : pyTitle(message.role);
    const content = pyStrip(message.content);
    if (!content) continue;
    lines.push(`### ${role}\n\n${content}`);
  }
  const omitted = messages.length - selected.length;
  if (omitted > 0) {
    lines.push(`_Mais ${omitted} mensagens ficaram preservadas na conversa originária._`);
  }
  return lines.join("\n\n");
}

/** Port of `compose_soul_harvest_journal`. */
export function composeSoulHarvestJournal(input: {
  fruit: string;
  conversationId?: string | null;
  messages?: readonly TranscriptMessage[];
}): SoulJournalEntry {
  const normalizedFruit = pyStrip(input.fruit);
  if (!normalizedFruit) throw new SoulHarvestError("harvested fruit must not be empty");

  const conversationId = input.conversationId ?? null;
  const sections = [
    "Esta entrada nasceu de uma colheita em Soul Mode.",
    `## Fruto\n\n${blockquote(normalizedFruit)}`,
  ];
  if (conversationId) {
    sections.push(`## Origem\n\n[Conversa originária](mirror://conversation/${conversationId})`);
  }
  const transcript = formatTranscript(input.messages ?? []);
  if (transcript) sections.push(`## Material vivo da conversa\n\n${transcript}`);

  return {
    title: titleFromFruit(normalizedFruit),
    content: `${sections.join("\n\n")}\n`,
    // Insertion-ordered and ensure_ascii=False. NOT sorted -- the identity
    // integration in the same story uses sort_keys=True, and unifying the two
    // would break one of them.
    metadata: pythonJsonDumps({
      format: "markdown",
      origin: {
        mode: "soul",
        conversation_id: conversationId,
        conversation_uri: conversationId ? `mirror://conversation/${conversationId}` : null,
      },
      harvested_fruit: normalizedFruit,
    }),
  };
}

/** Python `memory_embed_text`. */
export function memoryEmbedText(title: string, content: string, context: string | null): string {
  const text = `${title}. ${content}`;
  return context ? `${text} Context: ${context}` : text;
}

export const HARVEST_JOURNAL_TAGS = ["soul-mode", "harvested-fruit"];

export interface SaveHarvestedFruitResult {
  memoryId: string;
  entry: SoulJournalEntry;
  conversationId: string | null;
}

/** What the save is about to write, before anything external happens. */
export interface HarvestSavePlan {
  entry: SoulJournalEntry;
  conversationId: string | null;
  /** Exactly the text `add_memory` embeds, so the vector cannot drift from the row. */
  embedText: string;
}

/**
 * Read the harvested fruit and compose the journal entry, without writing or
 * embedding anything.
 *
 * Split out for CV22.DS8.US3: the embedding is an async, billable call that
 * has to happen between composing and persisting, and the text to embed is
 * only known after composition. One composition path, so the live route and
 * the write-parity probe cannot diverge.
 */
export function planHarvestSave(
  db: WritableDatabase,
  sessionId: string,
  readMessages: (conversationId: string) => TranscriptMessage[],
): HarvestSavePlan {
  const state = getHarvestedFruit(db, sessionId);
  if (!state.fruit) throw new SoulHarvestError("No harvested fruit.");

  const session = db
    .prepare("SELECT conversation_id FROM runtime_sessions WHERE session_id = ?")
    .get(state.sessionId) as { conversation_id: string | null } | undefined;
  const conversationId = session?.conversation_id ?? null;

  const entry = composeSoulHarvestJournal({
    fruit: state.fruit,
    conversationId,
    messages: conversationId ? readMessages(conversationId) : [],
  });

  return { entry, conversationId, embedText: memoryEmbedText(entry.title, entry.content, null) };
}

/**
 * Persist a planned harvest: insert the journal memory with an
 * already-computed vector, then clear the harvested fruit.
 *
 * The fruit is cleared LAST and only here, so a failed embedding leaves it in
 * place for a retry -- Python's ordering, where `generate_embedding` raises
 * out of `add_journal` before `clear_harvested_fruit` is reached.
 */
export function persistHarvestSave(
  db: WritableDatabase,
  plan: HarvestSavePlan,
  input: { sessionId: string; journey?: string | null },
  deps: { newId: () => string; nowIso: string; embedding: Uint8Array },
): SaveHarvestedFruitResult {
  const { entry, conversationId } = plan;
  const memoryId = deps.newId();
  createMemoryRow(db, {
    id: memoryId,
    conversationId,
    memoryType: "journal",
    layer: "self",
    title: entry.title,
    content: entry.content,
    context: null,
    journey: input.journey ?? null,
    persona: null,
    // Python: `json.dumps(tags)` with ensure_ascii at its DEFAULT (True),
    // unlike the metadata beside it. Unobservable at THIS call site, because
    // the tags are a fixed ASCII constant -- swapping in the ensure_ascii=False
    // form fails nothing. Kept in the oracle's form anyway: the rule belongs to
    // `services/memory.py`'s writer, and a future caller with non-ASCII tags
    // would make the difference real.
    tags: pythonJsonDumpsEnsureAscii(HARVEST_JOURNAL_TAGS),
    createdAt: deps.nowIso,
    embedding: deps.embedding,
    metadata: addEmbeddingProvenance(entry.metadata),
  });

  clearHarvestedFruit(db, input.sessionId, deps.nowIso);
  return { memoryId, entry, conversationId };
}

/**
 * Port of `cmd_harvest("save")`: compose, embed, insert, clear.
 *
 * `layer`, `title`, and `tags` are all supplied, so Python's journal classifier
 * is unreachable from this path -- the embedding is the only external call.
 * Kept as the synchronous whole for callers that already hold a vector source
 * (the write-parity probe); the live route composes and persists separately so
 * it can await a real embedding in between.
 */
export function saveHarvestedFruit(
  db: WritableDatabase,
  input: { sessionId: string; journey?: string | null },
  deps: {
    newId: () => string;
    nowIso: string;
    embed: (text: string) => Uint8Array;
    readMessages: (conversationId: string) => TranscriptMessage[];
  },
): SaveHarvestedFruitResult {
  const plan = planHarvestSave(db, input.sessionId, deps.readMessages);
  return persistHarvestSave(db, plan, input, {
    newId: deps.newId,
    nowIso: deps.nowIso,
    embedding: deps.embed(plan.embedText),
  });
}
