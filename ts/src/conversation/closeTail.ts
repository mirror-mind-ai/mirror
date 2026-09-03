// The conversation close tail (CV22.DS7.US10 slice C′).
//
// Ports `end_conversation`, `finalize_metadata_on_close`,
// `apply_generated_metadata_lifecycle`, and
// `_apply_force_generated_metadata_lifecycle` from
// `src/memory/services/conversation.py`.
//
// This is the path every ended session runs through, and its shape carries two
// properties that must not be lost:
//
//   1. `ended_at` is written BEFORE extraction, and finalization runs in a
//      `finally`. An orphan therefore closes and still gets its non-manual
//      metadata finalized even when extraction raises — the comment in Python
//      calls this out explicitly, so it is behavior, not an accident.
//   2. The decision engine, not this module, decides whether each field is
//      generated. How many LLM calls the tail makes is therefore a function of
//      the dry-run decisions and the execution profile, which is why the
//      ledger is graded as an ordered call sequence rather than a row count.

import {
  type ConversationLike,
  dryRunMetadataLifecycle,
  type FieldReport,
  type MessageLike,
  messagesAreTitleable,
  metadataExecutionProfile,
  metadataProfileAction,
  titleNeedsImprovement,
} from "#conversation/metadataLifecycle.ts";
import type { WritableDatabase } from "#db/database.ts";
import type { ExtractionMessage } from "#extraction/conversation.ts";
import {
  generateConversationSummary,
  generateConversationTags,
  generateConversationTitle,
} from "#extraction/conversationMetadata.ts";
import type { LlmProvider, LlmResponse } from "#providers/llm.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";

export interface CloseTailDeps {
  llm: LlmProvider;
  /** Fires per successful LLM call, in call order — the ledger seam. */
  onLlmCall?: (role: string, response: LlmResponse, conversationId: string) => void;
  now?: () => string;
  userName?: string;
}

export interface MetadataLifecycleApplyReport {
  conversation_id: string;
  mode: string;
  mutated: boolean;
  changed: Record<string, unknown>;
  skipped: Record<string, string>;
  dry_run: unknown;
  profile: string;
  actions: Record<string, string>;
}

interface ConversationRow extends ConversationLike {
  id: string;
  title: string | null;
  summary: string | null;
  tags: string | null;
  metadata: string | null;
}

/** Python's `_clean_title`: collapse whitespace, require non-empty, cap 160. */
export function cleanTitle(title: string): string {
  const clean = title.trim().split(/\s+/u).filter(Boolean).join(" ");
  if (!clean) throw new Error("title is required");
  if (clean.length > 160) throw new Error("title must be at most 160 characters");
  return clean;
}

/**
 * Python's `_clean_summary`: collapse whitespace inside each blank-line-separated
 * paragraph, drop empty paragraphs, rejoin with a blank line, then truncate to
 * 1000 characters and right-strip.
 */
export function cleanSummary(summary: string): string {
  const paragraphs = summary
    .trim()
    .split("\n\n")
    .filter((part) => part.trim())
    .map((part) => part.split(/\s+/u).filter(Boolean).join(" "));
  let clean = paragraphs.join("\n\n");
  if (clean.length > 1000) clean = clean.slice(0, 1000).replace(/\s+$/u, "");
  return clean;
}

/** Python's `_looks_like_artifact`: digits, hashes, and CSS sizes are not tags. */
export function looksLikeArtifact(term: string): boolean {
  // Python's `str.isdigit()` is Unicode-aware (superscripts included); the last
  // clause already rejects anything containing an ASCII digit, so the practical
  // gate here is the same.
  if (/^\d+$/u.test(term)) return true;
  if (/^[0-9a-f]{7,}$/u.test(term)) return true;
  if (/^\d+px$/u.test(term)) return true;
  return /\d/u.test(term);
}

/** Python's `_title_metadata`. */
export function titleMetadata(
  conversation: ConversationLike,
  options: { source: string; status: string; previousTitle: string | null },
): Record<string, unknown> {
  const metadata = metadataDict(conversation.metadata);
  if (options.previousTitle && options.previousTitle !== metadata.previous_title) {
    metadata.previous_title = options.previousTitle;
  }
  metadata.title_source = options.source;
  metadata.title_status = options.status;
  return metadata;
}

export function metadataDict(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Generate and apply the safe updates the lifecycle report exposes.
 *
 * KNOWN WASTED CALL, preserved for parity (registered for Debt Review): when
 * the tags action is apply/regenerate, no summary was generated, and the
 * summary decision is `refine_candidate`, Python calls `suggest_summary` a
 * second time and passes the result to `_suggest_tags` — which declares the
 * parameter and never reads it. That is a real LLM call whose output is
 * discarded. Porting it preserves the call sequence the ledger records; it is
 * named here so DS8 does not price it as intentional.
 */
export async function applyGeneratedMetadataLifecycle(
  db: WritableDatabase,
  conversationId: string,
  options: CloseTailDeps & { source?: string; profileName?: string },
): Promise<MetadataLifecycleApplyReport> {
  const source = options.source ?? "metadata_lifecycle_apply";
  const profileName = options.profileName ?? "manual_safe";

  const conversation = getConversationForTitleOperation(db, conversationId);
  const messages = getMessages(db, conversation.id);
  const metadata = metadataDict(conversation.metadata);
  const dryRun = dryRunMetadataLifecycle(conversation, messages, metadata, {
    titleNeedsImprovement,
  });
  const fields = dryRun.fields;
  const profile = metadataExecutionProfile(profileName);
  const actions: Record<string, string> = Object.fromEntries(
    Object.entries(fields).map(([field, report]) => [
      field,
      metadataProfileAction(profile, field, report as FieldReport),
    ]),
  );

  const suggest = buildSuggesters(conversation, messages, options);

  let generatedTitle: string | null = null;
  let generatedSummary: string | null = null;
  let generatedTags: string[] | null = null;

  if (actions.title === "apply" || actions.title === "regenerate") {
    generatedTitle = await suggest.title();
  }
  if (actions.summary === "apply" || actions.summary === "regenerate") {
    generatedSummary = await suggest.summary();
  }
  if (actions.tags === "apply" || actions.tags === "regenerate") {
    let tagSourceSummary = generatedSummary;
    if (tagSourceSummary === null && fields.summary.decision === "refine_candidate") {
      // The discarded call documented above. Kept so the ledger sequence matches.
      tagSourceSummary = await suggest.summary();
    }
    generatedTags = await suggest.tags(tagSourceSummary);
  }

  if (!profile.forceRegenerate) {
    throw new Error(
      `metadata execution profile '${profileName}' is not force_regenerate; ` +
        "the non-force apply path (apply_metadata_lifecycle) is not ported yet " +
        "— close_time and backfill_force are the profiles the close tail uses.",
    );
  }

  const report = applyForceGeneratedMetadataLifecycle(db, conversation, {
    dryRun,
    actions,
    title: generatedTitle,
    summary: generatedSummary,
    tags: generatedTags,
    source,
  });
  return { ...report, profile: profile.name, actions };
}

/** Python's `_apply_force_generated_metadata_lifecycle`. */
function applyForceGeneratedMetadataLifecycle(
  db: WritableDatabase,
  conversation: ConversationRow,
  input: {
    dryRun: unknown;
    actions: Record<string, string>;
    title: string | null;
    summary: string | null;
    tags: string[] | null;
    source: string;
  },
): Omit<MetadataLifecycleApplyReport, "profile" | "actions"> {
  const { actions, source } = input;
  // Rebound below by the title branch, exactly as Python rebinds `metadata`
  // to `_title_metadata(...)`'s fresh dict — later branches mutate the new one.
  let metadata = metadataDict(conversation.metadata);
  const updates: Record<string, string> = {};
  const changed: Record<string, unknown> = {};
  const skipped: Record<string, string> = {};

  if (actions.title === "preserve_manual") {
    skipped.title = "manual_lock_preserved";
  } else if (actions.title === "regenerate" && input.title) {
    const clean = cleanTitle(input.title);
    updates.title = clean;
    metadata = titleMetadata(conversation, {
      source,
      status: "generated",
      previousTitle: conversation.title,
    });
    changed.title = clean;
  } else if (actions.title === "regenerate") {
    skipped.title = "generation_failed";
  } else {
    skipped.title = actions.title as string;
  }

  if (actions.summary === "regenerate" && metadata.summary_source === "manual") {
    skipped.summary = "manual_summary_preserved";
  } else if (actions.summary === "regenerate" && input.summary) {
    const clean = cleanSummary(input.summary);
    if (clean) {
      updates.summary = clean;
      metadata.summary_status = "generated";
      metadata.summary_source = source;
      changed.summary = clean;
    } else {
      skipped.summary = "blank_value";
    }
  } else if (actions.summary === "regenerate") {
    skipped.summary = "generation_failed";
  } else {
    skipped.summary = actions.summary as string;
  }

  if (actions.tags === "regenerate" && metadata.tags_source === "manual") {
    skipped.tags = "manual_tags_preserved";
  } else if (actions.tags === "regenerate" && input.tags && input.tags.length > 0) {
    // `pythonJsonDumps`, not `JSON.stringify`: Python writes `["a", "b"]` with a
    // space after the comma, and these bytes land in a TEXT column that both
    // cores read and compare.
    updates.tags = pythonJsonDumps(input.tags);
    metadata.tags_status = "generated";
    metadata.tags_source = source;
    changed.tags = input.tags;
  } else if (actions.tags === "regenerate") {
    skipped.tags = "generation_failed";
  } else {
    skipped.tags = actions.tags as string;
  }

  if (Object.keys(changed).length > 0) {
    metadata.metadata_lifecycle_version = 1;
    metadata.last_metadata_update_source = source;
    updates.metadata = pythonJsonDumps(metadata);
    updateConversation(db, conversation.id, updates);
  }

  return {
    conversation_id: conversation.id,
    mode: "apply",
    mutated: Object.keys(changed).length > 0,
    changed,
    skipped,
    dry_run: input.dryRun,
  };
}

/**
 * Python's `maybe_generate_title`: improve one title when it is safe to replace.
 *
 * Distinct from the close tail's finalization: this is the startup-maintenance
 * path, it touches only the title, and it returns whether the title actually
 * changed so `retitle_pending_conversations` can count real work. Provider
 * failure leaves the conversation untouched, exactly as Python's bare `except`
 * does.
 */
export async function maybeGenerateTitle(
  db: WritableDatabase,
  conversationId: string,
  deps: CloseTailDeps & { source?: string },
): Promise<boolean> {
  const source = deps.source ?? "llm_auto";
  const conversation = getConversationForTitleOperation(db, conversationId);
  if (!titleNeedsImprovement(conversation)) return false;

  const messages = getMessages(db, conversation.id);
  if (!messagesAreTitleable(messages)) return false;

  try {
    const suggestion = await generateConversationTitle(deps.llm, messages, {
      userName: deps.userName ?? "User",
      onLlmCall: (response) => deps.onLlmCall?.("conversation_title", response, conversation.id),
    });
    if (!suggestion) return false;
    const clean = cleanTitle(suggestion);
    const metadata = titleMetadata(conversation, {
      source,
      status: "generated",
      previousTitle: conversation.title,
    });
    updateConversation(db, conversation.id, {
      title: clean,
      metadata: pythonJsonDumps(metadata),
    });
    return clean !== conversation.title;
  } catch {
    return false;
  }
}

/** Python's `finalize_metadata_on_close`. */
export async function finalizeMetadataOnClose(
  db: WritableDatabase,
  conversationId: string,
  deps: CloseTailDeps,
): Promise<MetadataLifecycleApplyReport> {
  return applyGeneratedMetadataLifecycle(db, conversationId, {
    ...deps,
    source: "close_time_metadata_finalization",
    profileName: "close_time",
  });
}

/**
 * Build the `CloseHooks` that `logger.ts`'s `endConversation` invokes.
 *
 * The ordering contract (`ended_at` -> extraction -> `finally` finalize) lives
 * in exactly one place, the logger's close seam that US5 slice A built and
 * tested. This module supplies the two tail implementations that seam was
 * designed to receive; it deliberately does NOT re-implement the ordering,
 * because two copies of that contract would eventually disagree.
 */
export function createCloseHooks(
  deps: CloseTailDeps & {
    runExtraction?: (db: WritableDatabase, conversationId: string) => Promise<void> | void;
  },
): {
  runExtraction?: (db: WritableDatabase, conversationId: string) => Promise<void> | void;
  finalizeMetadata: (db: WritableDatabase, conversationId: string) => Promise<void>;
} {
  return {
    runExtraction: deps.runExtraction,
    finalizeMetadata: async (db, conversationId) => {
      await finalizeMetadataOnClose(db, conversationId, deps);
    },
  };
}

function buildSuggesters(
  conversation: ConversationRow,
  messages: ExtractionMessage[],
  deps: CloseTailDeps,
) {
  const userName = deps.userName ?? "User";
  const record = (role: string) => (response: LlmResponse) =>
    deps.onLlmCall?.(role, response, conversation.id);

  return {
    async title(): Promise<string | null> {
      // Python's `suggest_title` raises ValueError on no messages or an empty
      // suggestion, and the caller maps that to None.
      if (messages.length === 0) return null;
      const suggestion = await generateConversationTitle(deps.llm, messages, {
        userName,
        onLlmCall: record("conversation_title"),
      });
      return suggestion ? suggestion : null;
    },
    async summary(): Promise<string | null> {
      if (messages.length === 0) return null;
      const suggestion = await generateConversationSummary(deps.llm, messages, {
        userName,
        onLlmCall: record("conversation_summary"),
      });
      const clean = cleanSummary(suggestion);
      return clean ? clean : null;
    },
    async tags(_generatedSummary: string | null): Promise<string[]> {
      // `_generatedSummary` is accepted and ignored, mirroring Python's
      // `_suggest_tags(conversation_id, generated_summary)`.
      const tags = await generateConversationTags(deps.llm, messages, {
        userName,
        onLlmCall: record("conversation_tags"),
      });
      return tags.filter((tag) => !looksLikeArtifact(tag));
    },
  };
}

function getConversationForTitleOperation(
  db: WritableDatabase,
  conversationId: string,
): ConversationRow {
  if (typeof conversationId !== "string" || !conversationId.trim()) {
    throw new Error("conversationId is required");
  }
  const row =
    (db
      .prepare("SELECT id, title, summary, tags, metadata FROM conversations WHERE id = ?")
      .get(conversationId) as Record<string, unknown> | undefined) ??
    (db
      .prepare(
        "SELECT id, title, summary, tags, metadata FROM conversations WHERE id LIKE ? " +
          "ORDER BY started_at DESC LIMIT 1",
      )
      .get(`${conversationId}%`) as Record<string, unknown> | undefined);
  if (!row) throw new Error(`Conversation '${conversationId}' not found`);
  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : null,
    summary: typeof row.summary === "string" ? row.summary : null,
    tags: typeof row.tags === "string" ? row.tags : null,
    metadata: typeof row.metadata === "string" ? row.metadata : null,
  };
}

function getMessages(
  db: WritableDatabase,
  conversationId: string,
): (ExtractionMessage & MessageLike)[] {
  const rows = db
    .prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at")
    .all(conversationId) as Record<string, unknown>[];
  return rows.map((row) => ({ role: String(row.role), content: String(row.content ?? "") }));
}

function updateConversation(
  db: WritableDatabase,
  conversationId: string,
  updates: Record<string, string>,
): void {
  const columns = Object.keys(updates);
  if (columns.length === 0) return;
  const assignments = columns.map((column) => `${column} = ?`).join(", ");
  db.prepare(`UPDATE conversations SET ${assignments} WHERE id = ?`).run(
    ...columns.map((column) => updates[column] as string),
    conversationId,
  );
}
