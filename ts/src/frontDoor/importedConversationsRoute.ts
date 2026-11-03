// `mirror conversations imported` (CR154): see the Pi conversations an earlier
// version imported rather than logged, and remove the ones a person names.
//
//   conversations imported [--project TEXT]
//   conversations imported remove (ID... | --all [--project FOLDER]) [--apply]
//
// Folders first: a home holds hundreds of imports, and the decision a person
// makes is about where they came from. Removal is a dry run until `--apply`,
// which decides the set first (refusals and an empty set stop there, with no
// backup), takes the dated backup and verifies it, and only then removes, in
// one transaction that decides the set again and refuses if it moved. Every
// option is declared: a typo is refused before anything opens, because under a
// lenient parser a misspelled `--project` would widen a removal to every import
// in the home.
//
// The module that decides what an import is, and removes it, is
// `#conversation/importedConversations.ts`; this file parses, opens, and
// prints. Nothing here is offered to a model: no MCP tool, no skill.

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArchiveStamp, RETENTION_DAYS } from "#backup/zipBackup.ts";
import {
  countLiveSessionsByFolder,
  type ImportedConversation,
  ImportRemovalRefusedError,
  type ImportRemovalRequest,
  ImportRemovalSetMovedError,
  listImportedPiConversations,
  planImportRemoval,
  removeImportedConversations,
  summarizeImports,
} from "#conversation/importedConversations.ts";
import type { Database, WritableDatabase } from "#db/database.ts";
import { PROGRAM } from "#util/program.ts";
import { shellWord } from "#util/shellWord.ts";
import { parseArgs } from "#util/strictArgs.ts";
import { backupPathFor } from "./liveBackup.ts";

const USAGE = [
  `usage: ${PROGRAM} conversations imported [--project TEXT] [--mirror-home PATH] [--db-path PATH]`,
  `       ${PROGRAM} conversations imported remove (ID ... | --all [--project FOLDER]) [--apply] [--mirror-home PATH] [--db-path PATH]`,
].join("\n");

/** How argparse names the program in an error line. */
const PROG = `${PROGRAM} conversations imported`;

const WHAT_AN_IMPORT_IS =
  "Mirror copied these from Pi's session files instead of logging them as they happened. " +
  "Since v0.36.1 it imports none.";

const HOME_OPTIONS = ["--mirror-home", "--db-path"] as const;

export interface ImportedConversationsIo {
  /** The home's database, read-only: the listing and the dry run. */
  withReadOnlyDatabase: (read: (db: Database) => number) => number;
  /** The home's database behind the front door's pre-write backup: `--apply` only. */
  withLiveWriteDatabase: (write: (db: WritableDatabase, dbPath: string) => number) => number;
  /** The dated archive `repair-journeys --apply` gates on; its path, or null on failure. */
  backup: (dbPath: string) => string | null;
  verifyBackup: (archivePath: string) => { valid: boolean; note: string | null };
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export function isImportedConversationsCommand(argv: readonly string[]): boolean {
  return argv[0] === "conversations" && argv[1] === "imported";
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function day(instant: string): string {
  return instant.slice(0, 10);
}

function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function byFolder(conversations: readonly ImportedConversation[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of conversations) counts.set(item.folder, (counts.get(item.folder) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function messagesIn(conversations: readonly ImportedConversation[]): number {
  return conversations.reduce((sum, item) => sum + item.messageCount, 0);
}

export function runImportedConversationsRoute(
  argv: readonly string[],
  io: ImportedConversationsIo,
): number {
  const out = io.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const err = io.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  const usageError = (message: string): number => {
    err(USAGE);
    err(`${PROG}: error: ${message}`);
    return 2;
  };

  const rest = argv.slice(2);
  if (rest.includes("-h") || rest.includes("--help")) {
    out(USAGE);
    return 0;
  }
  const removing = rest[0] === "remove";
  const parsed = parseArgs(removing ? rest.slice(1) : rest, {
    flags: removing ? ["--all", "--apply"] : [],
    valued: ["--project", ...HOME_OPTIONS],
    positionals: removing,
  });
  if (parsed.error) return usageError(parsed.error);
  const project = parsed.values.get("--project") ?? null;

  if (!removing) return list(io, out, project);

  const ids = parsed.positionals;
  const all = parsed.flags.has("--all");
  if (ids.length > 0 && all) return usageError("give conversation ids or --all, not both");
  if (ids.length === 0 && !all) return usageError("give conversation ids, or --all");
  if (project !== null && !all) {
    return usageError("--project narrows --all; give it with --all, not with ids");
  }
  const request: ImportRemovalRequest = all ? { all: true, folder: project } : { ids };

  if (!parsed.flags.has("--apply")) {
    // The command that applies this dry run, to the same home, every value quoted.
    const words = ["conversations", "imported", "remove"];
    if (all) {
      words.push("--all");
      if (project !== null) words.push("--project", project);
    } else {
      words.push(...ids);
    }
    for (const option of HOME_OPTIONS) {
      const value = parsed.values.get(option);
      if (value !== undefined) words.push(option, value);
    }
    words.push("--apply");
    const applyCommand = [PROGRAM, ...words.map(shellWord)].join(" ");
    return dryRun(io, out, err, request, applyCommand);
  }
  return apply(io, out, err, request);
}

function list(
  io: ImportedConversationsIo,
  out: (line: string) => void,
  project: string | null,
): number {
  return io.withReadOnlyDatabase((db) => {
    const imports = listImportedPiConversations(db);
    if (imports.length === 0) {
      out("No imported Pi conversations in this home.");
      return 0;
    }
    const needle = project?.toLowerCase() ?? null;
    const shown =
      needle === null
        ? imports
        : imports.filter((item) => item.folder.toLowerCase().includes(needle));
    if (shown.length === 0) {
      out(`No imported Pi conversations from a folder matching '${project}'.`);
      return 0;
    }
    const summary = summarizeImports(shown, countLiveSessionsByFolder(db));
    const scope = project === null ? "" : `, from folders matching '${project}'`;
    out(
      `Imported Pi conversations: ${summary.conversations} (${plural(summary.messages, "message")}), ` +
        `imported ${day(summary.firstImportedAt ?? "")} to ${day(summary.lastImportedAt ?? "")}${scope}.`,
    );
    out(WHAT_AN_IMPORT_IS);
    out("");
    out("  imported  logged live here  folder");
    for (const folder of summary.folders) {
      const live = folder.loggedLive === null ? "-" : String(folder.loggedLive);
      out(`${String(folder.imported).padStart(10)}${live.padStart(18)}  ${folder.folder}`);
    }
    if (project !== null) {
      out("");
      for (const item of shown) {
        out(
          `  ${day(item.importedAt)}  ${item.id}  ${plural(item.messageCount, "msg")}  ${item.folder}  ${item.title ?? "(untitled)"}`,
        );
      }
    }
    out("");
    out(`To see a folder's conversations:  ${PROGRAM} conversations imported --project <text>`);
    out(
      `To remove a folder's imports:     ${PROGRAM} conversations imported remove --all --project <folder>`,
    );
    out("                                  (it shows what it would remove; add --apply to remove)");
    return 0;
  });
}

function dryRun(
  io: ImportedConversationsIo,
  out: (line: string) => void,
  err: (line: string) => void,
  request: ImportRemovalRequest,
  applyCommand: string,
): number {
  return io.withReadOnlyDatabase((db) => {
    const plan = planImportRemoval(db, request);
    if (!plan.ok) {
      err(`${plan.refusal}. Nothing was removed.`);
      return 1;
    }
    if (plan.conversations.length === 0) {
      out("Nothing to remove.");
      return 0;
    }
    out(
      `Would remove ${plural(plan.conversations.length, "imported Pi conversation")} ` +
        `(${plural(messagesIn(plan.conversations), "message")}):`,
    );
    for (const [folder, count] of byFolder(plan.conversations)) {
      out(`${String(count).padStart(10)}  ${folder}`);
    }
    out("Nothing was removed. To remove them, run:");
    out(`  ${applyCommand}`);
    return 0;
  });
}

function apply(
  io: ImportedConversationsIo,
  out: (line: string) => void,
  err: (line: string) => void,
  request: ImportRemovalRequest,
): number {
  // Decide first, read-only: a refusal or an empty set stops here, and takes no
  // backup. A holder rather than a variable: it is assigned inside a callback.
  const decided: { conversations: ImportedConversation[] | null } = { conversations: null };
  const decidedCode = io.withReadOnlyDatabase((db) => {
    const plan = planImportRemoval(db, request);
    if (!plan.ok) {
      err(`${plan.refusal}. Nothing was removed.`);
      return 1;
    }
    if (plan.conversations.length === 0) {
      out("Nothing to remove.");
      return 0;
    }
    decided.conversations = plan.conversations;
    return 0;
  });
  const expected = decided.conversations;
  if (decidedCode !== 0 || expected === null) return decidedCode;

  return io.withLiveWriteDatabase((db, dbPath) => {
    let archive: string | null;
    try {
      archive = io.backup(dbPath);
    } catch {
      archive = null;
    }
    if (archive === null) {
      err("The backup failed, so nothing was removed.");
      return 1;
    }
    const verification = io.verifyBackup(archive);
    if (!verification.valid) {
      err(
        `The backup ${archive} did not verify (${verification.note ?? "no reason given"}), so nothing was removed.`,
      );
      return 1;
    }
    let removed: { conversations: ImportedConversation[]; messages: number };
    try {
      removed = removeImportedConversations(
        db,
        request,
        expected.map((item) => item.id),
      );
    } catch (error) {
      if (error instanceof ImportRemovalSetMovedError) {
        err(
          "The imports changed while the backup was taken, so nothing was removed. Run it again.",
        );
        return 1;
      }
      if (error instanceof ImportRemovalRefusedError) {
        err(`${error.message}. Nothing was removed.`);
        return 1;
      }
      throw error;
    }
    out(`Backup: ${archive} (verified).`);
    out(
      `Removed ${plural(removed.conversations.length, "imported Pi conversation")} ` +
        `(${plural(removed.messages, "message")}) from ${plural(byFolder(removed.conversations).length, "folder")}.`,
    );
    out("Memories and provider-call records that named them were kept, unlinked.");
    for (const line of backupsHoldingCopies(dbPath, removed.conversations)) out(line);
    return 0;
  });
}

/**
 * Where copies of what was just removed still live: the dated archives made
 * since the earliest removed import, and the pre-write backup. Named so a person
 * can delete them; nothing here deletes them.
 */
function backupsHoldingCopies(dbPath: string, removed: readonly ImportedConversation[]): string[] {
  // An archive made before the earliest removed import cannot hold any of them.
  const since = Math.min(...removed.map((item) => Date.parse(item.importedAt)));
  const backupsDir = join(dirname(dbPath), "backups");
  const archives = existsSync(backupsDir)
    ? readdirSync(backupsDir)
        .map((name) => ({ name, made: parseArchiveStamp(name) }))
        .filter((entry): entry is { name: string; made: Date } => entry.made !== null)
        .filter((entry) => entry.made.getTime() >= since)
        .sort((a, b) => a.made.getTime() - b.made.getTime())
    : [];
  const preWrite = backupPathFor(dbPath);
  const lines: string[] = [];
  if (archives.length > 0) {
    const oldest = localDay((archives[0] as { made: Date }).made);
    const newest = localDay((archives[archives.length - 1] as { made: Date }).made);
    const made = oldest === newest ? oldest : `${oldest} to ${newest}`;
    lines.push(
      `  ${plural(archives.length, "dated archive")} in ${backupsDir}, made ${made} ` +
        `(archives are removed after ${RETENTION_DAYS} days);`,
    );
  }
  if (existsSync(preWrite)) {
    lines.push(`  the pre-write backup ${preWrite} (replaced by the next write).`);
  }
  if (lines.length === 0) return ["No backup in this home holds a copy."];
  return ["Copies remain in this home's backups until you delete them or they age out:", ...lines];
}
