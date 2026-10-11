import type { Database } from "#db/database.ts";
import { blobToFloat32 } from "#db/decode.ts";
import { getIdentityContent, listIdentityByLayer } from "#identity/identityRead.ts";
import {
  type EmbeddingAttemptInfo,
  type EmbeddingProvider,
  generateEmbeddingSafely,
} from "#providers/embedding.ts";
import { cosineSimilarity } from "#search/ranker.ts";
import { stripAccents } from "#util/slug.ts";

export interface MirrorContextOptions {
  persona?: string | null;
  journey?: string | null;
  org?: boolean;
  query?: string | null;
  touchesIdentity?: boolean;
  touchesShadow?: boolean;
  embeddingProvider?: EmbeddingProvider;
  /**
   * Where the attachment-search embedding is recorded as spend (CV22.DS9.TS1).
   *
   * Attachment search is a paid call that neither engine logged: Python's
   * `attachment.py` calls `generate_embedding(query)` with no `on_llm_call`, against its
   * own AI-09 rule that every model-in-the-loop call site logs. The MCP server passes a
   * sink so its `mirror_context(query)` spend is countable; every other caller omits it
   * and keeps the oracle's behaviour.
   */
  embeddingLedger?: (info: EmbeddingAttemptInfo) => void;
  extensionContext?: string;
}

interface AttachmentRow {
  journeyId: string;
  name: string;
  description: string | null;
  content: string;
  embedding: Uint8Array;
}

export async function loadMirrorContext(
  db: Database,
  options: MirrorContextOptions = {},
): Promise<string> {
  const sections: [string, string | null][] = [];
  if (options.touchesIdentity ?? true)
    sections.push(["self/soul", getIdentityContent(db, "self", "soul")]);
  sections.push(["ego/behavior", getIdentityContent(db, "ego", "behavior")]);
  sections.push(["user/identity", getIdentityContent(db, "user", "identity")]);
  if (options.touchesIdentity ?? true)
    sections.push(["ego/identity", getIdentityContent(db, "ego", "identity")]);
  if (options.org) {
    sections.push(["organization/identity", getIdentityContent(db, "organization", "identity")]);
    sections.push([
      "organization/principles",
      getIdentityContent(db, "organization", "principles"),
    ]);
  }
  if (options.persona) {
    const content = getIdentityContent(db, "persona", options.persona);
    if (content) sections.push([`persona/${options.persona}`, content]);
  }
  for (const row of listIdentityByLayer(db, "knowledge")) {
    sections.push([`knowledge/${row.key}`, row.content]);
  }
  if (options.journey) {
    const content = getIdentityContent(db, "journey", options.journey);
    if (content) sections.push([`journey/${options.journey}`, content]);
  }
  if (options.touchesShadow) {
    const shadow = listIdentityByLayer(db, "shadow");
    if (shadow.length > 0) {
      sections.push([
        "shadow/profile",
        [
          "[Confirmed shadow patterns — grounded in evidence across multiple conversations]",
          ...shadow.map((row) => row.content),
        ].join("\n\n"),
      ]);
    }
  }

  const parts: string[] = [];
  const constraints = getIdentityContent(db, "ego", "constraints");
  if (constraints) parts.push(`=== ⛔ HARD CONSTRAINTS ===\n${constraints}`);
  for (const [label, content] of sections) {
    if (content) parts.push(`=== ${label} ===\n${content}`);
  }

  if (options.query) {
    const attachments = await relevantAttachments(
      db,
      options.query,
      options.journey ?? null,
      options.embeddingProvider,
      options.embeddingLedger,
    );
    if (attachments.length > 0) {
      const attachmentParts = ["=== relevant attachments ==="];
      for (const { row, score } of attachments) {
        const source = options.journey ? "" : ` [${row.journeyId}]`;
        attachmentParts.push(`--- ${row.name}${source} (score: ${score.toFixed(3)}) ---`);
        if (row.description) attachmentParts.push(`Description: ${row.description}`);
        attachmentParts.push(row.content);
      }
      parts.push(attachmentParts.join("\n"));
    }
  }
  if (options.extensionContext) parts.push(options.extensionContext);
  return parts.join("\n\n");
}

export async function relevantAttachments(
  db: Database,
  query: string,
  journey: string | null,
  provider?: EmbeddingProvider,
  embeddingLedger?: (info: EmbeddingAttemptInfo) => void,
): Promise<{ row: AttachmentRow; score: number }[]> {
  const rows = attachmentRows(db, journey);
  // No attachments, no embedding: the early return is why a query against a database
  // without attachments records no spend -- there is none.
  if (rows.length === 0) return [];
  if (!provider) throw new Error("attachment embedding replay provider is required");
  const queryEmbedding = await generateEmbeddingSafely(provider, query, {
    ...(embeddingLedger ? { onAttempt: embeddingLedger } : {}),
  });
  const queryTokens = (query.match(/[\p{L}\p{N}_]+/gu) ?? [])
    .filter((token) => [...token].length >= 2 || /^\p{N}+$/u.test(token))
    .map((token) => stripAccents(token.toLowerCase()));
  const scored = rows.map((row) => {
    let score = cosineSimilarity(queryEmbedding, blobToFloat32(row.embedding));
    if (!journey && queryTokens.length > 0) {
      let searchable = stripAccents(
        `${row.journeyId} ${row.name} ${row.description ?? ""}`.toLowerCase(),
      );
      searchable = searchable
        .replace(/(\P{N})(\p{N})/gu, "$1 $2")
        .replace(/(\p{N})(\P{N})/gu, "$1 $2");
      const matches = queryTokens.filter((token) => searchable.includes(token)).length;
      if (matches > 0) score += (matches / queryTokens.length) * 0.15;
    }
    return { row, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, journey ? 5 : 8).filter((item) => item.score > 0.4);
}

function attachmentRows(db: Database, journey: string | null): AttachmentRow[] {
  const sql = journey
    ? "SELECT journey_id, name, description, content, embedding FROM attachments WHERE journey_id = ? AND embedding IS NOT NULL ORDER BY created_at"
    : "SELECT journey_id, name, description, content, embedding FROM attachments WHERE embedding IS NOT NULL ORDER BY created_at";
  const rows = journey ? db.prepare(sql).all(journey) : db.prepare(sql).all();
  return rows.map((row) => ({
    journeyId: String(row.journey_id),
    name: String(row.name),
    description: typeof row.description === "string" ? row.description : null,
    content: String(row.content),
    embedding: row.embedding as Uint8Array,
  }));
}
