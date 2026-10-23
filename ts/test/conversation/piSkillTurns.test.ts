// CR160 — the Pi user turns an earlier version stored as a skill's body, and their
// repair.
//
// Until CR160, Pi's extension logged the prompt Pi had expanded, so a skill picked
// from Pi's menu (or typed as `/skill:<name>`) was stored as `<skill name="…"
// location="…">` and the skill's whole body, as if the person had said it. The
// repair applies the rule the core logs by (`commandTurn.ts`): a Mirror question
// keeps its question; any other skill invocation is not conversation, and its row
// goes. A conversation left with no user turn goes too (A7, the Navigator's
// decision); one titled from a block is retitled from its first remaining user
// turn. Replies, summaries, and embeddings stay (A6). Only Pi's whole wrapper, only
// in Pi conversations, is matched (A8).

import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  applySkillTurnRepair,
  planSkillTurnRepair,
  SkillTurnRepairSetMovedError,
  skillTurnRepairKey,
} from "#conversation/piSkillTurns.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import { tempDir } from "#helpers/tempDir.ts";

/** What Pi 1.4.0 hands the logger for `/skill:<name> args` (CR159 measured it). */
function wrapper(name: string, args = ""): string {
  return (
    `<skill name="${name}" location="/tree/.pi/skills/${name}/SKILL.md">\n` +
    `References are relative to /tree/.pi/skills/${name}.\n\n# ${name}\n\nDo the thing.\n</skill>` +
    (args ? `\n\n${args}` : "")
  );
}

let clock = 0;
function at(): string {
  clock += 1;
  return `2026-10-01T10:00:${String(clock).padStart(2, "0")}.000000Z`;
}

function conversation(
  db: WritableDatabase,
  id: string,
  title: string,
  iface = "pi",
  metadata: string | null = null,
): void {
  db.prepare(
    "INSERT INTO conversations (id, title, started_at, ended_at, interface, metadata) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, title, "2026-10-01T09:00:00Z", "2026-10-01T11:00:00Z", iface, metadata);
}

function message(
  db: WritableDatabase,
  id: string,
  conversationId: string,
  role: string,
  content: string,
): void {
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, conversationId, role, content, at());
}

function rows(db: WritableDatabase, conversationId: string): [string, string][] {
  return (
    db
      .prepare(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid",
      )
      .all(conversationId) as { role: string; content: string }[]
  ).map((row) => [row.role, row.content]);
}

function fixture(): WritableDatabase {
  const db = bootstrapDatabase(join(tempDir("pi-skill-turns-"), "memory.db"));
  // A Mirror question and another skill, in a conversation that goes on.
  conversation(
    db,
    "mixed",
    '<skill name="mm-mirror" location="/tree/.pi/skills/mm-mirror/SKILL.md">',
  );
  message(db, "mixed-1", "mixed", "user", wrapper("mm-mirror", "should I raise my price?"));
  message(db, "mixed-2", "mixed", "assistant", "Raise it.");
  message(db, "mixed-3", "mixed", "user", wrapper("mm-journeys"));
  message(db, "mixed-4", "mixed", "assistant", "personal-growth (active)");
  message(db, "mixed-5", "mixed", "user", "and what about next week?");
  // Nothing but skills: left with no user turn, so it goes, its memory kept.
  conversation(
    db,
    "skills-only",
    '<skill name="mm-build" location="/tree/.pi/skills/mm-build/SKILL.md">',
  );
  message(db, "skills-only-1", "skills-only", "user", wrapper("mm-build", "mirror"));
  message(db, "skills-only-2", "skills-only", "assistant", "Builder Mode active.");
  message(db, "skills-only-3", "skills-only", "user", wrapper("mm-mirror"));
  message(db, "skills-only-4", "skills-only", "assistant", "Mirror Mode is on.");
  db.prepare(
    "INSERT INTO memories (id, conversation_id, memory_type, layer, title, content, created_at) VALUES ('mem-1', 'skills-only', 'insight', 'ego', 'kept', 'a memory', '2026-10-01T12:00:00Z')",
  ).run();
  // A manual title stands, though it came from a block.
  conversation(
    db,
    "manual",
    '<skill name="mm-mirror" location="/x">',
    "pi",
    '{"title_status": "manual", "title_source": "manual"}',
  );
  message(db, "manual-1", "manual", "user", wrapper("mm-mirror", "is this a good week to launch?"));
  message(db, "manual-2", "manual", "assistant", "Yes.");
  // Untouched: an ordinary Pi conversation; another runtime's; a prefix that is not Pi's wrapper.
  conversation(db, "plain", "A normal title");
  message(db, "plain-1", "plain", "user", "hello");
  message(db, "plain-2", "plain", "assistant", "hi");
  conversation(db, "claude", "Pasted", "claude_code");
  message(db, "claude-1", "claude", "user", wrapper("mm-journeys"));
  conversation(db, "lookalike", "Looks like one");
  message(
    db,
    "lookalike-1",
    "lookalike",
    "user",
    '<skill name="mm-journeys"> is how Pi wraps a skill',
  );
  return db;
}

test("the plan keeps a Mirror question, removes every other skill turn, and names what goes", () => {
  const db = fixture();
  const plan = planSkillTurnRepair(db);
  assert.deepEqual(
    plan.kept.map((turn) => [turn.messageId, turn.skill, turn.question]),
    [
      ["mixed-1", "mm-mirror", "should I raise my price?"],
      ["manual-1", "mm-mirror", "is this a good week to launch?"],
    ],
  );
  assert.deepEqual(
    plan.removed.map((turn) => [turn.messageId, turn.skill]),
    [
      ["mixed-3", "mm-journeys"],
      ["skills-only-1", "mm-build"],
      ["skills-only-3", "mm-mirror"],
    ],
  );
  assert.deepEqual(
    plan.conversationsToDelete.map((item) => [item.id, item.messageCount]),
    [["skills-only", 4]],
  );
  assert.deepEqual(
    plan.conversationsToRetitle.map((item) => [item.id, item.newTitle]),
    [["mixed", "should I raise my price?"]],
  );
  db.close();
});

test("the repair changes exactly what the plan named, and a second plan finds nothing", () => {
  const db = fixture();
  const plan = planSkillTurnRepair(db);
  const result = applySkillTurnRepair(db, skillTurnRepairKey(plan));
  assert.deepEqual(
    [result.kept, result.removed, result.conversationsDeleted, result.conversationsRetitled],
    [2, 3, 1, 1],
  );

  assert.deepEqual(rows(db, "mixed"), [
    ["user", "should I raise my price?"],
    ["assistant", "Raise it."],
    ["assistant", "personal-growth (active)"],
    ["user", "and what about next week?"],
  ]);
  const mixed = db
    .prepare("SELECT title, metadata FROM conversations WHERE id = 'mixed'")
    .get() as {
    title: string;
    metadata: string;
  };
  assert.equal(mixed.title, "should I raise my price?");
  assert.equal(JSON.parse(mixed.metadata).title_status, "provisional");

  assert.equal(db.prepare("SELECT 1 FROM conversations WHERE id = 'skills-only'").get(), undefined);
  assert.deepEqual(rows(db, "skills-only"), []);
  const memory = db.prepare("SELECT conversation_id FROM memories WHERE id = 'mem-1'").get() as {
    conversation_id: string | null;
  };
  assert.equal(memory.conversation_id, null, "the memory outlives it, unlinked");

  assert.deepEqual(rows(db, "manual"), [
    ["user", "is this a good week to launch?"],
    ["assistant", "Yes."],
  ]);
  const manual = db.prepare("SELECT title FROM conversations WHERE id = 'manual'").get() as {
    title: string;
  };
  assert.equal(manual.title, '<skill name="mm-mirror" location="/x">', "a manual title stands");

  assert.deepEqual(rows(db, "plain"), [
    ["user", "hello"],
    ["assistant", "hi"],
  ]);
  assert.deepEqual(rows(db, "claude"), [["user", wrapper("mm-journeys")]]);
  assert.deepEqual(rows(db, "lookalike"), [
    ["user", '<skill name="mm-journeys"> is how Pi wraps a skill'],
  ]);

  const again = planSkillTurnRepair(db);
  assert.equal(again.kept.length + again.removed.length, 0);
  assert.equal(again.conversationsToDelete.length + again.conversationsToRetitle.length, 0);
  db.close();
});

test("the repair refuses, changing nothing, when the set moved since it was shown", () => {
  const db = fixture();
  const shown = skillTurnRepairKey(planSkillTurnRepair(db));
  message(db, "plain-3", "plain", "user", wrapper("mm-help"));
  assert.throws(() => applySkillTurnRepair(db, shown), SkillTurnRepairSetMovedError);
  assert.equal(rows(db, "mixed")[0]?.[1], wrapper("mm-mirror", "should I raise my price?"));
  assert.ok(db.prepare("SELECT 1 FROM conversations WHERE id = 'skills-only'").get());
  db.close();
});

test("Pi's extension reads back the same wrapper the repair finds", async () => {
  // The extension runs in Pi's process and imports nothing from the core, so it
  // keeps its own copy of the pattern; this holds the two copies to one shape.
  const { readFileSync } = await import("node:fs");
  const { PI_SKILL_WRAPPER } = await import("#conversation/piSkillTurns.ts");
  const extension = readFileSync(
    new URL("../../../.pi/extensions/mirror-logger.ts", import.meta.url),
    "utf8",
  );
  const literal = /const PI_SKILL_WRAPPER =\s*\/(.+)\/;/.exec(extension)?.[1];
  assert.equal(literal, PI_SKILL_WRAPPER.source);
});

test("a body the old logger cut at its 50,000-character limit is still a skill turn, and goes", async () => {
  // The extension's `truncate` kept the first 50,000 characters and added its own
  // marker, so the closing tag never arrived: Pi's opening lines, then the logger's
  // ending, which no person types. Its arguments, if any, were cut with it.
  const { readSkillTurn } = await import("#conversation/piSkillTurns.ts");
  // Cut where the logger cuts: inside the body, far past Pi's two opening lines.
  const full = wrapper("mm-build");
  const cut = `${full.slice(0, full.indexOf("Do the thing") + 6)}\n[… truncated]`;
  assert.deepEqual(readSkillTurn(cut), { skill: "mm-build", tail: "" });
  const db = fixture();
  message(db, "plain-3", "plain", "user", cut);
  const plan = planSkillTurnRepair(db);
  assert.ok(plan.removed.some((turn) => turn.messageId === "plain-3"));
  // A person's text that merely ends in the marker is not one.
  assert.equal(readSkillTurn("I saw [… truncated] once\n[… truncated]"), null);
  db.close();
});

test("a rebuilt title comes from the first remaining turn that is not a command", () => {
  // A command is not conversation (`commandTurn.ts`), so it does not name one either;
  // only when nothing else remains is it the title's source.
  const db = fixture();
  conversation(db, "commands-first", '<skill name="mm-build" location="/x">');
  message(db, "cf-1", "commands-first", "user", wrapper("mm-build", "mirror"));
  message(db, "cf-2", "commands-first", "user", "/mm-build mirror-ts-core");
  message(db, "cf-3", "commands-first", "user", "What changed since Friday?");
  conversation(db, "commands-only", '<skill name="mm-journeys" location="/x">');
  message(db, "co-1", "commands-only", "user", wrapper("mm-journeys"));
  message(db, "co-2", "commands-only", "user", "/mm-journeys");
  const titles = new Map(
    planSkillTurnRepair(db).conversationsToRetitle.map((item) => [item.id, item.newTitle]),
  );
  assert.equal(titles.get("commands-first"), "What changed since Friday?");
  assert.equal(titles.get("commands-only"), "/mm-journeys");
  db.close();
});
