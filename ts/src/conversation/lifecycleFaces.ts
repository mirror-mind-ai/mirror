/**
 * The ES-001 metadata-lifecycle READ faces — CV22.DS7.US11 plateau 5b.
 *
 * `conversations --metadata-lifecycle-dry-run <conversation-id>` and
 * `--metadata-lifecycle-preview-at-message <message-id>`: two pure reads over
 * the engine DS7.US10 already ported. CR068 found the whole ES-001 flag family
 * unowned — US1 called it "own slice", no slice claimed it.
 *
 * **Scope boundary, Navigator decision 2026-09-09 (option B).** The sibling
 * faces `--metadata-lifecycle-apply` and `--metadata-lifecycle-demo` are NOT
 * ported here and are refused BY NAME in `routing.ts`. Both need
 * `apply_metadata_lifecycle`: ~80 lines of unported decision logic with a write
 * path, which `closeTail.ts` already refuses for the same reason, and `demo`
 * calls `apply`. The US11 plan recorded all four as "wiring over the ported
 * engine", which was true of the reads and false of the writes. DS7.TS4 owns
 * them; the two `--metadata-backfill-*` flags remain DS10 retirements.
 */

import {
  type ConversationLike,
  dryRunMetadataLifecycle,
  type MessageLike,
  type MetadataLifecycleReport,
  titleNeedsImprovement,
} from "#conversation/metadataLifecycle.ts";
import type { Database } from "#db/database.ts";

/** Python raises `ValueError`; the CLI renders its text. */
export class LifecycleFaceError extends Error {}

interface ConversationRow {
  id: string;
  title: string | null;
  metadata: string | null;
}

/**
 * Python `_get_conversation_for_title_operation`: exact id, then an id-prefix
 * lookup, then a ValueError naming the value the caller passed.
 */
export function resolveConversation(db: Database, conversationId: string): ConversationRow {
  if (typeof conversationId !== "string" || conversationId.trim() === "") {
    throw new LifecycleFaceError("conversationId is required");
  }
  const exact = db
    .prepare("SELECT id, title, metadata FROM conversations WHERE id = ?")
    .get(conversationId) as unknown as ConversationRow | undefined;
  if (exact) return exact;
  const prefixed = db
    .prepare(
      "SELECT id, title, metadata FROM conversations WHERE id LIKE ? ORDER BY started_at LIMIT 1",
    )
    .get(`${conversationId}%`) as unknown as ConversationRow | undefined;
  if (prefixed) return prefixed;
  throw new LifecycleFaceError(`Conversation '${conversationId}' not found`);
}

/**
 * The engine's `MessageLike` declares only what the policy READS (role,
 * content). The boundary walk needs the id as well, so it is declared here
 * rather than widening the engine's interface for a caller's convenience.
 */
interface MessageRow extends MessageLike {
  id: string;
}

function loadMessages(db: Database, conversationId: string): MessageRow[] {
  return db
    .prepare(
      "SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at",
    )
    .all(conversationId) as unknown as MessageRow[];
}

/** Python `_metadata_dict`: a non-object or malformed metadata becomes `{}`. */
export function metadataDict(conversation: ConversationRow): Record<string, unknown> {
  if (!conversation.metadata) return {};
  try {
    const parsed: unknown = JSON.parse(conversation.metadata);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * `titleNeedsImprovement` reads `metadata` — `title_status: "provisional"` is
 * what makes a title repairable — so the WHOLE row crosses, not just id and
 * title. An earlier draft passed `{ id, title }` behind an `as ConversationLike`
 * cast, which compiled fine and silently turned every `repair` into `keep`.
 * The cast is gone: the row already satisfies the interface structurally.
 */
function asConversationLike(row: ConversationRow): ConversationLike {
  return { id: row.id, title: row.title, metadata: row.metadata };
}

/** `conversations --metadata-lifecycle-dry-run <conversation-id>`. */
export function runLifecycleDryRun(db: Database, conversationId: string): MetadataLifecycleReport {
  const conversation = resolveConversation(db, conversationId);
  const messages = loadMessages(db, conversation.id);
  return dryRunMetadataLifecycle(
    asConversationLike(conversation),
    messages,
    metadataDict(conversation),
    {
      titleNeedsImprovement,
    },
  );
}

export interface PreviewAtMessageReport {
  conversation_id: string;
  message_id: string;
  mode: "debug_preview_at_message";
  mutated: false;
  included_message_count: number;
  excluded_message_count: number;
  dry_run: MetadataLifecycleReport;
}

/**
 * `conversations --metadata-lifecycle-preview-at-message <message-id>`.
 *
 * Python resolves the boundary message by exact id OR id prefix, taking the
 * MOST RECENT match (`ORDER BY created_at DESC LIMIT 1`) — the opposite
 * direction from the conversation lookup beside it, reproduced as written.
 */
export function runLifecyclePreviewAtMessage(
  db: Database,
  messageId: string,
): PreviewAtMessageReport {
  if (typeof messageId !== "string" || messageId.trim() === "") {
    throw new LifecycleFaceError("messageId is required");
  }
  const boundary = db
    .prepare(
      "SELECT id, conversation_id FROM messages WHERE id = ? OR id LIKE ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(messageId, `${messageId}%`) as unknown as
    | { id: string; conversation_id: string }
    | undefined;
  if (!boundary) throw new LifecycleFaceError(`Message '${messageId}' not found`);

  const conversation = resolveConversation(db, boundary.conversation_id);
  const allMessages = loadMessages(db, conversation.id);

  const selected: MessageRow[] = [];
  let foundBoundary = false;
  for (const message of allMessages) {
    selected.push(message);
    if (message.id === boundary.id) {
      foundBoundary = true;
      break;
    }
  }
  if (!foundBoundary) {
    throw new LifecycleFaceError(`Message '${messageId}' not found in conversation`);
  }

  const dryRun = dryRunMetadataLifecycle(
    asConversationLike(conversation),
    selected,
    metadataDict(conversation),
    { titleNeedsImprovement },
  );
  return {
    conversation_id: conversation.id,
    message_id: boundary.id,
    mode: "debug_preview_at_message",
    mutated: false,
    included_message_count: selected.length,
    excluded_message_count: Math.max(0, allMessages.length - selected.length),
    dry_run: dryRun,
  };
}
