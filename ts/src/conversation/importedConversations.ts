// The Pi conversations an earlier version imported rather than logged (CR154).
//
// Until v0.36.1, session maintenance copied Pi session files into the home and
// imported each as a closed conversation (CR153 retired that). On a machine
// with two homes, each took the other's sessions, along with sessions of Pi run
// without Mirror and of scratch homes. This module lets a person see them and
// remove the ones they choose. It reads no Pi file: everything it knows, the
// home already holds.
//
// An import is told apart by construction: the import stamped `started_at` when
// it copied the session and `ended_at` from the session's last message, so an
// import starts at or after its own end, and a live conversation never does.
// Both instants must carry a zone. A conversation with a zone-less timestamp is
// never an import, whatever the order says: the comparison would be a guess,
// and the guess would offer a live conversation for removal.
//
// Where an import came from is the directory of its session file, read from
// the path its runtime-session row stored (Pi names a project's directory
// `--<path with / as ->--`; the wrapping dashes are dropped). Beside it, how
// many Pi sessions this home logged live from the same directory -- the one
// number that tells another home's work (none logged live here) from this
// home's own gaps. It blurs in a home made by copying another: the copied rows
// count as its own.

import { basename, dirname } from "node:path";
import { deleteConversation } from "#conversation/conversationDeletion.ts";
import { type Database, type WritableDatabase, withTransaction } from "#db/database.ts";

/** The folder of an import with no runtime-session row left to say where it came from. */
export const UNKNOWN_FOLDER = "(unknown)";

/** How much of an id a person must give to name one conversation: what the listing prints. */
export const MIN_ID_PREFIX = 8;

export interface ImportedConversation {
  id: string;
  title: string | null;
  /** When it was imported: the conversation's `started_at`. */
  importedAt: string;
  /** The session's last message: the conversation's `ended_at`. */
  endedAt: string;
  messageCount: number;
  folder: string;
}

export interface FolderSummary {
  folder: string;
  imported: number;
  messages: number;
  /** Pi sessions this home logged live from the folder; null for the unknown folder. */
  loggedLive: number | null;
}

export interface ImportsSummary {
  conversations: number;
  messages: number;
  firstImportedAt: string | null;
  lastImportedAt: string | null;
  /** Most imported first, then by name; the unknown folder last. */
  folders: FolderSummary[];
}

/** Ids, each a full id or a prefix of at least `MIN_ID_PREFIX`; or every import, of one folder or all. */
export type ImportRemovalRequest =
  | { readonly ids: readonly string[] }
  | { readonly all: true; readonly folder: string | null };

export type ImportRemovalPlan =
  | { ok: true; conversations: ImportedConversation[] }
  | { ok: false; refusal: string };

export interface ImportRemovalResult {
  conversations: ImportedConversation[];
  messages: number;
}

/** The plan refused the request inside the removal's transaction. */
export class ImportRemovalRefusedError extends Error {
  constructor(refusal: string) {
    super(refusal);
    this.name = "ImportRemovalRefusedError";
  }
}

/** The set the transaction found is not the set the person was shown. */
export class ImportRemovalSetMovedError extends Error {
  constructor() {
    super("the imports to remove changed since they were listed");
    this.name = "ImportRemovalSetMovedError";
  }
}

const ZONED = /(?:Z|[+-]\d{2}:\d{2})$/;

/** An import starts at or after its own last message; both instants carry a zone. */
export function isImportShaped(startedAt: string, endedAt: string | null): boolean {
  if (endedAt === null || !ZONED.test(startedAt) || !ZONED.test(endedAt)) return false;
  const started = Date.parse(startedAt);
  const ended = Date.parse(endedAt);
  if (Number.isNaN(started) || Number.isNaN(ended)) return false;
  return started >= ended;
}

/** The directory a Pi session file lived in, from its stored path; Pi's wrapping dashes dropped. */
export function sessionFolder(sessionPath: string | null): string {
  if (!sessionPath) return UNKNOWN_FOLDER;
  const parent = dirname(sessionPath);
  const name = basename(parent);
  if (parent === "." || parent === sessionPath || !name) return UNKNOWN_FOLDER;
  return name.length > 4 && name.startsWith("--") && name.endsWith("--") ? name.slice(2, -2) : name;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Every Pi import in the home, newest import first. */
export function listImportedPiConversations(db: Database): ImportedConversation[] {
  // SQL narrows to the shape; `isImportShaped` decides, zones included.
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.started_at, c.ended_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
              (SELECT r.session_id FROM runtime_sessions r
                WHERE r.conversation_id = c.id ORDER BY r.rowid LIMIT 1) AS session_path
         FROM conversations c
        WHERE c.interface = 'pi' AND c.ended_at IS NOT NULL
          AND julianday(c.started_at) >= julianday(c.ended_at)
        ORDER BY julianday(c.started_at) DESC, c.id`,
    )
    .all();
  const imports: ImportedConversation[] = [];
  for (const row of rows) {
    const startedAt = String(row.started_at);
    const endedAt = nullableString(row.ended_at);
    if (endedAt === null || !isImportShaped(startedAt, endedAt)) continue;
    imports.push({
      id: String(row.id),
      title: nullableString(row.title),
      importedAt: startedAt,
      endedAt,
      messageCount: Number(row.message_count),
      folder: sessionFolder(nullableString(row.session_path)),
    });
  }
  return imports;
}

/** Pi sessions this home logged live, by the folder their session file lived in. */
export function countLiveSessionsByFolder(db: Database): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT r.session_id, c.started_at, c.ended_at
         FROM runtime_sessions r JOIN conversations c ON c.id = r.conversation_id
        WHERE r.interface = 'pi' AND c.interface = 'pi'`,
    )
    .all();
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (isImportShaped(String(row.started_at), nullableString(row.ended_at))) continue;
    const folder = sessionFolder(nullableString(row.session_id));
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return counts;
}

/** Totals and one line per folder, for the listing. */
export function summarizeImports(
  imports: readonly ImportedConversation[],
  loggedLive: ReadonlyMap<string, number>,
): ImportsSummary {
  const byFolder = new Map<string, FolderSummary>();
  let messages = 0;
  let first: string | null = null;
  let last: string | null = null;
  for (const item of imports) {
    messages += item.messageCount;
    if (first === null || Date.parse(item.importedAt) < Date.parse(first)) first = item.importedAt;
    if (last === null || Date.parse(item.importedAt) > Date.parse(last)) last = item.importedAt;
    const summary = byFolder.get(item.folder) ?? {
      folder: item.folder,
      imported: 0,
      messages: 0,
      loggedLive: item.folder === UNKNOWN_FOLDER ? null : (loggedLive.get(item.folder) ?? 0),
    };
    summary.imported += 1;
    summary.messages += item.messageCount;
    byFolder.set(item.folder, summary);
  }
  const folders = [...byFolder.values()].sort((a, b) => {
    if ((a.folder === UNKNOWN_FOLDER) !== (b.folder === UNKNOWN_FOLDER)) {
      return a.folder === UNKNOWN_FOLDER ? 1 : -1;
    }
    return b.imported - a.imported || a.folder.localeCompare(b.folder);
  });
  return {
    conversations: imports.length,
    messages,
    firstImportedAt: first,
    lastImportedAt: last,
    folders,
  };
}

function refuse(refusal: string): ImportRemovalPlan {
  return { ok: false, refusal };
}

/**
 * What a request names, decided once for the dry run and again inside the
 * removal's transaction. Any id that does not name exactly one import refuses
 * the whole request: nothing is removed on a partial match.
 */
export function planImportRemoval(db: Database, request: ImportRemovalRequest): ImportRemovalPlan {
  const imports = listImportedPiConversations(db);
  if ("all" in request) {
    if (request.folder === null) return { ok: true, conversations: imports };
    const named = imports.filter((item) => item.folder === request.folder);
    if (named.length === 0) {
      return refuse(
        `no imported conversations from folder '${request.folder}' in this home: the listing names the folders that have them, exactly`,
      );
    }
    return { ok: true, conversations: named };
  }

  const byId = new Map(imports.map((item) => [item.id, item]));
  const chosen = new Map<string, ImportedConversation>();
  // `substr` rather than LIKE: an id the person types is matched as written,
  // never as a pattern.
  const matching = db.prepare("SELECT id FROM conversations WHERE substr(id, 1, ?) = ?");
  for (const given of request.ids) {
    if (given.length < MIN_ID_PREFIX) {
      return refuse(
        `'${given}' is too short: give at least ${MIN_ID_PREFIX} characters of a conversation id, as the listing prints them`,
      );
    }
    const matches = matching.all(given.length, given).map((row) => String(row.id));
    if (matches.length === 0) return refuse(`no conversation '${given}' in this home`);
    if (matches.length > 1) {
      return refuse(`'${given}' matches ${matches.length} conversations: give more of the id`);
    }
    const id = matches[0] as string;
    const imported = byId.get(id);
    if (imported === undefined) {
      return refuse(
        `conversation ${id.slice(0, MIN_ID_PREFIX)} is not an imported Pi conversation; this command removes only those`,
      );
    }
    chosen.set(id, imported);
  }
  return { ok: true, conversations: imports.filter((item) => chosen.has(item.id)) };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, index) => id === sortedB[index]);
}

/**
 * Remove what the request names, in one transaction: all or nothing. The set is
 * decided again inside the transaction and must be the one the person was
 * shown (`expectedIds`); if it moved, nothing is removed. Each import's session
 * row goes with it -- it bound nothing but the import -- and the conversation
 * goes through the shared deletion.
 */
export function removeImportedConversations(
  db: WritableDatabase,
  request: ImportRemovalRequest,
  expectedIds: readonly string[],
): ImportRemovalResult {
  return withTransaction(db, () => {
    const plan = planImportRemoval(db, request);
    if (!plan.ok) throw new ImportRemovalRefusedError(plan.refusal);
    const ids = plan.conversations.map((item) => item.id);
    if (!sameIds(ids, expectedIds)) throw new ImportRemovalSetMovedError();
    const removeSessionRows = db.prepare("DELETE FROM runtime_sessions WHERE conversation_id = ?");
    let messages = 0;
    for (const item of plan.conversations) {
      removeSessionRows.run(item.id);
      deleteConversation(db, item.id);
      messages += item.messageCount;
    }
    return { conversations: plan.conversations, messages };
  });
}
