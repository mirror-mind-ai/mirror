// `runtime backup` — create, VERIFY, and say how to recover (CV22.DS10.US2).
//
// Not the `backup` command DS7.TS1 ported. That one creates an archive and
// stops; this one is the updater's safety stage, and the promise it makes is
// "a backup exists and was verified before the tree moved". Three functions,
// characterized from `src/memory/cli/runtime.py:1052-1113`, with exactly one
// deliberate difference, documented on `verifyBackupArchive`.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NotAReadableZipError, readZipEntry, readZipEntryNames } from "#backup/zipReader.ts";
import { quickCheckDatabaseFile } from "#db/database.ts";

/** The member every Mirror backup must hold. */
const ARCHIVE_MEMBER = "memory.db";
/** The only members it may hold: the database and SQLite's own sidecars. */
const ALLOWED_MEMBERS = new Set(["memory.db", "memory.db-wal", "memory.db-shm"]);

export interface BackupVerification {
  backupPath: string;
  valid: boolean;
  entries: string[];
  note: string | null;
}

function refuse(backupPath: string, entries: string[], note: string): BackupVerification {
  return { backupPath, valid: false, entries, note };
}

/** Python's `Path(entry).is_absolute() or ".." in Path(entry).parts`. */
function isUnsafeEntry(name: string): boolean {
  if (name.startsWith("/")) return true;
  // Windows-shaped absolutes, which `PurePath` would not call absolute on
  // POSIX but which no Mirror archive has any reason to carry.
  if (/^[A-Za-z]:[\\/]/.test(name)) return true;
  return name.split(/[\\/]/).includes("..");
}

/**
 * Does this database open and pass SQLite's own consistency check?
 *
 * THE ONE DELIBERATE DEVIATION FROM THE ORACLE. Python verifies entry NAMES:
 * an archive holding a `memory.db` of 4 KB of zeros is reported `valid`, which
 * is measured and recorded in the story's plateau-0 baseline. The updater
 * relies on this verdict immediately before it moves the tree, so a backup
 * that has never been opened is a belief rather than a backup.
 *
 * Runs on an extracted copy in a temp dir removed afterwards: the archive is
 * untrusted input and this never touches the live database. The check itself
 * goes through `#db/database.ts`, the one module allowed to hold the driver --
 * an external `sqlite3` binary is not guaranteed on a user's machine, and a
 * second SQLite access path is not something a verifier should introduce.
 */
function integrityNote(data: Buffer): string | null {
  const dir = mkdtempSync(join(tmpdir(), "mirror-verify-"));
  const path = join(dir, ARCHIVE_MEMBER);
  try {
    writeFileSync(path, data, { mode: 0o600 });
    const { ok, verdict } = quickCheckDatabaseFile(path);
    return ok ? null : `${ARCHIVE_MEMBER} failed integrity check: ${verdict}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Port of `verify_backup_archive`, in the oracle's order of refusal. */
export function verifyBackupArchive(backupPath: string): BackupVerification {
  if (!existsSync(backupPath)) return refuse(backupPath, [], "backup file not found");

  let entries: string[];
  let buffer: Buffer;
  try {
    buffer = readFileSync(backupPath);
    entries = readZipEntryNames(buffer);
  } catch (error) {
    if (error instanceof NotAReadableZipError) {
      return refuse(backupPath, [], "backup file is not a readable zip");
    }
    throw error;
  }

  // Before anything is read OUT of the archive: an entry that would escape the
  // Mirror home is refused, with the names still reported so the operator can
  // see what it held.
  for (const entry of entries) {
    if (isUnsafeEntry(entry)) return refuse(backupPath, entries, `unsafe archive entry: ${entry}`);
  }
  if (!entries.includes(ARCHIVE_MEMBER)) {
    return refuse(backupPath, entries, `${ARCHIVE_MEMBER} missing from backup`);
  }
  const unexpected = entries.filter((entry) => !ALLOWED_MEMBERS.has(entry));
  if (unexpected.length > 0) {
    return refuse(backupPath, entries, `unexpected archive entries: ${unexpected.join(", ")}`);
  }

  let member: Buffer | null;
  try {
    member = readZipEntry(buffer, ARCHIVE_MEMBER);
  } catch (error) {
    if (error instanceof NotAReadableZipError) {
      return refuse(backupPath, entries, `${ARCHIVE_MEMBER} failed to open: ${error.message}`);
    }
    throw error;
  }
  if (member === null) {
    return refuse(backupPath, entries, `${ARCHIVE_MEMBER} missing from backup`);
  }
  const note = integrityNote(member);
  if (note !== null) return refuse(backupPath, entries, note);

  return { backupPath, valid: true, entries, note: null };
}

/** Port of `render_backup_verification`. */
export function renderBackupVerification(verification: BackupVerification): string {
  const lines = ["Mirror runtime backup verification", ""];
  lines.push(`Backup: ${verification.backupPath}`);
  if (verification.entries.length > 0) lines.push(`Entries: ${verification.entries.join(", ")}`);
  if (verification.note) lines.push(`Verification note: ${verification.note}`);
  lines.push(`Verification result: ${verification.valid ? "valid" : "invalid"}`);
  return `${lines.join("\n")}\n`;
}

export interface BackupCreatedInput {
  backupPath: string;
  mirrorHome: string;
  verification: BackupVerification;
}

/** Port of `render_runtime_backup_created`, recovery route included. */
export function renderRuntimeBackupCreated(input: BackupCreatedInput): string {
  const lines = ["Mirror runtime backup", ""];
  lines.push(`Mirror home: ${input.mirrorHome}`);
  lines.push(`Backup: ${input.backupPath}`);
  lines.push(`Verification result: ${input.verification.valid ? "valid" : "invalid"}`);
  if (input.verification.entries.length > 0) {
    lines.push(`Entries: ${input.verification.entries.join(", ")}`);
  }
  if (input.verification.note) lines.push(`Verification note: ${input.verification.note}`);
  lines.push("");
  lines.push("Manual recovery route:");
  lines.push("  1. Stop active runtime sessions that could write to the database.");
  lines.push("  2. Move current memory.db, memory.db-wal, and memory.db-shm aside.");
  lines.push("  3. Extract memory.db and sidecars from this backup into the Mirror home.");
  lines.push("  4. Run runtime status against the Mirror home.");
  lines.push("  5. Do not retry update execution until status is ready.");
  lines.push("");
  lines.push("Recovery is manual in this version; no files were restored.");
  return `${lines.join("\n")}\n`;
}
