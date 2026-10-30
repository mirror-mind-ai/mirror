// CV24.DS8: Journeys as calls, in a home `createHome` made, as Mirror Desktop's.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DatabaseNotCurrentError, ensureConversation } from "#conversation/hostCalls.ts";
import { readJourneyTree } from "#conversation/hostReads.ts";
import { openDatabaseReadOnly } from "#db/database.ts";
import { regressTo016 } from "#helpers/legacyDb.ts";
import { tempDir } from "#helpers/tempDir.ts";
import { createHome } from "#init/createHome.ts";
import {
  addJourney,
  deleteJourney,
  JourneyCallRejectedError,
  type JourneyCallRejection,
  moveJourney,
  newJourneyContent,
  replaceDescription,
  replaceStatus,
  replaceTitle,
  setJourneyProjectPath,
  updateJourney,
} from "#journey/journeyCalls.ts";
import type { JourneyTreeNode } from "#journey/journeyTree.ts";

const SEEDED = "personal-growth";
const DESCRIPTION = "A place for the work this test needs.";

function home(): string {
  const homePath = join(tempDir("mirror-journeys-"), "ana-souza");
  createHome({ homePath, userName: "ana-souza" });
  return join(homePath, "memory.db");
}

interface Row {
  key: string;
  content: string;
  version: string;
  updated_at: string;
  metadata: string | null;
  parent_journey: string | null;
}

/** Every Journey row; without migration 017's column on a database regressed before it. */
function rows(dbPath: string, column = true): Row[] {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return db
      .prepare(
        `SELECT key, content, version, updated_at, metadata${column ? ", parent_journey" : ""} FROM identity WHERE layer = 'journey' ORDER BY key`,
      )
      .all() as unknown as Row[];
  } finally {
    db.close();
  }
}

function row(dbPath: string, key: string): Row {
  const found = rows(dbPath).find((candidate) => candidate.key === key);
  assert.ok(found, key);
  return found;
}

const meta = (dbPath: string, key: string) => JSON.parse(row(dbPath, key).metadata ?? "{}");

function rejects(call: () => unknown, reason: JourneyCallRejection, populated?: string[]): void {
  assert.throws(call, (error: unknown) => {
    assert.ok(error instanceof JourneyCallRejectedError, String(error));
    assert.equal(error.reason, reason);
    if (populated) assert.deepEqual(error.populated, populated);
    return true;
  });
}

/** A refusal writes nothing: the Journey rows are what they were. */
function refusesUnchanged(dbPath: string, call: () => unknown, reason: JourneyCallRejection): void {
  const before = rows(dbPath);
  rejects(call, reason);
  assert.deepEqual(rows(dbPath), before);
}

const ids = (nodes: JourneyTreeNode[] | undefined) => (nodes ?? []).map((node) => node.id);

function add(dbPath: string, slug: string, extra: Record<string, unknown> = {}) {
  return addJourney(dbPath, { slug, name: `Name of ${slug}`, description: DESCRIPTION, ...extra });
}

test("a created Journey has Python's template, its name, and comes last among its siblings", () => {
  const dbPath = home();
  const result = addJourney(dbPath, {
    slug: "writing",
    name: "  Writing  ",
    description: `  ${DESCRIPTION}  `,
  });
  assert.equal(result.journeyId, "writing");
  const created = row(dbPath, "writing");
  assert.equal(
    created.content,
    "# Writing\n**Status:** active\n**Stage:** Starting\n\n## Description\n\n" +
      `${DESCRIPTION}\n\n## Current focus\n\nClarify the next concrete movement.`,
  );
  assert.equal(created.content, newJourneyContent("Writing", DESCRIPTION));
  assert.equal(created.version, "1.0.0");
  assert.equal(created.metadata, '{"display_name":"Writing","sibling_position":1}');
  assert.equal(created.parent_journey, null);
  assert.deepEqual(meta(dbPath, SEEDED), { sibling_position: 0 });
  assert.deepEqual(ids(result.tree.roots), [SEEDED, "writing"]);
  assert.deepEqual(result.tree, readJourneyTree(dbPath));
  const node = result.tree.roots[1];
  assert.equal(node?.name, "Writing");
  assert.equal(node?.status, "active");
  assert.equal(node?.description, DESCRIPTION);
});

test("a Journey created under a parent at a position renumbers that set and writes the 017 column", () => {
  const dbPath = home();
  add(dbPath, "child-a", { parentId: SEEDED });
  add(dbPath, "child-b", { parentId: SEEDED });
  const result = add(dbPath, "child-c", { parentId: SEEDED, position: 0 });
  assert.deepEqual(ids(result.tree.roots[0]?.children), ["child-c", "child-a", "child-b"]);
  assert.equal(row(dbPath, "child-c").parent_journey, SEEDED);
  assert.deepEqual(meta(dbPath, "child-c"), {
    display_name: "Name of child-c",
    parent_journey: SEEDED,
    sibling_position: 0,
  });
  assert.equal(meta(dbPath, "child-a").sibling_position, 1);
  assert.equal(meta(dbPath, "child-b").sibling_position, 2);
});

test("a created Journey's project path is stored resolved", () => {
  const dbPath = home();
  const project = join(tempDir("mirror-project-"), "repo");
  mkdirSync(project);
  add(dbPath, "coding", { projectPath: `${project}/../repo/.` });
  assert.equal(meta(dbPath, "coding").project_path, realpathSync(project));
});

test("a create that breaks a rule is refused by name and writes nothing", () => {
  const dbPath = home();
  const folder = tempDir("mirror-project-");
  const file = join(folder, "file.txt");
  writeFileSync(file, "x");
  const link = join(folder, "link");
  symlinkSync(folder, link);
  add(dbPath, "taken");
  const cases: [Record<string, unknown>, JourneyCallRejection][] = [
    [{ slug: "ab" }, "invalid_or_duplicate_slug"],
    [{ slug: "Upper-case" }, "invalid_or_duplicate_slug"],
    [{ slug: "two--hyphens" }, "invalid_or_duplicate_slug"],
    [{ slug: "taken" }, "invalid_or_duplicate_slug"],
    [{ slug: SEEDED }, "invalid_or_duplicate_slug"],
    [{ name: "   " }, "invalid_name"],
    [{ name: "x".repeat(161) }, "invalid_name"],
    [{ description: "too short" }, "invalid_description"],
    [{ description: "x".repeat(4001) }, "invalid_description"],
    [{ parentId: "nowhere" }, "unknown_parent"],
    [{ position: 3 }, "invalid_position"],
    [{ position: -1 }, "invalid_position"],
    [{ position: 0.5 }, "invalid_position"],
    [{ projectPath: "relative/path" }, "invalid_path"],
    [{ projectPath: "." }, "invalid_path"],
    [{ projectPath: "~/somewhere" }, "invalid_path"],
    [{ projectPath: file }, "invalid_path"],
    [{ projectPath: link }, "invalid_path"],
    [{ projectPath: join(folder, "missing") }, "invalid_path"],
  ];
  for (const [change, reason] of cases) {
    refusesUnchanged(
      dbPath,
      () =>
        addJourney(dbPath, {
          slug: "fresh",
          name: "Fresh",
          description: DESCRIPTION,
          ...change,
        } as Parameters<typeof addJourney>[1]),
      reason,
    );
  }
  assert.ok(
    addJourney(dbPath, { slug: "fresh", name: "x".repeat(160), description: "x".repeat(20) }),
  );
});

test("a project path is set, replaced and cleared, and nothing else in the metadata moves", () => {
  const dbPath = home();
  add(dbPath, "coding");
  const one = realpathSync(tempDir("mirror-project-"));
  const two = realpathSync(tempDir("mirror-project-"));
  setJourneyProjectPath(dbPath, { journeyId: "coding", projectPath: one });
  assert.equal(meta(dbPath, "coding").project_path, one);
  const result = setJourneyProjectPath(dbPath, { journeyId: "coding", projectPath: two });
  assert.equal(result.tree.roots[1]?.projectPath, two);
  setJourneyProjectPath(dbPath, { journeyId: "coding", projectPath: null });
  assert.deepEqual(meta(dbPath, "coding"), { display_name: "Name of coding", sibling_position: 1 });
  refusesUnchanged(
    dbPath,
    () => setJourneyProjectPath(dbPath, { journeyId: "nowhere", projectPath: null }),
    "unknown_journey",
  );
  refusesUnchanged(
    dbPath,
    () => setJourneyProjectPath(dbPath, { journeyId: "coding", projectPath: "relative" }),
    "invalid_path",
  );
});

test("a move renumbers the set it left and the set it joined, and updates the 017 column", () => {
  const dbPath = home();
  add(dbPath, "alpha");
  add(dbPath, "bravo");
  add(dbPath, "charlie");
  add(dbPath, "delta", { parentId: "alpha" });
  const result = moveJourney(dbPath, { journeyId: "bravo", parentId: "alpha", position: 0 });
  assert.deepEqual(ids(result.tree.roots), [SEEDED, "alpha", "charlie"]);
  assert.deepEqual(ids(result.tree.roots.find((node) => node.id === "alpha")?.children), [
    "bravo",
    "delta",
  ]);
  assert.equal(meta(dbPath, "charlie").sibling_position, 2);
  assert.equal(meta(dbPath, "delta").sibling_position, 1);
  assert.equal(row(dbPath, "bravo").parent_journey, "alpha");
  const back = moveJourney(dbPath, { journeyId: "bravo", parentId: null, position: 3 });
  assert.deepEqual(ids(back.tree.roots), [SEEDED, "alpha", "charlie", "bravo"]);
  assert.equal(row(dbPath, "bravo").parent_journey, null);
  assert.equal(meta(dbPath, "bravo").parent_journey, undefined);
  assert.equal(meta(dbPath, "delta").sibling_position, 0);
});

test("a move that would break the tree is refused and writes nothing", () => {
  const dbPath = home();
  add(dbPath, "alpha");
  add(dbPath, "bravo", { parentId: "alpha" });
  refusesUnchanged(
    dbPath,
    () => moveJourney(dbPath, { journeyId: "alpha", parentId: "bravo", position: 0 }),
    "invalid_parent",
  );
  refusesUnchanged(
    dbPath,
    () => moveJourney(dbPath, { journeyId: "alpha", parentId: "alpha", position: 0 }),
    "invalid_parent",
  );
  refusesUnchanged(
    dbPath,
    () => moveJourney(dbPath, { journeyId: "alpha", parentId: "nowhere", position: 0 }),
    "unknown_parent",
  );
  refusesUnchanged(
    dbPath,
    () => moveJourney(dbPath, { journeyId: "nowhere", parentId: null, position: 0 }),
    "unknown_journey",
  );
  refusesUnchanged(
    dbPath,
    () => moveJourney(dbPath, { journeyId: "bravo", parentId: null, position: 3 }),
    "invalid_position",
  );
});

test("only an empty leaf is deleted; otherwise the classes holding records are named", () => {
  const dbPath = home();
  add(dbPath, "parent");
  add(dbPath, "leaf", { parentId: "parent" });
  add(dbPath, "talked");
  ensureConversation(dbPath, {
    sessionId: "session-1",
    journeyId: "talked",
    title: "A thread",
    interface: "nautilus_harness",
  });
  const before = rows(dbPath);
  rejects(() => deleteJourney(dbPath, { journeyId: "parent" }), "journey_not_empty", [
    "child_journeys",
  ]);
  rejects(() => deleteJourney(dbPath, { journeyId: "talked" }), "journey_not_empty", [
    "conversations",
    "runtime_sessions",
  ]);
  rejects(() => deleteJourney(dbPath, { journeyId: "nowhere" }), "unknown_journey");
  assert.deepEqual(rows(dbPath), before);
  const result = deleteJourney(dbPath, { journeyId: "leaf" });
  assert.equal(result.journeyId, "leaf");
  assert.deepEqual(ids(result.tree.roots.find((node) => node.id === "parent")?.children), []);
  assert.ok(!rows(dbPath).some((candidate) => candidate.key === "leaf"));
});

test("a name edit changes the heading, and display_name only where one is kept", () => {
  const dbPath = home();
  const seeded = row(dbPath, SEEDED);
  const result = updateJourney(dbPath, {
    journeyId: SEEDED,
    expectedUpdatedAt: seeded.updated_at,
    name: "  Growing  ",
  });
  const edited = row(dbPath, SEEDED);
  assert.equal(edited.content, seeded.content.replace(/^# .*$/m, "# Growing").trim());
  assert.equal(edited.metadata, null);
  assert.equal(edited.version, seeded.version);
  assert.equal(result.tree.roots[0]?.name, "Growing");
  add(dbPath, "named");
  const named = row(dbPath, "named");
  updateJourney(dbPath, {
    journeyId: "named",
    expectedUpdatedAt: named.updated_at,
    name: "Renamed",
  });
  assert.equal(meta(dbPath, "named").display_name, "Renamed");
  assert.match(row(dbPath, "named").content, /^# Renamed$/m);
  assert.equal(readJourneyTree(dbPath).roots[1]?.name, "Renamed");
});

test("a status edit takes Python's four values and replaces the Status line", () => {
  const dbPath = home();
  add(dbPath, "work");
  for (const status of ["paused", "COMPLETED", "planned", "active"]) {
    const current = row(dbPath, "work");
    updateJourney(dbPath, { journeyId: "work", expectedUpdatedAt: current.updated_at, status });
    assert.match(
      row(dbPath, "work").content,
      new RegExp(`^\\*\\*Status:\\*\\* ${status.toLowerCase()}$`, "m"),
    );
  }
  const current = row(dbPath, "work");
  refusesUnchanged(
    dbPath,
    () =>
      updateJourney(dbPath, {
        journeyId: "work",
        expectedUpdatedAt: current.updated_at,
        status: "archived",
      }),
    "invalid_status",
  );
});

test("a description edit replaces only its section's body", () => {
  const dbPath = home();
  const seeded = row(dbPath, SEEDED);
  const next = "A narrower description, written for the test.";
  updateJourney(dbPath, {
    journeyId: SEEDED,
    expectedUpdatedAt: seeded.updated_at,
    description: next,
  });
  const edited = row(dbPath, SEEDED).content;
  const sections = (content: string) =>
    content
      .split(/^## /m)
      .slice(1)
      .map((part) => part.split("\n")[0]);
  assert.deepEqual(sections(edited), sections(seeded.content));
  assert.equal(edited.split("## Briefing")[1], seeded.content.split("## Briefing")[1]);
  assert.equal(edited.split("## Description")[0], seeded.content.split("## Description")[0]);
  assert.equal(readJourneyTree(dbPath).roots[0]?.description, next);
});

test("a description section is replaced in Portuguese, inserted before the first section, or appended", () => {
  assert.equal(
    replaceDescription("# T\n\n## Descrição\n\nold\nlines\n\n## Scope\n\nkeep", "new"),
    "# T\n\n## Descrição\n\nnew\n\n## Scope\n\nkeep",
  );
  assert.equal(
    replaceDescription("# T\n\n## Description\nold", "new"),
    "# T\n\n## Description\n\nnew",
  );
  assert.equal(
    replaceDescription("# T\n**Status:** active\n\n## Scope\n\nkeep", "new"),
    "# T\n**Status:** active\n\n## Description\n\nnew\n\n## Scope\n\nkeep",
  );
  assert.equal(replaceDescription("# T\nbody\n\n", "new"), "# T\nbody\n\n## Description\n\nnew");
});

test("an edit of a row that changed since the host read it is refused", () => {
  const dbPath = home();
  add(dbPath, "work");
  const read = row(dbPath, "work");
  setJourneyProjectPath(dbPath, {
    journeyId: "work",
    projectPath: realpathSync(tempDir("mirror-project-")),
  });
  refusesUnchanged(
    dbPath,
    () =>
      updateJourney(dbPath, {
        journeyId: "work",
        expectedUpdatedAt: read.updated_at,
        name: "Late",
      }),
    "journey_changed",
  );
  refusesUnchanged(
    dbPath,
    () =>
      updateJourney(dbPath, {
        journeyId: "nowhere",
        expectedUpdatedAt: read.updated_at,
        name: "Late",
      }),
    "unknown_journey",
  );
});

test("an edit with nothing to change writes nothing, and one with no field is refused", () => {
  const dbPath = home();
  add(dbPath, "work");
  const read = row(dbPath, "work");
  updateJourney(dbPath, {
    journeyId: "work",
    expectedUpdatedAt: read.updated_at,
    name: "Name of work",
    status: "active",
    description: DESCRIPTION,
  });
  assert.deepEqual(row(dbPath, "work"), read);
  refusesUnchanged(
    dbPath,
    () => updateJourney(dbPath, { journeyId: "work", expectedUpdatedAt: read.updated_at }),
    "invalid_request",
  );
  refusesUnchanged(
    dbPath,
    () =>
      updateJourney(dbPath, { journeyId: "work", expectedUpdatedAt: read.updated_at, name: "" }),
    "invalid_name",
  );
  refusesUnchanged(
    dbPath,
    () =>
      updateJourney(dbPath, {
        journeyId: "work",
        expectedUpdatedAt: read.updated_at,
        description: "short",
      }),
    "invalid_description",
  );
});

test("a write takes the front door's snapshot first", () => {
  const dbPath = home();
  const snapshot = join(dbPath, "..", "backups", "frontdoor-pre-write-backup.db");
  assert.ok(!existsSync(snapshot));
  add(dbPath, "work");
  assert.ok(existsSync(snapshot));
});

test("a database that is not current is refused before anything is opened for writing", () => {
  const dbPath = home();
  regressTo016(dbPath);
  const before = rows(dbPath, false);
  const calls = [
    () => add(dbPath, "work"),
    () => setJourneyProjectPath(dbPath, { journeyId: SEEDED, projectPath: null }),
    () => moveJourney(dbPath, { journeyId: SEEDED, parentId: null, position: 0 }),
    () => deleteJourney(dbPath, { journeyId: SEEDED }),
    () =>
      updateJourney(dbPath, {
        journeyId: SEEDED,
        expectedUpdatedAt: before[0]?.updated_at ?? "",
        status: "paused",
      }),
  ];
  for (const call of calls) assert.throws(call, DatabaseNotCurrentError);
  assert.deepEqual(rows(dbPath, false), before);
  assert.ok(!existsSync(join(dbPath, "..", "backups", "frontdoor-pre-write-backup.db")));
});

/** A Journey row as the terminal writes one: no position, any version, any metadata. */
function terminalJourney(
  dbPath: string,
  key: string,
  metadata: string | null,
  version = "1.0.0",
): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.prepare(
      "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at, metadata) VALUES (?, 'journey', ?, ?, ?, ?, ?, ?)",
    ).run(
      `id-${key}`,
      key,
      newJourneyContent(key, DESCRIPTION),
      version,
      "2026-10-01T00:00:00.000000",
      "2026-10-01T00:00:00.000000",
      metadata,
    );
  } finally {
    db.close();
  }
}

test("Journeys the terminal made are ordered as Python's administration ordered them", () => {
  const dbPath = home();
  add(dbPath, "writing");
  terminalJourney(dbPath, "aaa-unpositioned", null);
  terminalJourney(dbPath, "orphan", '{"parent_journey":"gone"}');
  const result = add(dbPath, "later");
  assert.deepEqual(ids(result.tree.roots), [
    SEEDED,
    "writing",
    "aaa-unpositioned",
    "orphan",
    "later",
  ]);
  assert.deepEqual(meta(dbPath, "aaa-unpositioned"), { sibling_position: 2 });
  assert.deepEqual(meta(dbPath, "orphan"), { parent_journey: "gone", sibling_position: 3 });
});

test("an edit keeps the row's version and its other metadata", () => {
  const dbPath = home();
  terminalJourney(dbPath, "versioned", '{"display_name":"Old","icon":"star"}', "2.1.0");
  const read = row(dbPath, "versioned");
  updateJourney(dbPath, {
    journeyId: "versioned",
    expectedUpdatedAt: read.updated_at,
    name: "New",
  });
  assert.equal(row(dbPath, "versioned").version, "2.1.0");
  assert.deepEqual(meta(dbPath, "versioned"), { display_name: "New", icon: "star" });
});

test("a Status line is inserted after the title, and a title is prepended when missing", () => {
  assert.equal(replaceStatus("# T\n\nbody", "paused"), "# T\n**Status:** paused\n\nbody");
  assert.equal(replaceStatus("body", "paused"), "**Status:** paused\n\nbody");
  assert.equal(replaceTitle("body\n", "T"), "# T\n\nbody");
});
