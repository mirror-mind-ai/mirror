import type { WritableDatabase } from "#db/database.ts";
import { requireString } from "#db/rowDecode.ts";
import type { EmbeddingProvider } from "#providers/embedding.ts";
import { LiveEmbeddingProvider, loadReplayEmbeddingProvider } from "#providers/embedding.ts";
import { resolveProviderTransport } from "#providers/transport.ts";
import type { FreshSearchResult } from "#search/memorySearch.ts";
import { searchMemoriesWithStatus } from "#search/memorySearch.ts";
import { optionValue } from "./args.ts";
import { ICONS } from "./render/icons.ts";
import { tagsText } from "./render/memories.ts";
import { SEARCH_TRANSPORT } from "./routing.ts";

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

/**
 * Resolve the embedding provider by the same precedence the router used
 * (CV22.DS8.US1), so the route can never disagree with the routing decision
 * about which transport is in play.
 */
async function resolveSearchEmbeddingProvider(
  env: NodeJS.ProcessEnv = process.env,
): Promise<EmbeddingProvider> {
  const transport = resolveProviderTransport(env, SEARCH_TRANSPORT);
  if (transport.mode === "replay" && transport.replayPath) {
    return loadReplayEmbeddingProvider(transport.replayPath);
  }
  // Live. The provider resolves its config lazily, so a missing key surfaces
  // inside searchMemoriesWithStatus and degrades to lexical-only rather than
  // failing the command -- Python's behavior for an unconfigured install.
  return new LiveEmbeddingProvider({ env });
}

export interface MemorySearchRouteOptions {
  /** Receives a content-free degraded category for the front-door log. */
  onDegraded?: (detail: string) => void;
}

export async function runMemorySearchRoute(
  db: WritableDatabase,
  args: readonly string[],
  options: MemorySearchRouteOptions = {},
): Promise<string> {
  const query = optionValue(args, "--search");
  if (!query) throw new Error("memories --search requires a query");
  const provider = await resolveSearchEmbeddingProvider();
  const limit = Number(optionValue(args, "--limit") ?? 20);
  const { results, degraded, degradedKind } = await searchMemoriesWithStatus(db, {
    query,
    limit,
    memoryType: optionValue(args, "--type"),
    layer: optionValue(args, "--layer"),
    journey: optionValue(args, "--journey"),
    provider,
  });
  // A degraded live search is the one failure an operator has to diagnose
  // without a re-run, so the taxonomy class reaches the front-door log rather
  // than dying inside the degrade path. Category only -- never a message,
  // never the query (RS005/CR026).
  if (degraded && degradedKind) {
    options.onDegraded?.(`embedding_degraded kind=${degradedKind}`);
  }
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
