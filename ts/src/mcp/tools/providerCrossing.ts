// The two MCP tools that can reach a provider (CV22.DS9.US2 plateau 4).
//
// `search_memories` with a `query` embeds it; `mirror_context` with a `query`
// reaches attachment search and every installed extension context provider.
// Both are the paid, fan-out paths the DS9 threat model names -- and, per the
// AI-19 rider, the ones DS9.TS1 will put a wallet guard in front of.
//
// Everything else here is a deterministic read: `search_memories` without a
// query is a filter over `memories`, and `mirror_context` without one assembles
// identity layers from the database.

import type { Database } from "#db/database.ts";
import { collectExtensionContext } from "#extensions/contextRuntime.ts";
import { loadMirrorContext } from "#mirror/context.ts";
import type { EmbeddingProvider } from "#providers/embedding.ts";
import { searchMemories } from "#search/memorySearch.ts";
import { pyFloat, pythonJson } from "../payload.ts";
import { type MemoryDto, memoriesByFilter, memoriesByIds } from "../readModels.ts";

/** What the tools need from the process to reach providers and extensions. */
export interface ToolRuntime {
  embeddingProvider: EmbeddingProvider;
  /** Absolute mirror home, for extension resolution. Omit to disable fan-out. */
  mirrorHome?: string;
  /** Absolute database path, handed to extension providers. */
  databasePath?: string;
  user?: string;
  /** Frozen clock for the ranker, used by the parity harness. */
  frozenNowMs?: number;
}

function toolJson(value: unknown): string {
  return pythonJson(value, { indent: 2 });
}

function argument(args: unknown, key: string): unknown {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return undefined;
  return (args as Record<string, unknown>)[key];
}

function pythonInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
    throw new Error(`invalid literal for int() with base 10: '${value}'`);
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new Error(`int() argument must be a string or a number, not '${typeof value}'`);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Port of `_search_memories`.
 *
 * With a `query`: hybrid search, then the ranked ids mapped back to full rows.
 * Without: the first of `journey`, `layer`, `type` that is present, sliced to
 * `limit`; none of them is an error. Python's order of preference is exactly
 * this, and the error text is its text.
 */
export async function searchMemoriesTool(
  db: Database,
  args: unknown,
  runtime: ToolRuntime,
): Promise<string> {
  const query = argument(args, "query");
  const limit = pythonInt(argument(args, "limit"), 5);
  const memoryType = optionalText(argument(args, "type"));
  const layer = optionalText(argument(args, "layer"));
  const journey = optionalText(argument(args, "journey"));

  if (query) {
    const ranked = await searchMemories(db, {
      query: String(query),
      limit,
      memoryType: memoryType ?? null,
      layer: layer ?? null,
      journey: journey ?? null,
      provider: runtime.embeddingProvider,
      // AI-12: an agent searching on its own behalf is not a genuine context
      // load, so it must not teach the ranker. Python's MCP handler passes
      // log_access=False for exactly this reason.
      logAccess: false,
      // The server holds a read-only handle (US2 Navigator decision (d)), so
      // the embedding-ledger row is not written either. Named consequence:
      // agent-initiated searches are uncounted spend until TS2 settles how this
      // server opens its database, which TS1's wallet guard depends on.
      recordEmbeddingLedger: false,
      ...(runtime.frozenNowMs === undefined ? {} : { frozenNowMs: runtime.frozenNowMs }),
    });
    const rows = memoriesByIds(
      db,
      ranked.map((result) => result.id),
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return toolJson(
      ranked.map((result) => {
        const row = byId.get(result.id);
        return {
          ...(row ?? emptyMemoryDto(result.id)),
          // Python types the score as float; a whole score renders 1.0, not 1.
          score: pyFloat(result.score),
        };
      }),
    );
  }

  let rows: MemoryDto[];
  if (journey) rows = memoriesByFilter(db, "journey", journey);
  else if (layer) rows = memoriesByFilter(db, "layer", layer);
  else if (memoryType) rows = memoriesByFilter(db, "memory_type", memoryType);
  else throw new Error("provide 'query' or one of 'type' / 'layer' / 'journey'");

  return toolJson(rows.slice(0, Math.max(0, limit)));
}

function emptyMemoryDto(id: string): MemoryDto {
  return {
    id,
    title: null,
    memory_type: null,
    layer: null,
    journey: null,
    tags: null,
    content: null,
  };
}

/**
 * Port of `_mirror_context`.
 *
 * Deliberately not the Mirror Mode load: that one activates the mode and
 * mutates sticky defaults. This is the side-effect-free context builder, and it
 * keeps `load_mirror_context`'s defaults -- including reinforcement, because
 * unlike an agent search this IS a genuine context load (AI-12).
 *
 * Extension context is resolved through the same `collectExtensionContext` the
 * front door uses (plan D4), not a second reading of the `mirror-context-v1`
 * contract. The agent-supplied `query` reaches every installed provider, which
 * the DS9 threat model names as the fan-out path.
 */
export async function mirrorContextTool(
  db: Database,
  args: unknown,
  runtime: ToolRuntime,
): Promise<string> {
  const persona = optionalText(argument(args, "persona"));
  const journey = optionalText(argument(args, "journey"));
  const query = optionalText(argument(args, "query"));

  const extensionContext =
    runtime.mirrorHome && runtime.databasePath
      ? collectExtensionContext(db, {
          mirrorHome: runtime.mirrorHome,
          databasePath: runtime.databasePath,
          personaId: persona ?? null,
          journeyId: journey ?? null,
          user: runtime.user ?? "",
          query: query ?? null,
        }).rendered
      : "";

  return loadMirrorContext(db, {
    persona: persona ?? null,
    journey: journey ?? null,
    query: query ?? null,
    embeddingProvider: runtime.embeddingProvider,
    extensionContext,
  });
}
