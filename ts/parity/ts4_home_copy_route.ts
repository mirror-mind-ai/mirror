// The automatable half of CV22.DS7.TS4's Navigator route, run on a COPY of a
// real mirror home (plateau 7 → 8 handoff).
//
// The Test Guide's seven steps are a Navigator acceptance route, and acceptance
// stays the Navigator's. What does NOT need a human is the comparison itself:
// steps 1, 2, 3, and 7 are read-only or revertible, so they can run here — on a
// copy — and leave the Navigator with the short list that genuinely requires
// their own home, their own editor, and their own judgment.
//
// SAFETY, in order of importance:
//
//   * The source home is opened READ-ONLY. Nothing here writes to it; the copy
//     is made with `cp -R` semantics and every command runs against the copy.
//   * The copy's database is renamed to a `*_test.db` name and every command
//     runs with `MEMORY_ENV=test`, so even a command that decides to write
//     cannot reach a file named `memory.db` — the TS core's copy guard refuses
//     that by construction.
//   * Only READ-ONLY extension subcommands are dispatched. An extension's
//     `register(api)` runs (that is what `ext <id>` means in both engines), but
//     no mutating subcommand is invoked.
//
// Usage:
//   node --no-warnings ts/parity/ts4_home_copy_route.ts [--home <path>]

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const REPO_ROOT = dirname(dirname(dirname(new URL(import.meta.url).pathname)));

interface Step {
  label: string;
  argv: string[];
  /** Gate value for the TS run; the Python run never sets one. */
  gate?: Record<string, string>;
  /** When set, the TS run is expected to fall back to Python (a revert drill). */
  revert?: boolean;
}

function sourceHome(): string {
  const flagIndex = process.argv.indexOf("--home");
  if (flagIndex >= 0 && process.argv[flagIndex + 1]) return process.argv[flagIndex + 1] as string;
  if (process.env.MIRROR_HOME) return process.env.MIRROR_HOME;
  const user = process.env.MIRROR_USER ?? readMirrorUserFromEnvFile();
  if (!user) throw new Error("no mirror home: pass --home or set MIRROR_HOME");
  return join(homedir(), ".mirror-minds", user);
}

function readMirrorUserFromEnvFile(): string | null {
  const envFile = join(REPO_ROOT, ".env");
  if (!existsSync(envFile)) return null;
  const match = readFileSync(envFile, "utf8").match(/^MIRROR_USER=(.+)$/m);
  return match ? (match[1] as string).trim() : null;
}

/**
 * Copy the parts of a home this route reads.
 *
 * Not the whole home: `backups/` alone can be gigabytes, and nothing here reads
 * it. The database is copied under the `_test` name so the production one
 * cannot be the file any command resolves.
 */
function copyHome(source: string): string {
  const root = mkdtempSync(join(tmpdir(), "ts4-home-copy-"));
  const home = join(root, "mirror");
  for (const entry of ["extensions", "runtime", "identity"]) {
    const from = join(source, entry);
    // `dereference`: the installed extensions are often symlinks into source
    // repos. Copying the links would leave the copy pointing at the real trees,
    // and a command that writes would reach outside the copy.
    if (existsSync(from)) cpSync(from, join(home, entry), { recursive: true, dereference: true });
  }
  const database = existsSync(join(source, "memory.db"))
    ? join(source, "memory.db")
    : join(source, "memory_test.db");
  cpSync(database, join(home, "copied.db"));
  renameSync(join(home, "copied.db"), join(home, "memory_test.db"));
  return home;
}

function environmentFor(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("MIRROR_TS_")) continue;
    if (key === "MIRROR_HOME" || key === "MIRROR_USER" || key === "DB_PATH") continue;
    environment[key] = value;
  }
  environment.MIRROR_HOME = home;
  environment.MEMORY_ENV = "test";
  return { ...environment, ...extra };
}

function run(
  home: string,
  engine: "python" | "ts",
  argv: readonly string[],
  extra: Record<string, string> = {},
): { stdout: string; stderr: string; exitCode: number } {
  const command =
    engine === "python"
      ? { file: "uv", args: ["run", "python", "-m", "memory", ...argv] }
      : {
          file: process.execPath,
          args: ["--no-warnings", join(REPO_ROOT, "ts/src/frontDoor/cli.ts"), ...argv],
        };
  try {
    const stdout = execFileSync(command.file, [...command.args, "--mirror-home", home], {
      cwd: REPO_ROOT,
      env: environmentFor(home, extra),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      exitCode: failure.status ?? 1,
    };
  }
}

/**
 * Every installed extension, symlinks included.
 *
 * The production layout links installed extensions straight at their source
 * repos — the reason `_should_copy_source_tree` refuses to install through a
 * link — so a `Dirent.isDirectory()` filter finds only the ones that happen to
 * be real directories. On the home this was written against, that was one of
 * seven. `existsSync` on the manifest follows the link and finds the rest.
 */
function installedExtensions(home: string): string[] {
  const root = join(home, "extensions");
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => existsSync(join(root, name, "skill.yaml")))
    .sort();
}

function buildSteps(home: string): Step[] {
  const catalogGate = { MIRROR_TS_EXTENSIONS: "1" };
  const steps: Step[] = [
    // Step 1 — the read-only diff.
    { label: "extensions list", argv: ["extensions", "list"], gate: catalogGate },
    { label: "extensions validate", argv: ["extensions", "validate"], gate: catalogGate },
    { label: "ext list", argv: ["ext", "list"], gate: catalogGate },
    { label: "list all", argv: ["list", "all"], gate: catalogGate },
    {
      label: "inspect runtime-catalog pi",
      argv: ["inspect", "runtime-catalog", "pi"],
      gate: catalogGate,
    },
    {
      label: "inspect runtime-catalog claude",
      argv: ["inspect", "runtime-catalog", "claude"],
      gate: catalogGate,
    },
    {
      label: "inspect llm-calls --summary",
      argv: ["inspect", "llm-calls", "--summary"],
      gate: catalogGate,
    },
    {
      label: "inspect llm-calls --limit 5",
      argv: ["inspect", "llm-calls", "--limit", "5"],
      gate: catalogGate,
    },
    {
      label: "inspect embedding-provenance",
      argv: ["inspect", "embedding-provenance"],
      gate: catalogGate,
    },
  ];

  // Step 1/2 — every installed extension, inspected and then listed.
  for (const extensionId of installedExtensions(home)) {
    steps.push({
      label: `inspect extension ${extensionId}`,
      argv: ["inspect", "extension", extensionId],
      gate: catalogGate,
    });
    steps.push({ label: `ext ${extensionId}`, argv: ["ext", extensionId], gate: catalogGate });
  }

  // Step 3 — one READ-ONLY extension subcommand through the compat host.
  if (installedExtensions(home).includes("session-export")) {
    steps.push({
      label: "ext session-export folder (read-only dispatch)",
      argv: ["ext", "session-export", "folder"],
      gate: catalogGate,
    });
  }

  // Step 6 — the lifecycle demo, which touches no production data by contract.
  steps.push({
    label: "conversations --metadata-lifecycle-demo",
    argv: ["conversations", "--metadata-lifecycle-demo"],
    gate: { MIRROR_TS_CONVERSATIONS_LIFECYCLE: "1" },
  });

  // Step 7 — the revert drills: one leaf per family, each forced back to Python.
  steps.push({
    label: "revert: extensions list",
    argv: ["extensions", "list"],
    gate: { MIRROR_TS_EXTENSIONS: "0" },
    revert: true,
  });
  steps.push({
    label: "revert: ext list",
    argv: ["ext", "list"],
    gate: { MIRROR_TS_EXTENSIONS: "0" },
    revert: true,
  });
  steps.push({
    label: "revert: conversations --metadata-lifecycle-demo",
    argv: ["conversations", "--metadata-lifecycle-demo"],
    gate: { MIRROR_TS_CONVERSATIONS_LIFECYCLE: "0" },
    revert: true,
  });
  return steps;
}

/** Ids and timestamps are generated per run; the demo aliases both engines'. */
function normalize(text: string, home: string): string {
  const aliases = new Map<string, string>();
  return text
    .split(home)
    .join("<HOME>")
    .replace(/\b[0-9a-f]{8}\b/g, (value) => {
      if (!aliases.has(value)) aliases.set(value, `<ID${aliases.size + 1}>`);
      return aliases.get(value) as string;
    })
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)/g, "<TIMESTAMP>");
}

/**
 * The MUTATING half, on two copies.
 *
 * The read-only steps share one copy because neither engine changes it. `apply`
 * and `identity edit` do change it, so each engine gets its own copy of the
 * same real home and the two results are compared — the only way to grade a
 * write on real data without either engine seeing the other's.
 */
function runWriteSteps(source: string): number {
  const pythonHome = copyHome(source);
  const tsHome = copyHome(source);
  let failures = 0;
  try {
    failures += compareIdentityEdit(pythonHome, tsHome);
    failures += compareLifecycleApply(pythonHome, tsHome);
    return failures;
  } finally {
    rmSync(dirname(pythonHome), { recursive: true, force: true });
    rmSync(dirname(tsHome), { recursive: true, force: true });
  }
}

/** Step 5, minus the Navigator's own editor: a scripted one, on real content. */
function compareIdentityEdit(pythonHome: string, tsHome: string): number {
  const target = firstIdentityEntry(pythonHome);
  if (!target) {
    console.log("  SKIP  identity edit (the copy holds no identity rows)");
    return 0;
  }
  const editor = join(dirname(pythonHome), "editor-append");
  writeFileSync(editor, '#!/bin/sh\nprintf "\\nedited by the route check\\n" >> "$1"\n', "utf8");
  chmodSync(editor, 0o755);

  const argv = ["identity", "edit", target.layer, target.key];
  const python = run(pythonHome, "python", argv, { EDITOR: editor });
  const ts = run(tsHome, "ts", argv, { EDITOR: editor, MIRROR_TS_IDENTITY_EDIT: "1" });
  const pythonContent = identityContent(pythonHome, target.layer, target.key);
  const tsContent = identityContent(tsHome, target.layer, target.key);

  if (
    python.stdout === ts.stdout &&
    python.exitCode === ts.exitCode &&
    pythonContent === tsContent
  ) {
    console.log(
      `  OK    identity edit ${target.layer}/${target.key} (scripted editor, content equal)`,
    );
    return 0;
  }
  console.log(`  DIFF  identity edit ${target.layer}/${target.key}`);
  console.log(`        python: ${JSON.stringify(python.stdout)} exit=${python.exitCode}`);
  console.log(`        ts:     ${JSON.stringify(ts.stdout)} exit=${ts.exitCode}`);
  if (pythonContent !== tsContent) console.log("        stored content differs");
  return 1;
}

function firstIdentityEntry(home: string): { layer: string; key: string } | null {
  const db = new DatabaseSync(join(home, "memory_test.db"), { readOnly: true });
  try {
    const row = db.prepare("SELECT layer, key FROM identity ORDER BY layer, key LIMIT 1").get() as
      | { layer?: string; key?: string }
      | undefined;
    return row?.layer && row.key ? { layer: row.layer, key: row.key } : null;
  } finally {
    db.close();
  }
}

function identityContent(home: string, layer: string, key: string): string {
  const db = new DatabaseSync(join(home, "memory_test.db"), { readOnly: true });
  try {
    const row = db
      .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
      .get(layer, key) as { content?: string } | undefined;
    return row?.content ?? "";
  } finally {
    db.close();
  }
}

/**
 * Step 6's second half: `--metadata-lifecycle-apply` on REAL conversations, one
 * per decision state — the states the plan-stage quality-assurance panel said
 * had to come from a real copy "or the branches are theory".
 */
function compareLifecycleApply(pythonHome: string, tsHome: string): number {
  const chosen = classifyConversations(pythonHome);
  if (chosen.length === 0) {
    console.log("  SKIP  metadata-lifecycle-apply (no classifiable conversations in the copy)");
    return 0;
  }
  let failures = 0;
  for (const { state, id } of chosen) {
    const argv = [
      "conversations",
      "--metadata-lifecycle-apply",
      id,
      "--title",
      "Route check replacement title",
      "--summary",
      "Route check summary for the metadata lifecycle apply face.",
    ];
    const python = run(pythonHome, "python", argv);
    const ts = run(tsHome, "ts", argv, { MIRROR_TS_CONVERSATIONS_LIFECYCLE: "1" });
    const pythonRow = conversationRow(pythonHome, id);
    const tsRow = conversationRow(tsHome, id);
    const sameReport = normalize(python.stdout, pythonHome) === normalize(ts.stdout, tsHome);
    if (sameReport && python.exitCode === ts.exitCode && pythonRow === tsRow) {
      console.log(
        `  OK    metadata-lifecycle-apply on a ${state} conversation (report and row equal)`,
      );
      continue;
    }
    failures += 1;
    console.log(`  DIFF  metadata-lifecycle-apply on a ${state} conversation`);
    if (!sameReport) console.log("        report differs");
    if (pythonRow !== tsRow) {
      console.log(`        python row: ${pythonRow}`);
      console.log(`        ts row:     ${tsRow}`);
    }
  }
  return failures;
}

/** One conversation per decision state, taken from the real copy. */
function classifyConversations(home: string): Array<{ state: string; id: string }> {
  const db = new DatabaseSync(join(home, "memory_test.db"), { readOnly: true });
  let ids: string[];
  try {
    // Two queries, because recency alone does not find every state. A manual
    // title lock is rare and old — the state the plan-stage panel named first —
    // so it is asked for BY NAME rather than hoped for in the recent window,
    // and the dry-run below still decides; the SQL only nominates.
    const locked = db
      .prepare(
        'SELECT id FROM conversations WHERE metadata LIKE \'%"title_status": "manual"%\' ' +
          "ORDER BY started_at DESC LIMIT 5",
      )
      .all()
      .map((row) => String((row as { id: string }).id));
    const recent = db
      .prepare("SELECT id FROM conversations ORDER BY started_at DESC LIMIT 60")
      .all()
      .map((row) => String((row as { id: string }).id));
    ids = [...locked, ...recent];
  } finally {
    db.close();
  }
  const wanted = new Map<string, string>();
  for (const id of ids) {
    if (wanted.size >= 3) break;
    const report = run(home, "python", ["conversations", "--metadata-lifecycle-dry-run", id]);
    if (report.exitCode !== 0) continue;
    let fields: Record<string, { decision?: string }>;
    try {
      fields = (JSON.parse(report.stdout) as { fields: Record<string, { decision?: string }> })
        .fields;
    } catch {
      continue;
    }
    const title = fields.title?.decision;
    const tags = fields.tags?.decision;
    if (title === "preserve" && !wanted.has("manually locked")) wanted.set("manually locked", id);
    else if (title === "refine_candidate" && !wanted.has("refine candidate")) {
      wanted.set("refine candidate", id);
    } else if (tags === "defer" && !wanted.has("deferred tags")) wanted.set("deferred tags", id);
  }
  return [...wanted].map(([state, id]) => ({ state, id }));
}

function conversationRow(home: string, id: string): string {
  const db = new DatabaseSync(join(home, "memory_test.db"), { readOnly: true });
  try {
    const row = db
      .prepare("SELECT title, summary, tags, metadata FROM conversations WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return JSON.stringify(row ?? null);
  } finally {
    db.close();
  }
}

function main(): number {
  const source = sourceHome();
  if (!existsSync(source)) {
    console.error(`no such mirror home: ${source}`);
    return 2;
  }
  console.log(`source home (read-only): ${source}`);
  const home = copyHome(source);
  console.log(`working copy:            ${home}\n`);

  let failures = 0;
  try {
    for (const step of buildSteps(home)) {
      const python = run(home, "python", step.argv);
      const ts = run(home, "ts", step.argv, step.gate ?? {});
      const sameOut = normalize(python.stdout, home) === normalize(ts.stdout, home);
      const sameCode = python.exitCode === ts.exitCode;
      if (sameOut && sameCode) {
        console.log(`  OK    ${step.label}${step.revert ? " (reverted to Python)" : ""}`);
        continue;
      }
      failures += 1;
      console.log(`  DIFF  ${step.label}  (python exit=${python.exitCode} ts exit=${ts.exitCode})`);
      const expected = normalize(python.stdout, home).split("\n");
      const actual = normalize(ts.stdout, home).split("\n");
      for (let index = 0; index < Math.max(expected.length, actual.length); index += 1) {
        if (expected[index] === actual[index]) continue;
        console.log(`        python: ${JSON.stringify(expected[index] ?? "(end)")}`);
        console.log(`        ts:     ${JSON.stringify(actual[index] ?? "(end)")}`);
        break;
      }
      if (ts.stderr) console.log(`        ts stderr: ${ts.stderr.split("\n")[0]}`);
    }

    // The log must carry leaf names only, on a real home's extension ids too.
    const logPath = join(home, "front-door.log");
    const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    const leaked = ["--account", "--campaign", "--folder"].filter((token) => log.includes(token));
    if (leaked.length > 0) {
      failures += 1;
      console.log(`  LEAK  front-door.log carries ${leaked.join(", ")}`);
    }
    console.log("\n-- mutating steps, one copy per engine --");
    failures += runWriteSteps(source);

    console.log(
      failures === 0
        ? "\nhome-copy route: both engines agree on every automatable step"
        : `\nhome-copy route: ${failures} difference(s)`,
    );
    return failures === 0 ? 0 : 1;
  } finally {
    rmSync(dirname(home), { recursive: true, force: true });
  }
}

process.exit(main());
