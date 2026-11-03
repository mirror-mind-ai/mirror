// The Pi user turns an earlier version stored as a skill's body, and their repair
// (CR160).
//
// Pi turns a prompt that opens with `/skill:<name>`, which is also what its command
// menu sends, into the skill's whole body before its extensions see it. Until CR160
// Pi's extension logged that prompt, so a skill invocation was stored as
// `<skill name="…" location="…">` and the body, as if the person had said it; every
// later reader -- the title, the embedding, extraction -- read it so.
//
// The repair applies the rule the core logs by (`commandTurn.ts`): a Mirror
// question keeps its question, without the block (`mirrorForm.ts`); any other skill
// invocation is not conversation, and neither are its arguments (a `mm-build`
// slug), so its row goes. A conversation the repair leaves with no user turn goes
// too, through the shared deletion, which keeps its memories unlinked (the
// Navigator's decision, A7). A conversation titled from a block, and not titled by
// hand, gets the title every conversation gets from its first user turn, marked
// provisional so the title paths can improve it. Replies stay: they are what the
// mirror said, and a reply to a skipped turn cannot be told from another. Summaries
// and their embeddings stay: they describe a session in which a skill was invoked
// (A6).
//
// Only Pi's whole wrapper, only in Pi conversations (A8): a person may type or
// paste `<skill name=` at the start of a message anywhere. One more shape counts:
// the wrapper the old logger cut at its size limit, whose ending only it writes.

import { isCommandTurn } from "#conversation/commandTurn.ts";
import { deleteConversation } from "#conversation/conversationDeletion.ts";
import { generateTitle, setProvisionalTitle } from "#conversation/logger.ts";
import { type Database, type WritableDatabase, withTransaction } from "#db/database.ts";

/**
 * Pi's expansion of `/skill:<name> args`, whole: the opening tag, Pi's line naming
 * where the skill's references resolve, the body, the closing tag, and the
 * arguments after a blank line when there are any (Pi 1.3.0 and 1.4.0,
 * `_expandSkillCommand`). Pi's own extension reads the same shape back
 * (`.pi/extensions/mirror-logger.ts`); `piSkillTurns.test.ts` holds the two alike.
 */
export const PI_SKILL_WRAPPER =
  /^<skill name="([^"]+)" location="[^"]*">\nReferences are relative to [^\n]*\n\n[\s\S]*?\n<\/skill>(?:\n\n([\s\S]*))?$/;

/**
 * The same block when the old logger cut it: the extension kept the first 50,000
 * characters and added its own marker (`truncate`, `.pi/extensions/mirror-logger.ts`),
 * so the closing tag never arrived. Pi's opening lines, then an ending only the
 * logger writes: no person types that. Whatever followed the block was cut with it.
 */
const PI_SKILL_WRAPPER_CUT =
  /^<skill name="([^"]+)" location="[^"]*">\nReferences are relative to [^\n]*\n\n[\s\S]*\n\[… truncated\]$/;

/** The one skill whose turn is conversation: its question is the turn. */
const MIRROR_SKILL = "mm-mirror";

export interface StoredSkillTurn {
  messageId: string;
  conversationId: string;
  skill: string;
  /** What followed the block, trimmed; "" when nothing did. */
  tail: string;
  /** The Mirror question the row keeps, or null when the row goes. */
  question: string | null;
}

export interface ConversationToDelete {
  id: string;
  title: string | null;
  messageCount: number;
  startedAt: string;
}

export interface ConversationToRetitle {
  id: string;
  title: string;
  newTitle: string;
}

export interface SkillTurnRepairPlan {
  /** Every stored skill turn, in the order the rows were written. */
  turns: StoredSkillTurn[];
  /** The Mirror questions: each row keeps its question. */
  kept: StoredSkillTurn[];
  /** Every other skill turn: each row goes. */
  removed: StoredSkillTurn[];
  conversationsToDelete: ConversationToDelete[];
  conversationsToRetitle: ConversationToRetitle[];
}

export interface SkillTurnRepairResult {
  kept: number;
  removed: number;
  conversationsDeleted: number;
  /** Messages that went with the deleted conversations, beyond the removed turns. */
  messagesDeletedWithConversations: number;
  conversationsRetitled: number;
}

/** The set the transaction found is not the set the person was shown. */
export class SkillTurnRepairSetMovedError extends Error {
  constructor() {
    super("the stored skill turns changed since they were listed");
    this.name = "SkillTurnRepairSetMovedError";
  }
}

/** The skill turn a stored row holds, or null when the row is not Pi's whole wrapper. */
export function readSkillTurn(content: string): { skill: string; tail: string } | null {
  const match = PI_SKILL_WRAPPER.exec(content);
  if (match) return { skill: match[1] as string, tail: (match[2] ?? "").trim() };
  const cut = PI_SKILL_WRAPPER_CUT.exec(content);
  if (cut) return { skill: cut[1] as string, tail: "" };
  return null;
}

function isManualTitle(rawMetadata: unknown): boolean {
  if (typeof rawMetadata !== "string") return false;
  try {
    const metadata = JSON.parse(rawMetadata) as Record<string, unknown>;
    return metadata.title_status === "manual" || metadata.title_source === "manual";
  } catch {
    return false;
  }
}

/**
 * What the repair would change, decided once for the dry run and again inside the
 * repair's transaction.
 */
export function planSkillTurnRepair(db: Database): SkillTurnRepairPlan {
  // SQL narrows to the prefix; `readSkillTurn` decides on the whole wrapper.
  const candidates = db
    .prepare(
      `SELECT m.id, m.conversation_id, m.content
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE c.interface = 'pi' AND m.role = 'user' AND substr(m.content, 1, 13) = '<skill name="'
        ORDER BY m.created_at, m.rowid`,
    )
    .all();
  const turns: StoredSkillTurn[] = [];
  for (const row of candidates) {
    const read = readSkillTurn(String(row.content));
    if (read === null) continue;
    const question = read.skill === MIRROR_SKILL && read.tail !== "" ? read.tail : null;
    turns.push({
      messageId: String(row.id),
      conversationId: String(row.conversation_id),
      skill: read.skill,
      tail: read.tail,
      question,
    });
  }
  const kept = turns.filter((turn) => turn.question !== null);
  const removed = turns.filter((turn) => turn.question === null);
  const removedIds = new Set(removed.map((turn) => turn.messageId));
  const keptQuestion = new Map(kept.map((turn) => [turn.messageId, turn.question as string]));

  // A conversation the repair leaves with no user turn goes. Otherwise a block-born
  // title is rebuilt from its first remaining user turn that is not a command: a
  // command is not conversation (`commandTurn.ts`), so it names one only when
  // nothing else remains.
  const touched = [...new Set(turns.map((turn) => turn.conversationId))];
  const userRows = db.prepare(
    `SELECT id, content FROM messages WHERE conversation_id = ? AND role = 'user'
      ORDER BY created_at, rowid`,
  );
  const remainingUserTurns = (conversationId: string, removing: ReadonlySet<string>): string[] =>
    userRows
      .all(conversationId)
      .filter((row) => !removing.has(String(row.id)))
      .map((row) => keptQuestion.get(String(row.id)) ?? String(row.content))
      .filter((content) => content.trim() !== "");
  const titleSource = (remaining: readonly string[]): string | null =>
    remaining.find((content) => !isCommandTurn(content)) ?? remaining[0] ?? null;
  const remainingFirstUser = new Map<string, string | null>();
  for (const conversationId of touched) {
    remainingFirstUser.set(
      conversationId,
      titleSource(remainingUserTurns(conversationId, removedIds)),
    );
  }

  const conversationRow = db.prepare(
    `SELECT id, title, started_at, metadata,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c WHERE id = ?`,
  );
  const conversationsToDelete: ConversationToDelete[] = [];
  for (const conversationId of touched) {
    if (remainingFirstUser.get(conversationId) !== null) continue;
    const row = conversationRow.get(conversationId);
    if (!row) continue;
    conversationsToDelete.push({
      id: conversationId,
      title: typeof row.title === "string" ? row.title : null,
      messageCount: Number(row.message_count),
      startedAt: String(row.started_at),
    });
  }
  const deleting = new Set(conversationsToDelete.map((item) => item.id));

  // Titles born of a block, in any Pi conversation that stays, unless set by hand.
  const titled = db
    .prepare(
      `SELECT id, title, metadata FROM conversations
        WHERE interface = 'pi' AND lower(substr(trim(title), 1, 6)) = '<skill'
        ORDER BY started_at, id`,
    )
    .all();
  const conversationsToRetitle: ConversationToRetitle[] = [];
  for (const row of titled) {
    const id = String(row.id);
    if (deleting.has(id) || isManualTitle(row.metadata)) continue;
    const source = remainingFirstUser.has(id)
      ? remainingFirstUser.get(id)
      : titleSource(remainingUserTurns(id, new Set()));
    if (!source || readSkillTurn(source) !== null) continue;
    const newTitle = generateTitle(source).trim();
    if (newTitle === "") continue;
    conversationsToRetitle.push({ id, title: String(row.title), newTitle });
  }

  return { turns, kept, removed, conversationsToDelete, conversationsToRetitle };
}

/** One string that names everything a plan changes, to compare a plan with the one shown. */
export function skillTurnRepairKey(plan: SkillTurnRepairPlan): string {
  const sorted = (values: readonly string[]) => [...values].sort().join(",");
  return [
    sorted(plan.kept.map((turn) => turn.messageId)),
    sorted(plan.removed.map((turn) => turn.messageId)),
    sorted(plan.conversationsToDelete.map((item) => item.id)),
    sorted(plan.conversationsToRetitle.map((item) => `${item.id}=${item.newTitle}`)),
  ].join("|");
}

/**
 * Repair what the plan names, in one transaction: all or nothing. The plan is
 * decided again inside the transaction and must be the one the person was shown
 * (`expectedKey`); if it moved, nothing changes.
 */
export function applySkillTurnRepair(
  db: WritableDatabase,
  expectedKey: string,
): SkillTurnRepairResult {
  return withTransaction(db, () => {
    const plan = planSkillTurnRepair(db);
    if (skillTurnRepairKey(plan) !== expectedKey) throw new SkillTurnRepairSetMovedError();
    const keepQuestion = db.prepare("UPDATE messages SET content = ? WHERE id = ?");
    for (const turn of plan.kept) keepQuestion.run(turn.question as string, turn.messageId);
    const removeTurn = db.prepare("DELETE FROM messages WHERE id = ?");
    for (const turn of plan.removed) removeTurn.run(turn.messageId);
    const remainingMessages = db.prepare(
      "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?",
    );
    let messagesDeletedWithConversations = 0;
    for (const item of plan.conversationsToDelete) {
      messagesDeletedWithConversations += Number(remainingMessages.get(item.id)?.n ?? 0);
      deleteConversation(db, item.id);
    }
    for (const item of plan.conversationsToRetitle) setProvisionalTitle(db, item.id, item.newTitle);
    return {
      kept: plan.kept.length,
      removed: plan.removed.length,
      conversationsDeleted: plan.conversationsToDelete.length,
      messagesDeletedWithConversations,
      conversationsRetitled: plan.conversationsToRetitle.length,
    };
  });
}
