// What deleting a conversation means, in one place (CR154, review findings D1
// and E2).
//
// Ported as Python's `ConversationService.delete_conversations` for one id, and
// private to `logger.ts` while `discard-current` was its only caller. CR154's
// removal of imported Pi conversations is the second, so it lives here now.
//
// Six tables reference a conversation, and each gets a decision: what is only
// the conversation's own is deleted with it, and what outlives it is kept with
// its link cleared -- a memory extracted from the conversation is still a
// memory, a provider call still happened, a session row still names its
// session, an identity integration is still part of the identity. Foreign keys
// are on (`database.ts`), so a table without a decision makes the conversation
// undeletable: before CR154 the routine missed `identity_integrations`, and
// `discard-current` failed with `FOREIGN KEY constraint failed` on any
// conversation a Soul Mode integration named. `conversationDeletion.test.ts`
// reads the schema's foreign keys and fails when a table appears that the
// lists below do not decide.

import type { WritableDatabase } from "#db/database.ts";

/** Every table that references `conversations(id)`, by what deletion does to its rows. */
export const CONVERSATION_REFERENCES = {
  /** The conversation's own rows: deleted with it. */
  deleted: ["conversation_embeddings", "messages"],
  /** Rows that outlive it: kept, their `conversation_id` set to null. */
  unlinked: ["identity_integrations", "llm_calls", "memories", "runtime_sessions"],
} as const;

/**
 * Delete one conversation: its own rows first, then the links that outlive
 * it, then the conversation. Runs no transaction of its own -- every caller
 * wraps it in one with whatever else must move together.
 */
export function deleteConversation(db: WritableDatabase, conversationId: string): void {
  for (const table of CONVERSATION_REFERENCES.deleted) {
    db.prepare(`DELETE FROM ${table} WHERE conversation_id = ?`).run(conversationId);
  }
  for (const table of CONVERSATION_REFERENCES.unlinked) {
    db.prepare(`UPDATE ${table} SET conversation_id = NULL WHERE conversation_id = ?`).run(
      conversationId,
    );
  }
  db.prepare("DELETE FROM conversations WHERE id = ?").run(conversationId);
}
