import type { Database } from "#db/database.ts";
import { descriptorsByLayer } from "#descriptor/descriptorRead.ts";
import { detectPersona, type PersonaRoutingRow } from "#persona/detectPersona.ts";
import { type EmbeddingProvider, generateEmbeddingSafely } from "#providers/embedding.ts";
import type { LlmProvider, LlmResponse } from "#providers/llm.ts";
import { cosineSimilarity } from "#search/ranker.ts";
import { stripAccents } from "#util/slug.ts";
import { runReception, sliceCodePoints } from "./reception.ts";
import { GLOBAL_STICKY_DEFAULTS_SESSION_ID, getRuntimeSession } from "./runtimeSession.ts";

export interface ResolvedMirrorDefaults {
  persona: string | null;
  journey: string | null;
  detectedJourney: [string, number, string][] | null;
  touchesIdentity: boolean;
  touchesShadow: boolean;
}

export interface ResolveMirrorDefaultsInput {
  persona?: string | null;
  journey?: string | null;
  query?: string | null;
  sessionId?: string | null;
  receptionEnabled: boolean;
  llmProvider?: LlmProvider;
  embeddingProvider?: EmbeddingProvider;
  onReceptionLlmCall?: (response: LlmResponse, prompt: string) => void;
}

interface IdentityRoutingRow {
  key: string;
  content: string;
  metadata: string | null;
}

export async function resolveMirrorDefaults(
  db: Database,
  input: ResolveMirrorDefaultsInput,
): Promise<ResolvedMirrorDefaults> {
  let persona = input.persona ?? null;
  let journey = input.journey ?? null;
  let detectedJourney: [string, number, string][] | null = null;
  let touchesIdentity = true;
  let touchesShadow = false;

  const session = input.sessionId ? getRuntimeSession(db, input.sessionId) : null;
  const global = getRuntimeSession(db, GLOBAL_STICKY_DEFAULTS_SESSION_ID);
  const stickyPersona = session?.persona || global?.persona || null;
  const stickyJourney = session?.journey || global?.journey || null;
  const query = input.query ?? null;

  if (input.receptionEnabled && query) {
    if (!input.llmProvider) throw new Error("reception replay provider is required");
    const personaRows = identityRoutingRows(db, "persona");
    const journeyRows = identityRoutingRows(db, "journey");
    const personaDescriptors = descriptorMap(db, "persona");
    const journeyDescriptors = descriptorMap(db, "journey");
    const reception = await runReception(
      query,
      personaRows.map((row) => ({
        slug: row.key,
        description: personaDescriptors.get(row.key) ?? sliceCodePoints(row.content, 200),
        routingKeywords: routingKeywords(row.metadata),
      })),
      journeyRows.map((row) => ({
        slug: row.key,
        description: journeyDescriptors.get(row.key) ?? sliceCodePoints(row.content, 200),
      })),
      input.llmProvider,
      input.onReceptionLlmCall,
    );
    if (reception.personas.length > 0 && persona === null) persona = reception.personas[0] ?? null;
    if (reception.journey && journey === null) journey = reception.journey;
    touchesIdentity = reception.touchesIdentity;
    touchesShadow = reception.touchesShadow;
  }

  persona ??= stickyPersona;
  journey ??= stickyJourney;

  if (persona === null && query) {
    const matches = detectPersona(query, personaRoutingRows(db));
    persona = matches[0]?.key ?? null;
  }
  if (journey === null && query) {
    detectedJourney = await detectJourney(db, query, input.embeddingProvider);
    journey = detectedJourney[0]?.[0] ?? null;
  }

  return { persona, journey, detectedJourney, touchesIdentity, touchesShadow };
}

export async function detectJourney(
  db: Database,
  query: string,
  embeddingProvider?: EmbeddingProvider,
  threshold = 0.35,
): Promise<[string, number, string][]> {
  const journeys = identityRoutingRows(db, "journey");
  if (journeys.length === 0) return [];
  const queryTokens = new Set(stripAccents(query.toLowerCase()).match(/[\p{L}\p{N}_]+/gu) ?? []);
  const stopwords = new Set([
    "o",
    "a",
    "os",
    "as",
    "de",
    "do",
    "da",
    "dos",
    "das",
    "e",
    "em",
    "no",
    "na",
  ]);
  const textMatches: [string, number, string][] = [];
  for (const row of journeys) {
    const idTokens = new Set(stripAccents(row.key.replaceAll("-", " ").toLowerCase()).split(/\s+/));
    const firstLine =
      row.content
        .split("\n")[0]
        ?.trim()
        .replace(/^[# ]+/, "") ?? "";
    const nameTokens = new Set(
      stripAccents(firstLine.toLowerCase()).match(/[\p{L}\p{N}_]+/gu) ?? [],
    );
    const overlap = new Set<string>();
    for (const token of [...idTokens, ...nameTokens]) {
      if (!stopwords.has(token) && queryTokens.has(token)) overlap.add(token);
    }
    if (overlap.size > 0) {
      const all = new Set([...idTokens, ...nameTokens].filter((token) => !stopwords.has(token)));
      textMatches.push([row.key, Math.min(1, overlap.size / Math.max(all.size, 1) + 0.5), "text"]);
    }
  }
  if (textMatches.length > 0) return textMatches.sort((a, b) => b[1] - a[1]);
  if (!embeddingProvider) return [];
  let queryEmbedding: readonly number[];
  try {
    queryEmbedding = await generateEmbeddingSafely(embeddingProvider, query);
  } catch {
    return [];
  }
  const semantic: [string, number, string][] = [];
  for (const row of journeys) {
    try {
      const vector = await generateEmbeddingSafely(
        embeddingProvider,
        sliceCodePoints(row.content, 1000) || row.key,
      );
      const score = cosineSimilarity(queryEmbedding, vector);
      if (score >= threshold) semantic.push([row.key, score, "semantic"]);
    } catch {
      // Python isolates each journey embedding failure.
    }
  }
  return semantic.sort((a, b) => b[1] - a[1]);
}

function identityRoutingRows(db: Database, layer: string): IdentityRoutingRow[] {
  return db
    .prepare("SELECT key, content, metadata FROM identity WHERE layer = ? ORDER BY key")
    .all(layer)
    .map((row) => ({
      key: String(row.key),
      content: String(row.content),
      metadata: typeof row.metadata === "string" ? row.metadata : null,
    }));
}

function descriptorMap(db: Database, layer: string): Map<string, string> {
  return new Map(descriptorsByLayer(db, layer).map((row) => [row.key, row.descriptor]));
}

function personaRoutingRows(db: Database): PersonaRoutingRow[] {
  return identityRoutingRows(db, "persona").map((row) => ({
    key: row.key,
    routing_keywords: routingKeywords(row.metadata),
  }));
}

function routingKeywords(metadata: string | null): string[] {
  if (!metadata) return [];
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
    const value = (parsed as Record<string, unknown>).routing_keywords;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
