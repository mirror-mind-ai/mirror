// CV22.DS7.TS4 plateau 6 — `identity edit <layer> <key>` against Python's answer.
//
// The corpus scripts the editor, because that is the only way to compare this
// command at all: each case runs a POSIX `sh` script carried in the golden, so
// both engines drive the IDENTICAL editor. Every case grades the streams, the
// exit code, and the identity rows afterwards — a command that prints
// "No changes detected." while quietly rewriting the row would pass a
// stream-only comparison.
//
// Two properties are asserted here rather than recorded: the temp file is
// created 0600 and removed on every path. They are about the file the command
// hands to another program, not about its output, and they are the
// security-engineer's plan-stage requirement.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import { applyIdentitySet } from "#frontDoor/identityWrite.ts";
import { runIdentityEdit } from "#identity/identityEdit.ts";

interface GoldenCase {
  label: string;
  argv: string[];
  editor: string | null;
  environment: Record<string, string>;
  stdout: string;
  stderr: string;
  exit_code: number;
  identity_after: Array<{ layer: string; key: string; content: string }>;
}

const golden = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "goldens", "identity-edit.golden.json"),
    "utf8",
  ),
) as {
  editors: Record<string, string>;
  seed: { layer: string; key: string; content: string };
  cases: GoldenCase[];
};

interface World {
  root: string;
  db: WritableDatabase;
  editors: Record<string, string>;
}

function makeWorld(): World {
  const root = mkdtempSync(join(tmpdir(), "identity-edit-"));
  const db = bootstrapDatabase(join(root, "memory_test.db"));
  applyIdentitySet(db, {
    layer: golden.seed.layer,
    key: golden.seed.key,
    content: golden.seed.content,
    id: "seed0001",
    nowIso: "2026-01-01T00:00:00.000000Z",
  });
  const editors: Record<string, string> = {};
  for (const [name, body] of Object.entries(golden.editors)) {
    const path = join(root, `editor-${name}`);
    writeFileSync(path, body, "utf8");
    chmodSync(path, 0o755);
    editors[name] = path;
  }
  return { root, db, editors };
}

function closeWorld(world: World): void {
  world.db.close();
  rmSync(world.root, { recursive: true, force: true });
}

function identityRows(world: World) {
  return world.db
    .prepare("SELECT layer, key, content FROM identity ORDER BY layer, key")
    .all()
    .map((row) => ({
      layer: String(row.layer),
      key: String(row.key),
      content: String(row.content),
    }));
}

let counter = 0;

/**
 * A spawn that refuses to start anything but the corpus's own scripted editors.
 *
 * Without it a case that resolves to `nano` launches a REAL interactive editor
 * on the test runner's terminal and hangs forever. That happened while this
 * file was being written, and a hang is strictly worse than a failure: CI has
 * no one to press Ctrl-X. The guard turns it into a named assertion.
 */
function guardedSpawn(allowed: Record<string, string>): typeof spawnSync {
  const paths = new Set(Object.values(allowed));
  return ((command: string, args: readonly string[], options: object) => {
    assert.ok(
      paths.has(command) || command.includes("definitely-not-an-editor"),
      `the edit resolved to an unscripted editor: ${command}`,
    );
    return spawnSync(command, args as string[], options);
  }) as unknown as typeof spawnSync;
}

test("every recorded edit matches Python, in its streams and on its row", () => {
  const world = makeWorld();
  try {
    for (const recorded of golden.cases) {
      if (recorded.argv.length !== 3) {
        // `identity edit ego` is argparse's refusal, not this function's: the
        // front door never reaches a port without both arguments.
        assert.equal(recorded.exit_code, 2, recorded.label);
        continue;
      }
      const [, layer, key] = recorded.argv as [string, string, string];
      const visual = recorded.environment.VISUAL;
      const actual = runIdentityEdit(world.db, layer, key, {
        spawn: guardedSpawn(world.editors),
        editor: recorded.editor ? world.editors[recorded.editor] : undefined,
        visual: visual?.startsWith("<EDITOR:")
          ? world.editors[visual.slice("<EDITOR:".length, -1)]
          : visual,
        nowIso: () => "2026-09-16T12:00:00.000000Z",
        newId: () => {
          counter += 1;
          return `edit${String(counter).padStart(4, "0")}`;
        },
      });

      assert.equal(actual.stdout, recorded.stdout, recorded.label);
      assert.equal(actual.stderr, recorded.stderr, `${recorded.label} (stderr)`);
      assert.equal(actual.exitCode, recorded.exit_code, `${recorded.label} (exit)`);
      assert.deepEqual(identityRows(world), recorded.identity_after, `${recorded.label} (rows)`);
    }
  } finally {
    closeWorld(world);
  }
});

test("the buffer is private and never outlives the command", () => {
  const world = makeWorld();
  try {
    const seen: Array<{ path: string; mode: number; content: string }> = [];
    const paths: string[] = [];
    for (const editorName of ["append", "fail", "blank"] as const) {
      runIdentityEdit(world.db, "ego", "behavior", {
        spawn: guardedSpawn(world.editors),
        editor: world.editors[editorName],
        nowIso: () => "2026-09-16T12:00:00.000000Z",
        newId: () => "edit9999",
        onTempFile: (path) => {
          paths.push(path);
          seen.push({
            path,
            mode: statSync(path).mode & 0o777,
            content: readFileSync(path, "utf8"),
          });
        },
      });
    }

    for (const entry of seen) {
      // 0600: the buffer holds a person's identity content while an arbitrary
      // editor has it open.
      assert.equal(entry.mode, 0o600, `${entry.path} was readable by others`);
      assert.match(entry.path, /mirror-identity-ego-behavior-[a-z0-9]+\.md$/);
      assert.ok(entry.content.length > 0, "the editor was handed an empty buffer");
    }
    // Removed on EVERY path, including the two that refused.
    for (const path of paths) assert.equal(existsSync(path), false, `${path} survived`);
  } finally {
    closeWorld(world);
  }
});

test("a missing editor is reported, not raised, and saves nothing", () => {
  const world = makeWorld();
  try {
    const before = identityRows(world);
    const actual = runIdentityEdit(world.db, "ego", "behavior", {
      spawn: guardedSpawn(world.editors),
      editor: join(world.root, "definitely-not-an-editor"),
      nowIso: () => "2026-09-16T12:00:00.000000Z",
      newId: () => "edit0000",
    });
    // RECORDED DIVERGENCE: Python raises FileNotFoundError and the traceback
    // escapes. Same exit code, same stream, one line.
    assert.equal(actual.exitCode, 1);
    assert.equal(actual.stdout, "");
    assert.match(actual.stderr, /could not be started/);
    assert.deepEqual(identityRows(world), before);
  } finally {
    closeWorld(world);
  }
});

test("the editor resolution order is EDITOR, then VISUAL, then nano", () => {
  const world = makeWorld();
  try {
    const invoked: string[] = [];
    const spy = ((command: string) => {
      invoked.push(command);
      return { status: 0, stdout: "", stderr: "", signal: null, output: [], pid: 1 };
    }) as unknown as typeof import("node:child_process").spawnSync;

    for (const deps of [
      { editor: "from-editor", visual: "from-visual" },
      { editor: undefined, visual: "from-visual" },
      { editor: undefined, visual: undefined },
      // An EMPTY string is falsy in Python's `or` chain, so it falls through
      // exactly as an unset variable does.
      { editor: "", visual: "from-visual" },
    ]) {
      runIdentityEdit(world.db, "ego", "behavior", {
        ...deps,
        nowIso: () => "2026-09-16T12:00:00.000000Z",
        newId: () => "edit0000",
        spawn: spy,
      });
    }
    assert.deepEqual(invoked, ["from-editor", "from-visual", "nano", "from-visual"]);
  } finally {
    closeWorld(world);
  }
});
