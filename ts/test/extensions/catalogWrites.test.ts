// CV22.DS7.TS4 plateau 5 — the extension catalog writes against Python's answer.
//
// These commands are graded by what they LEAVE ON DISK. After every case the
// replay walks the whole mirror home, the whole runtime target root, and the
// whole Claude project root, hashes every file, and compares the three trees to
// the ones Python left — plus the `_ext_migrations` / `_ext_bindings` rows and
// the extension tables, because install migrates and a full uninstall deletes
// bindings while deliberately preserving data tables.
//
// Every case runs in a disposable home AND a disposable target root under the
// system temp directory. The plan-stage panel named that explicitly: a corpus
// for `install` and `uninstall` must never be able to reach a developer's
// own `.pi`.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import {
  type CatalogWriteContext,
  runExtensionsCommand,
  UnsupportedCatalogCommandError,
} from "#extensions/catalogCommands.ts";
import { filesystemSkillDirName } from "#extensions/catalogWrites.ts";
import { validateExtensionRegister } from "#extensions/dispatch.ts";

interface GoldenCase {
  label: string;
  /** Files written before the command runs, so the replay shares the world. */
  prepare: Array<{ path: string; content: string }>;
  argv: string[];
  stdout: string;
  stderr: string | null;
  stderr_final_line?: string;
  exit_code: number;
  home: Record<string, unknown>;
  target: Record<string, unknown>;
  project: Record<string, unknown>;
  database: {
    migrations: Array<Record<string, string>>;
    bindings: Array<Record<string, string | null>>;
    tables: string[];
  };
  divergence?: string;
}

const golden = JSON.parse(
  readFileSync(new URL("../fixtures/ext-catalog-writes.golden.json", import.meta.url), "utf8"),
) as { timestamp_token: string; cases: GoldenCase[] };

const FIXTURES = new URL("../fixtures/ext-catalog-writes", import.meta.url).pathname;
const REPO_ROOT = dirname(dirname(dirname(dirname(new URL(import.meta.url).pathname))));
const TOKEN = golden.timestamp_token;

interface World {
  root: string;
  home: string;
  target: string;
  project: string;
  source: string;
  dbPath: string;
  db: WritableDatabase;
}

function makeWorld(): World {
  const root = mkdtempSync(join(tmpdir(), "ext-catalog-writes-"));
  const world = {
    root,
    home: join(root, "mirror"),
    target: join(root, "runtime-target"),
    project: join(root, "project"),
    source: join(root, "source"),
  };
  cpSync(FIXTURES, world.source, { recursive: true });
  mkdirSync(world.home, { recursive: true });
  mkdirSync(world.project, { recursive: true });
  const dbPath = join(world.home, "memory_test.db");
  const db = bootstrapDatabase(dbPath);
  for (const [extensionId, capability, kind, target] of [
    ["notes", "recent", "persona", "engineer"],
    ["other", "keep", "global", null],
  ] as const) {
    db.prepare(
      "INSERT INTO _ext_bindings (extension_id, capability_id, target_kind, target_id, created_at) " +
        "VALUES (?, ?, ?, ?, '2026-01-01T00:00:00+00:00')",
    ).run(extensionId, capability, kind, target);
  }
  return { ...world, dbPath, db };
}

function closeWorld(world: World): void {
  world.db.close();
  rmSync(world.root, { recursive: true, force: true });
}

function hostEnvironment(world: World): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("MIRROR_TS_")) continue;
    if (key === "MIRROR_HOME" || key === "MIRROR_USER" || key === "DB_PATH") continue;
    environment[key] = value;
  }
  environment.MIRROR_HOME = world.home;
  environment.MEMORY_ENV = "test";
  environment.PYTHONIOENCODING = "utf-8";
  return environment;
}

function contextFor(world: World): CatalogWriteContext {
  return {
    mirrorHome: world.home,
    db: world.db,
    // The clock seam: the catalog carries `generated_at`, tokenised in the
    // golden, so the replay freezes it to the token's own shape.
    deps: { nowIso: () => "2026-09-16T12:00:00.000000+00:00" },
    validateRegister: (extensionId, extensionDir) => {
      const outcome = validateExtensionRegister(extensionId, world.home, extensionDir, {
        databasePath: world.dbPath,
        hostCwd: REPO_ROOT,
        environment: hostEnvironment(world),
      });
      if (!outcome.ok) throw new RegisterValidationFailed(outcome.message);
    },
  };
}

class RegisterValidationFailed extends Error {}

function redact(text: string, world: World): string {
  // Longest first, the way the generator redacts: the target root and the
  // project live beside the home under one temp root.
  return text
    .split(world.target)
    .join("<TARGET>")
    .split(world.project)
    .join("<PROJECT>")
    .split(world.source)
    .join("<SRC>")
    .split(world.home)
    .join("<HOME>")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+00:00/g, TOKEN);
}

function digest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
}

function tree(root: string, world: World): Record<string, unknown> {
  if (!existsSyncSafe(root)) return {};
  const files: Record<string, unknown> = {};
  for (const path of walk(root)) {
    const relativePath = relative(root, path);
    const parts = relativePath.split(sep);
    const cacheIndex = parts.indexOf("__pycache__");
    if (cacheIndex >= 0) {
      files[[...parts.slice(0, cacheIndex), "__pycache__"].join("/")] = "<python bytecode cache>";
      continue;
    }
    const key = parts.join("/");
    if (path.endsWith("extensions.json") || path.endsWith("extensions.external.json")) {
      files[key] = { text: redact(readFileSync(path, "utf8"), world) };
      continue;
    }
    // A `-wal`/`-shm` sidecar exists only while a connection is open: Python's
    // subprocess leaves none and this replay, holding the database open, leaves
    // two. Journal state is not product state, and neither engine records it.
    if (path.endsWith("-wal") || path.endsWith("-shm")) continue;
    if (path.endsWith(".db")) {
      files[key] = "<database, graded by its rows>";
      continue;
    }
    files[key] = digest(path);
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function existsSyncSafe(path: string): boolean {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}

function walk(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else if (entry.isFile()) found.push(path);
  }
  return found.sort();
}

function databaseState(world: World) {
  const migrations = world.db
    .prepare("SELECT extension_id, filename, applied_at FROM _ext_migrations ORDER BY filename")
    .all()
    .map((row) => ({
      extension_id: String(row.extension_id),
      filename: String(row.filename),
      applied_at: TOKEN,
    }));
  const bindings = world.db
    .prepare(
      "SELECT extension_id, capability_id, target_kind, target_id, created_at " +
        "FROM _ext_bindings ORDER BY extension_id, capability_id",
    )
    .all()
    .map((row) => ({
      extension_id: String(row.extension_id),
      capability_id: String(row.capability_id),
      target_kind: String(row.target_kind),
      target_id: row.target_id === null ? null : String(row.target_id),
      created_at: TOKEN,
    }));
  const tables = world.db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ext_%' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name));
  return { migrations, bindings, tables };
}

function answer(world: World, argv: readonly string[]) {
  const resolved = argv.map((token) =>
    token
      .replace("<SRC>", world.source)
      .replace("<TARGET>", world.target)
      .replace("<PROJECT>", world.project),
  );
  try {
    const rendered = runExtensionsCommand(contextFor(world), resolved);
    return {
      stdout: redact(rendered.stdout, world),
      stderr: redact(rendered.stderr, world),
      exitCode: rendered.exitCode,
    };
  } catch (error) {
    if (error instanceof RegisterValidationFailed) {
      return { stdout: "", stderr: redact(`${error.message}\n`, world), exitCode: 1 };
    }
    throw error;
  }
}

test("every recorded catalog write matches Python, on disk and in the database", (t) => {
  const world = makeWorld();
  try {
    const probe = answer(world, ["install", "notes", "--extensions-root", "<SRC>"]);
    if (probe.stderr.includes("could not be started")) {
      t.skip("uv is unavailable; install cannot validate register through the host");
      return;
    }
    closeWorld(world);
  } catch (error) {
    closeWorld(world);
    throw error;
  }

  const replay = makeWorld();
  try {
    for (const recorded of golden.cases) {
      for (const file of recorded.prepare) {
        const path = file.path.replace("<PROJECT>", replay.project);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, file.content, "utf8");
      }
      const actual = answer(replay, recorded.argv);

      assert.equal(actual.exitCode, recorded.exit_code, `${recorded.label} (exit)`);
      assert.equal(actual.stdout, recorded.stdout, recorded.label);
      if (recorded.divergence === undefined) {
        assert.equal(actual.stderr, recorded.stderr ?? "", `${recorded.label} (stderr)`);
      } else {
        // RECORDED DIVERGENCE: Python lets install's validation errors escape
        // as a traceback. TypeScript answers the same exit code with the same
        // final message on the same stream, and an empty stdout either way.
        assert.equal(
          actual.stderr.trimEnd().split("\n").at(-1),
          recorded.stderr_final_line?.replace(/^memory\.cli\.extensions\.\w+: /, ""),
          `${recorded.label} (failure message)`,
        );
      }

      assert.deepEqual(tree(replay.home, replay), recorded.home, `${recorded.label} (home tree)`);
      assert.deepEqual(
        tree(replay.target, replay),
        recorded.target,
        `${recorded.label} (target tree)`,
      );
      assert.deepEqual(
        tree(replay.project, replay),
        recorded.project,
        `${recorded.label} (project tree)`,
      );
      assert.deepEqual(databaseState(replay), recorded.database, `${recorded.label} (database)`);
    }
  } finally {
    closeWorld(replay);
  }
});

test("the corpus grades the facts a reading of the code would not give", () => {
  const byLabel = new Map(golden.cases.map((recorded) => [recorded.label, recorded]));
  const at = (label: string): GoldenCase => {
    const recorded = byLabel.get(label);
    assert.ok(recorded, `the corpus lost its ${label} case`);
    return recorded as GoldenCase;
  };

  // The catalog is Python's `json.dumps(indent=2)`: non-ASCII ESCAPED, keys in
  // INSERTION order. A `JSON.stringify` port writes different bytes into a file
  // both cores read.
  const catalog = at("install_a_command_skill").home["runtime/skills/pi/extensions.json"] as {
    text: string;
  };
  assert.match(catalog.text, /"summary": "Caf\\u00e9 notes \\u2014 a deterministic fixture"/);
  assert.match(catalog.text, /^\{\n {2}"schema_version": "1",\n {2}"runtime": "pi",/);

  // A Claude command keeps its `:` in the CATALOG and loses it on DISK.
  const claude = at("install_a_command_skill").home["runtime/skills/claude/extensions.json"] as {
    text: string;
  };
  assert.match(claude.text, /"command_name": "ext:notes"/);
  assert.ok("runtime/skills/claude/ext-notes/SKILL.md" in at("install_a_command_skill").home);

  // Install identifies the extension by its DIRECTORY name, so a manifest id
  // that disagrees fails its own prefix check.
  assert.match(
    at("install_identifies_by_directory_name_not_manifest_id").stderr_final_line ?? "",
    /migrations failed for extension\/ext-mismatch.*ext_ext_mismatch_/,
  );

  // The ignore patterns: `.git`, `node_modules`, `.DS_Store` and a stray `.pyc`
  // never reach the installed tree, while `src/` does.
  const noisy = Object.keys(at("install_refuses_to_copy_caches_and_vcs").home).filter((path) =>
    path.startsWith("extensions/noisy/"),
  );
  assert.deepEqual(
    noisy.filter((path) => /\.git|node_modules|DS_Store|stray/.test(path)),
    [],
  );
  assert.ok(noisy.includes("extensions/noisy/src/helper.py"));
  // The `__pycache__` that IS there was not copied: it is what the post-install
  // import left behind, which is why the tree carries a marker rather than
  // interpreter-specific bytes.
  assert.equal(
    at("install_refuses_to_copy_caches_and_vcs").home["extensions/noisy/__pycache__"],
    "<python bytecode cache>",
  );

  // D4: a full uninstall removes the code and the bindings, and KEEPS the data.
  const uninstalled = at("uninstall_removes_the_source_and_bindings");
  assert.match(uninstalled.stdout, /bindings: 1 row\(s\) removed/);
  assert.deepEqual(uninstalled.database.tables, ["ext_notes_items"]);
  assert.deepEqual(
    uninstalled.database.bindings.map((row) => row.extension_id),
    ["other"],
    "a binding belonging to another extension is not collateral",
  );
  // `clean-claude` removes only an EMPTY parent: a directory holding a file a
  // human put there keeps both the directory and the file.
  const kept = at("clean_claude_keeps_a_directory_that_is_not_only_ours");
  assert.ok(".claude/skills/ext-notes/NOTES.md" in kept.project, "a human's file was deleted");
  assert.ok(!(".claude/skills/ext-notes/SKILL.md" in kept.project), "ours was not removed");

  // ...while a single-runtime uninstall keeps both the source and the bindings.
  assert.equal(at("uninstall_one_runtime_keeps_the_source").stdout.includes("source tree"), false);
});

test("a Claude command name becomes a Windows-safe directory, reversibly enough", () => {
  assert.equal(filesystemSkillDirName("ext:notes"), "ext-notes");
  assert.equal(filesystemSkillDirName("ext-notes"), "ext-notes");
  // Every illegal character maps to `-`, and a name that is nothing but
  // illegal characters still has to produce a directory.
  assert.equal(filesystemSkillDirName('a<b>c:d"e/f\\g|h?i*j'), "a-b-c-d-e-f-g-h-i-j");
  assert.equal(filesystemSkillDirName(" . "), "extension");
  assert.equal(filesystemSkillDirName(""), "extension");
  // Trailing dots and spaces are stripped: Windows silently drops them, so a
  // directory created with one can never be found again by the same name.
  assert.equal(filesystemSkillDirName("ext-notes. "), "ext-notes");
});

test("a write verb without a write context fails loudly", () => {
  const world = makeWorld();
  try {
    // The read context cannot install: refusing here is what stops a caller
    // from assembling half a context and getting a silent no-op.
    assert.throws(
      () =>
        runExtensionsCommand({ mirrorHome: world.home }, [
          "install",
          "notes",
          "--extensions-root",
          world.source,
        ]),
      UnsupportedCatalogCommandError,
    );
  } finally {
    closeWorld(world);
  }
});
