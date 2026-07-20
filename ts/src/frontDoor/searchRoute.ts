import type { WritableDatabase } from "../db/database.ts";
import { requireString } from "../db/rowDecode.ts";
import { loadReplayEmbeddingProvider } from "../providers/embedding.ts";
import type { FreshSearchResult } from "../search/memorySearch.ts";
import { searchMemoriesWithStatus } from "../search/memorySearch.ts";
import { optionValue } from "./args.ts";
import { ICONS } from "./render/icons.ts";
import { tagsText } from "./render/memories.ts";

// Mirrors Python's cli/memories.py degraded_note wording exactly (AI-04),
// including under a degraded search with zero results.
const DEGRADED_NOTE =
  "⚠ Degraded: lexical-only search (embedding unavailable — offline or no API key).";

export interface SearchMemoryRow {
  id: string;
  memory_type: string;
  layer: string;
  title: string;
  content: string;
  created_at: string;
  journey: string | null;
  tags: string | null;
}

export async function runMemorySearchRoute(
  db: WritableDatabase,
  args: readonly string[],
): Promise<string> {
  const query = optionValue(args, "--search");
  if (!query) throw new Error("memories --search requires a query");
  const replayPath = process.env.MIRROR_TS_SEARCH_EMBEDDING_REPLAY;
  if (!replayPath)
    throw new Error("MIRROR_TS_SEARCH_EMBEDDING_REPLAY is required for TS search route");
  const provider = await loadReplayEmbeddingProvider(replayPath);
  const limit = Number(optionValue(args, "--limit") ?? 20);
  const { results, degraded } = await searchMemoriesWithStatus(db, {
    query,
    limit,
    memoryType: optionValue(args, "--type"),
    layer: optionValue(args, "--layer"),
    journey: optionValue(args, "--journey"),
    provider,
  });
  const rows = memoriesById(
    db,
    results.map((result) => result.id),
  );
  return formatSearchResults(query, results, rows, degraded);
}

/**
 * Pure rendering of a fresh-search outcome (AI-04). Split out from
 * `runMemorySearchRoute` so the degraded/normal render branches are directly
 * unit-testable without a database or a live-failing embedding provider (none
 * exists yet -- see CR037 plan).
 */
export function formatSearchResults(
  query: string,
  results: readonly FreshSearchResult[],
  rows: ReadonlyMap<string, SearchMemoryRow>,
  degraded: boolean,
): string {
  if (results.length === 0) {
    return degraded ? `${DEGRADED_NOTE}\n` : "No memories found.\n";
  }
  const lines: string[] = [];
  if (degraded) {
    lines.push(`${DEGRADED_NOTE} Ranked by keyword match.`, "");
  }
  lines.push(`🔍 Search: "${query}" (${results.length} results)`, "");
  for (const result of results) {
    const memory = rows.get(result.id);
    if (!memory) continue;
    const icon = ICONS[memory.memory_type] ?? "•";
    const date = memory.created_at ? memory.created_at.slice(0, 10) : "?";
    const journey = memory.journey ? ` 🧭 ${memory.journey}` : "";
    const tags = tagsText(memory.tags);
    lines.push(`${icon} **${memory.title}** (score: ${result.score.toFixed(3)})`);
    lines.push(
      `  ${date} | \`${memory.id.slice(0, 8)}\` | ${memory.memory_type} [${memory.layer}]${journey}`,
    );
    lines.push(`  ${memory.content.slice(0, 200)}`);
    if (tags) lines.push(`  🏷 ${tags}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function memoriesById(db: WritableDatabase, ids: readonly string[]): Map<string, SearchMemoryRow> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, memory_type, layer, title, content, created_at, journey, tags FROM memories ` +
        `WHERE id IN (${placeholders})`,
    )
    .all(...ids);
  return new Map(
    rows.map((row) => [
      requireString(row, "id"),
      {
        id: requireString(row, "id"),
        memory_type: requireString(row, "memory_type"),
        layer: requireString(row, "layer"),
        title: requireString(row, "title"),
        content: requireString(row, "content"),
        created_at: requireString(row, "created_at"),
        journey: typeof row.journey === "string" ? row.journey : null,
        tags: typeof row.tags === "string" ? row.tags : null,
      },
    ]),
  );
}
