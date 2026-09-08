// CV22.DS7.US6 plateau 4 — the Soul Mode identity integration, ported from
// `apply_identity_integration` and `append_identity_integration_to_content`
// (`src/memory/services/soul.py`).
//
// This is the only write in Soul Mode that touches identity, and it does two
// things: an audit row in `identity_integrations`, and a dated bullet appended
// into the identity DOCUMENT under a layer-specific section title.
//
// On the allowlist question: this write deliberately does NOT go through
// `applyConsolidationIdentityUpdate`. Python is explicit that the consolidation
// allowlist is narrow to the `propose_consolidation` -> accept flow, where the
// target layer is MODEL-CHOSEN and untrusted, and it names Soul Mode
// integration as a caller of the general-purpose write instead. The two also
// append differently -- consolidation joins raw content after a blank line,
// Soul inserts a dated bullet inside a titled section -- so routing Soul
// through that gate would change behavior, not just tighten it. Soul's own
// guards are reproduced exactly: the layer must be one of the four section
// titles, the content must be non-empty, and the CLI additionally requires
// `--confirm APPLY`. Whether that is the right guard for ritual-authored text
// is a product question recorded for Debt Review, not one a port may answer.
//
// The document surgery is index arithmetic over Markdown with three different
// strip rules in five lines. Two are graded by the golden. The third,
// `lstrip("\n")`, is reproduced faithfully but is provably UNREACHABLE as a
// divergence: the slice it operates on begins at a `"\n## "` match, so after the
// newlines the next character is always `#` and `trimStart()` would produce the
// same string. Substituting `trimStart()` fails no scenario, and that is a fact
// about the call site rather than a gap in the corpus -- recorded so nobody
// later "strengthens" the test with a case that cannot exist.

import type { WritableDatabase } from "#db/database.ts";
import { getIdentityContent } from "#identity/identityRead.ts";
import { type IdentityRow, upsertIdentity } from "#identity/identityStore.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";
import { pyRStrip, pyStrip, sliceCodePoints } from "#util/pythonText.ts";

/** Port of `IDENTITY_INTEGRATION_SECTION_TITLES`. */
export const IDENTITY_INTEGRATION_SECTION_TITLES: Readonly<Record<string, string>> = {
  self: "New Incorporated Principles",
  shadow: "New Hidden Needs Recognized",
  ego: "New Operational Patterns Identified",
  persona: "New Participation Patterns Revealed",
};

/** Python raises `ValueError`; the CLI renders it as `Error: <message>`. */
export class SoulApplyError extends Error {}

export interface IdentityIntegrationRow {
  id: string;
  layer: string;
  key: string;
  content: string;
  source: string;
  origin: string | null;
  conversationId: string | null;
  journalId: string | null;
  createdAt: string;
  status: string;
  metadata: string;
}

export interface ApplyIdentityIntegrationInput {
  layer: string;
  key: string;
  content: string;
  origin?: string | null;
  conversationId?: string | null;
  journalId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ApplyIdentityIntegrationResult {
  integration: IdentityIntegrationRow;
  updatedContent: string;
}

/** Python's `x.strip() if isinstance(x, str) and x.strip() else None`. */
function strippedOrNull(value: string | null | undefined): string | null {
  return typeof value === "string" && pyStrip(value) ? pyStrip(value) : null;
}

export function applyIdentityIntegration(
  db: WritableDatabase,
  input: ApplyIdentityIntegrationInput,
  deps: { newId: () => string; nowIso: string },
): ApplyIdentityIntegrationResult {
  const normalized = pyStrip(input.content);
  if (!normalized) throw new SoulApplyError("identity content must not be empty");
  if (!(input.layer in IDENTITY_INTEGRATION_SECTION_TITLES)) {
    throw new SoulApplyError(`unsupported psyche layer: ${input.layer}`);
  }

  const integration: IdentityIntegrationRow = {
    id: deps.newId(),
    layer: input.layer,
    key: input.key,
    content: normalized,
    source: "soul_mode",
    origin: strippedOrNull(input.origin),
    conversationId: strippedOrNull(input.conversationId),
    journalId: strippedOrNull(input.journalId),
    createdAt: deps.nowIso,
    status: "active",
    // Python: json.dumps(metadata or {}, ensure_ascii=False, sort_keys=True).
    // Note the sort: the harvest journal's metadata is NOT sorted, so the two
    // Soul writes use different rules and each is pinned by its own golden.
    metadata: pythonJsonDumpsSorted(input.metadata ?? {}),
  };
  addIdentityIntegration(db, integration);

  const existingContent = getIdentityContent(db, input.layer, input.key);
  const updatedContent = appendIdentityIntegrationToContent(existingContent ?? "", {
    layer: input.layer,
    content: integration.content,
    createdAt: integration.createdAt,
  });
  upsertIdentity(
    db,
    identityRowFor(db, input.layer, input.key, updatedContent, deps.newId),
    deps.nowIso,
  );
  return { integration, updatedContent };
}

/** Port of `Store.add_identity_integration`. */
export function addIdentityIntegration(
  db: WritableDatabase,
  integration: IdentityIntegrationRow,
): void {
  db.prepare(
    `INSERT INTO identity_integrations (
       id, layer, key, content, source, origin, conversation_id,
       journal_id, created_at, status, metadata
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    integration.id,
    integration.layer,
    integration.key,
    integration.content,
    integration.source,
    integration.origin,
    integration.conversationId,
    integration.journalId,
    integration.createdAt,
    integration.status,
    integration.metadata,
  );
}

/**
 * Port of `append_identity_integration_to_content`.
 *
 * Four branches: empty document, heading absent, heading last, heading followed
 * by another `## ` section. Python matches the heading as a SUBSTRING, so a
 * longer heading that contains the title is treated as the section -- preserved
 * here rather than corrected.
 */
export function appendIdentityIntegrationToContent(
  currentContent: string,
  integration: { layer: string; content: string; createdAt: string },
): string {
  const title = IDENTITY_INTEGRATION_SECTION_TITLES[integration.layer];
  if (title === undefined) {
    throw new SoulApplyError(`unsupported psyche layer: ${integration.layer}`);
  }
  const date = sliceCodePoints(integration.createdAt, 10);
  const bullet = `- [${date}] ${pyStrip(integration.content)}`;
  const base = pyStrip(currentContent);
  const heading = `## ${title}`;
  if (!base) return `${heading}\n\n${bullet}`;
  if (!base.includes(heading)) return `${base}\n\n${heading}\n\n${bullet}`;

  const headingIndex = base.indexOf(heading);
  const afterHeadingIndex = headingIndex + heading.length;
  const nextSectionIndex = base.indexOf("\n## ", afterHeadingIndex);
  const insertAt = nextSectionIndex === -1 ? base.length : nextSectionIndex;
  const before = pyRStrip(base.slice(0, insertAt));
  // Python `lstrip("\n")`: newline characters only, NOT whitespace.
  // Python `lstrip("\n")`: newline characters only, NOT whitespace. Equivalent
  // to `trimStart()` here because `insertAt` always points at a `"\n## "` match;
  // kept in Python's form because that is what the oracle does.
  const after = base.slice(insertAt).replace(/^\n+/, "");
  const updated = `${before}\n${bullet}`;
  return after ? `${updated}\n\n${after}` : updated;
}

/**
 * Python passes `existing.model_copy(update={"content": ...})`, so an existing
 * row keeps its id, version, and metadata and only its content moves.
 */
function identityRowFor(
  db: WritableDatabase,
  layer: string,
  key: string,
  content: string,
  newId: () => string,
): IdentityRow {
  const existing = db
    .prepare("SELECT id, version, metadata FROM identity WHERE layer = ? AND key = ?")
    .get(layer, key) as { id: string; version: string; metadata: string | null } | undefined;
  // Absent row: Python builds a fresh `Identity`, whose defaults are a new uuid,
  // version "1.0.0", and NULL metadata.
  return {
    id: existing?.id ?? newId(),
    layer,
    key,
    content,
    version: existing?.version ?? "1.0.0",
    metadata: existing?.metadata ?? null,
  };
}

/** Python `json.dumps(value, ensure_ascii=False, sort_keys=True)`. */
function pythonJsonDumpsSorted(value: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = value[key];
  return pythonJsonDumps(sorted);
}
