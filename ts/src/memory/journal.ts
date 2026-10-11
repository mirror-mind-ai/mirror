/**
 * `journal` — CV22.DS7.US11 plateau 3.
 *
 * Records a journal entry: classify it through the model, then write the memory
 * with its embedding. CR068 found this leaf unowned — US2 sent it to US5, US5
 * was re-scoped without it, and the ledger reported the family `3/3 done` while
 * Python answered every call.
 *
 * Graded by `ts/test/goldens/journal.golden.json`. The corpus pins several
 * Python behaviours that a reasonable port gets wrong:
 *
 *   - **AI-24 layer coercion.** A model layer outside `self|ego|shadow` becomes
 *     `ego` rather than reaching the write unchecked (CV9.E2.S23/S25).
 *   - **The non-JSON fallback** is `{title: content[:60], layer: "ego",
 *     tags: []}`, and the 60 is CODE POINTS.
 *   - **`", ".join(tags)` over a STRING iterates characters.** When the model
 *     returns `"not-a-list"`, Python's receipt reads `n, o, t, -, a, ...`. It
 *     looks like a bug and is reproduced deliberately: the receipt is what a
 *     user sees, and the row stores the same odd value.
 *   - **The embedding is generated BEFORE the row is inserted**, so a failing
 *     embedding persists NOTHING — while the classification and the (unpriced)
 *     embedding ledger rows already exist. Insert-then-embed passes every other
 *     case and fails this one.
 */

import type { WritableDatabase } from "#db/database.ts";
import { createMemoryRow } from "#memory/memoryWrite.ts";
import { addEmbeddingProvenance } from "#providers/embedding.ts";
import { memoryEmbedText } from "#soul/harvest.ts";
import { pythonJsonDumpsEnsureAscii } from "#util/pyGenerators.ts";
import { sliceCodePoints } from "#util/pythonText.ts";

/** Python `VALID_MEMORY_LAYERS`. */
const VALID_MEMORY_LAYERS = new Set(["self", "ego", "shadow"]);

/** Python's `layer_labels`, with the raw layer as its own fallback. */
const LAYER_LABELS: Record<string, string> = {
  self: "Self (identity)",
  ego: "Ego (operational)",
  shadow: "Shadow (tension)",
};

export interface JournalClassification {
  title: string;
  layer: string;
  tags: unknown;
}

/**
 * Python `classify_journal_entry`'s post-processing, given a raw model
 * response body. Kept separate from transport so it can be graded directly.
 */
export function interpretJournalClassification(
  responseContent: string,
  content: string,
  parseJson: (raw: string) => unknown,
): JournalClassification {
  const data = parseJson(responseContent);
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    // Python: `{"title": content[:60], "layer": "ego", "tags": []}`.
    return { title: sliceCodePoints(content, 60), layer: "ego", tags: [] };
  }
  const record = data as Record<string, unknown>;
  const rawLayer = "layer" in record ? record.layer : "ego";
  const layer =
    typeof rawLayer === "string" && VALID_MEMORY_LAYERS.has(rawLayer) ? rawLayer : "ego";
  const title = "title" in record ? record.title : sliceCodePoints(content, 60);
  return {
    title: typeof title === "string" ? title : String(title),
    layer,
    tags: "tags" in record ? record.tags : [],
  };
}

/**
 * Python `", ".join(tags)`.
 *
 * `str.join` iterates its argument. Over a list that is the elements; over a
 * STRING it is the characters, which is why a model returning `"not-a-list"`
 * yields `n, o, t, -, a, -, l, i, s, t`. Reproduced, not corrected.
 *
 * The CLI reaches this only after `json.loads(memory.tags)`, so the value seen
 * here is whatever round-tripped through the stored JSON.
 */
export function renderJournalTags(tags: unknown): string {
  if (typeof tags === "string") return Array.from(tags).join(", ");
  if (Array.isArray(tags))
    return tags.map((tag) => (typeof tag === "string" ? tag : String(tag))).join(", ");
  return "";
}

/** Python: `json.dumps(tags) if tags else None` — an empty list stores NULL. */
function storedTags(tags: unknown): string | null {
  if (tags === null || tags === undefined) return null;
  if (Array.isArray(tags) && tags.length === 0) return null;
  if (typeof tags === "string" && tags.length === 0) return null;
  return pythonJsonDumpsEnsureAscii(tags);
}

export interface AddJournalInput {
  content: string;
  journey?: string | null;
  classification: JournalClassification;
}

export interface AddJournalDeps {
  newId: () => string;
  nowIso: string;
  /** Throws when the provider fails; called BEFORE the row is inserted. */
  embed: (text: string) => Uint8Array;
}

export interface AddJournalResult {
  memoryId: string;
  title: string;
  layer: string;
  tags: unknown;
}

/**
 * Python `MemoryService.add_journal` → `add_memory` for the journal path.
 *
 * The embedding is computed first, deliberately: `add_memory` embeds before it
 * builds the row, so a provider failure leaves no memory behind.
 */
export function addJournal(
  db: WritableDatabase,
  input: AddJournalInput,
  deps: AddJournalDeps,
): AddJournalResult {
  const { title, layer, tags } = input.classification;

  const embedding = deps.embed(memoryEmbedText(title, input.content, null));

  const memoryId = deps.newId();
  createMemoryRow(db, {
    id: memoryId,
    conversationId: null,
    memoryType: "journal",
    layer,
    title,
    content: input.content,
    context: null,
    journey: input.journey ?? null,
    persona: null,
    tags: storedTags(tags),
    createdAt: deps.nowIso,
    embedding,
    metadata: addEmbeddingProvenance(null),
  });

  return { memoryId, title, layer, tags };
}

/** Python's printed receipt, line for line. */
export function renderJournalReceipt(
  result: AddJournalResult,
  journey: string | null | undefined,
  storedTagsJson: string | null,
): string {
  const parsedTags: unknown = storedTagsJson === null ? [] : safeJsonParse(storedTagsJson);
  const lines = [
    "📓 Journal entry recorded",
    `   Title: ${result.title}`,
    `   Layer: ${LAYER_LABELS[result.layer] ?? result.layer}`,
    `   Tags: ${renderJournalTags(parsedTags)}`,
  ];
  if (journey) lines.push(`   Journey: ${journey}`);
  lines.push(`   ID: ${result.memoryId.slice(0, 8)}`);
  return `${lines.join("\n")}\n`;
}

/** Python's `try: json.loads(...) except (JSONDecodeError, TypeError): []`. */
function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
