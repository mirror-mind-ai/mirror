// `mirror conversations skill-turns` (CR160): see the Pi user turns an earlier
// version stored as a skill's body, and repair them.
//
//   conversations skill-turns [--apply] [--mirror-home PATH] [--db-path PATH]
//
// A dry run until `--apply`. The dry run names what the repair would change: by
// skill, how many rows keep their Mirror question and how many go; each
// conversation it would delete because it leaves it with no user turn, with its
// message count (A7); how many titles it would rebuild. `--apply` decides first
// (nothing to repair stops there, with no backup), takes the dated backup and
// verifies it, and only then repairs, in one transaction that decides again and
// refuses if anything moved. Every option is declared: a typo is refused before
// anything opens. Shaped as CR154's `conversations imported remove`.
//
// The module that decides what a stored skill turn is, and repairs it, is
// `#conversation/piSkillTurns.ts`; this file parses, opens, and prints. Nothing
// here is offered to a model: no MCP tool, no skill.

import { RETENTION_DAYS } from "#backup/zipBackup.ts";
import {
  applySkillTurnRepair,
  planSkillTurnRepair,
  type SkillTurnRepairPlan,
  type SkillTurnRepairResult,
  SkillTurnRepairSetMovedError,
  skillTurnRepairKey,
} from "#conversation/piSkillTurns.ts";
import type { Database, WritableDatabase } from "#db/database.ts";
import { PROGRAM } from "#util/program.ts";
import { shellWord } from "#util/shellWord.ts";
import { parseArgs } from "#util/strictArgs.ts";

const USAGE = `usage: ${PROGRAM} conversations skill-turns [--apply] [--mirror-home PATH] [--db-path PATH]`;

/** How argparse names the program in an error line. */
const PROG = `${PROGRAM} conversations skill-turns`;

const WHAT_A_SKILL_TURN_IS =
  "Until CR160, Mirror recorded the skill Pi expanded, instead of what was typed.";

const HOME_OPTIONS = ["--mirror-home", "--db-path"] as const;

export interface SkillTurnsIo {
  /** The home's database, read-only: the dry run, and the decision before `--apply`. */
  withReadOnlyDatabase: (read: (db: Database) => number) => number;
  /** The home's database behind the front door's pre-write backup: `--apply` only. */
  withLiveWriteDatabase: (write: (db: WritableDatabase, dbPath: string) => number) => number;
  /** The dated archive; its path, or null on failure. */
  backup: (dbPath: string) => string | null;
  verifyBackup: (archivePath: string) => { valid: boolean; note: string | null };
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export function isSkillTurnsCommand(argv: readonly string[]): boolean {
  return argv[0] === "conversations" && argv[1] === "skill-turns";
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function isEmpty(plan: SkillTurnRepairPlan): boolean {
  return plan.turns.length === 0 && plan.conversationsToRetitle.length === 0;
}

export function runSkillTurnsRoute(argv: readonly string[], io: SkillTurnsIo): number {
  const out = io.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const err = io.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  const rest = argv.slice(2);
  if (rest.includes("-h") || rest.includes("--help")) {
    out(USAGE);
    return 0;
  }
  const parsed = parseArgs(rest, { flags: ["--apply"], valued: [...HOME_OPTIONS] });
  if (parsed.error) {
    err(USAGE);
    err(`${PROG}: error: ${parsed.error}`);
    return 2;
  }
  if (!parsed.flags.has("--apply")) {
    // The command that applies this dry run, to the same home, every value quoted.
    const words = ["conversations", "skill-turns"];
    for (const option of HOME_OPTIONS) {
      const value = parsed.values.get(option);
      if (value !== undefined) words.push(option, value);
    }
    words.push("--apply");
    return dryRun(io, out, [PROGRAM, ...words.map(shellWord)].join(" "));
  }
  return apply(io, out, err);
}

function dryRun(io: SkillTurnsIo, out: (line: string) => void, applyCommand: string): number {
  return io.withReadOnlyDatabase((db) => {
    const plan = planSkillTurnRepair(db);
    if (isEmpty(plan)) {
      out("No Pi user turns stored as a skill's body in this home.");
      return 0;
    }
    if (plan.turns.length > 0) {
      const conversations = new Set(plan.turns.map((turn) => turn.conversationId)).size;
      out(
        `Pi user turns stored as a skill's body: ${plan.turns.length}, in ${plural(conversations, "conversation")}.`,
      );
      out(WHAT_A_SKILL_TURN_IS);
      out("");
      out("  question kept  removed  skill");
      for (const [skill, kept, removed] of bySkill(plan)) {
        out(`${String(kept).padStart(15)}${String(removed).padStart(9)}  ${skill}`);
      }
      out("");
    }
    if (plan.conversationsToDelete.length > 0) {
      out(
        `Would delete ${plural(plan.conversationsToDelete.length, "conversation")} left with no user turn:`,
      );
      for (const item of plan.conversationsToDelete) {
        out(
          `  ${item.startedAt.slice(0, 10)}  ${item.id.slice(0, 8)}  ${plural(item.messageCount, "message")}  ${item.title ?? "(untitled)"}`,
        );
      }
    }
    const retitles = plan.conversationsToRetitle.length;
    if (retitles > 0) {
      out(
        `Would retitle ${plural(retitles, "conversation")} from ${retitles === 1 ? "its" : "their"} first remaining user turn.`,
      );
    }
    out("Replies, summaries, and memories stay.");
    out("Nothing was changed. To repair them, run:");
    out(`  ${applyCommand}`);
    return 0;
  });
}

/** By skill: [skill, rows that keep their question, rows that go]; most first, then by name. */
function bySkill(plan: SkillTurnRepairPlan): [string, number, number][] {
  const counts = new Map<string, [number, number]>();
  for (const turn of plan.turns) {
    const [kept, removed] = counts.get(turn.skill) ?? [0, 0];
    counts.set(turn.skill, turn.question !== null ? [kept + 1, removed] : [kept, removed + 1]);
  }
  return [...counts.entries()]
    .map(([skill, [kept, removed]]): [string, number, number] => [skill, kept, removed])
    .sort((a, b) => b[1] + b[2] - (a[1] + a[2]) || a[0].localeCompare(b[0]));
}

function apply(io: SkillTurnsIo, out: (line: string) => void, err: (line: string) => void): number {
  // Decide first, read-only: nothing to repair stops here, and takes no backup. A
  // holder rather than a variable: it is assigned inside a callback.
  const decided: { key: string | null } = { key: null };
  const decidedCode = io.withReadOnlyDatabase((db) => {
    const plan = planSkillTurnRepair(db);
    if (isEmpty(plan)) {
      out("Nothing to repair.");
      return 0;
    }
    decided.key = skillTurnRepairKey(plan);
    return 0;
  });
  const expectedKey = decided.key;
  if (decidedCode !== 0 || expectedKey === null) return decidedCode;

  return io.withLiveWriteDatabase((db, dbPath) => {
    let archive: string | null;
    try {
      archive = io.backup(dbPath);
    } catch {
      archive = null;
    }
    if (archive === null) {
      err("The backup failed, so nothing was changed.");
      return 1;
    }
    const verification = io.verifyBackup(archive);
    if (!verification.valid) {
      err(
        `The backup ${archive} did not verify (${verification.note ?? "no reason given"}), so nothing was changed.`,
      );
      return 1;
    }
    let result: SkillTurnRepairResult;
    try {
      result = applySkillTurnRepair(db, expectedKey);
    } catch (error) {
      if (error instanceof SkillTurnRepairSetMovedError) {
        err(
          "The stored skill turns changed while the backup was taken, so nothing was changed. Run it again.",
        );
        return 1;
      }
      throw error;
    }
    out(`Backup: ${archive} (verified).`);
    out(
      `Kept ${plural(result.kept, "Mirror question")}; removed ${plural(result.removed, "skill turn")}.`,
    );
    if (result.conversationsDeleted > 0) {
      out(
        `Deleted ${plural(result.conversationsDeleted, "conversation")} left with no user turn, ` +
          `with ${plural(result.messagesDeletedWithConversations, "more message")}.`,
      );
      out("Memories and provider-call records that named them were kept, unlinked.");
    }
    if (result.conversationsRetitled > 0) {
      out(`Retitled ${plural(result.conversationsRetitled, "conversation")}.`);
    }
    out(`Copies remain in this home's backups until they age out (${RETENTION_DAYS} days).`);
    return 0;
  });
}
