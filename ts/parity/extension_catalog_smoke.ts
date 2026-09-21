// The extension catalog lifecycle, run on BOTH engines and compared
// (CV22.DS7.TS4 plateau 7).
//
// The goldens grade each command against a recording. This smoke grades the
// FAMILY as a sequence, live, through the real front-door process with NO gate
// in the environment — since the 2026-09-16 flip that is the shipped default:
// install → `ext <id>` → bind → bindings → `ext <id> <subcommand>` → unbind →
// migrate → uninstall, each step run by Python in one disposable world and by
// TypeScript in another, with the streams, the file trees, and the rows
// compared after every step.
//
// Two things only a live run can prove:
//
//   * the front door's own seams — database resolution, the write handle, the
//     compat host spawned from a real process — behave the same as Python's
//     single-process CLI; and
//   * the front-door LOG carries leaf names only. Every step here passes an
//     argument that would be a leak if it appeared: an account id, a campaign
//     name, and a folder path.
//
// Disposable homes AND disposable target roots, never the developer's `.pi` —
// the plan-stage panel's explicit constraint for this family.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";

const REPO_ROOT = dirname(dirname(dirname(new URL(import.meta.url).pathname)));
const FIXTURES = join(REPO_ROOT, "ts", "test", "fixtures", "ext-catalog-writes");
const EXTENSION_ID = "notes";

/** Sentinels that must never reach `front-door.log`. */
const SENTINELS = ["acct-99887766", "campaign-midnight-launch", "/Users/secret/folder"];

interface World {
  root: string;
  home: string;
  source: string;
}

interface StepResult {
  label: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  tree: Record<string, string>;
}

function makeWorld(engine: string): World {
  const root = mkdtempSync(join(tmpdir(), `ext-smoke-${engine}-`));
  const home = join(root, "mirror");
  const source = join(root, "source");
  mkdirSync(home, { recursive: true });
  cpSync(FIXTURES, source, { recursive: true });
  return { root, home, source };
}

function environmentFor(world: World, engine: "python" | "ts"): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("MIRROR_TS_")) continue;
    if (key === "MIRROR_HOME" || key === "MIRROR_USER" || key === "DB_PATH") continue;
    environment[key] = value;
  }
  environment.MIRROR_HOME = world.home;
  environment.MEMORY_ENV = "test";
  environment.OPENROUTER_API_KEY = "";
  // No gate: since the 2026-09-16 flip the TS side runs on the SHIPPED default,
  // so this smoke proves what a user gets rather than what an opt-in gets.
  void engine;
  return environment;
}

function run(world: World, engine: "python" | "ts", argv: readonly string[]): StepResult {
  const resolved = argv.map((token) => token.replace("<SRC>", world.source));
  const command =
    engine === "python"
      ? { file: "uv", args: ["run", "python", "-m", "memory", ...resolved] }
      : {
          file: process.execPath,
          args: ["--no-warnings", join(REPO_ROOT, "ts/src/frontDoor/cli.ts"), ...resolved],
        };
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    stdout = execFileSync(command.file, [...command.args, "--mirror-home", world.home], {
      cwd: REPO_ROOT,
      env: environmentFor(world, engine),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; status?: number };
    stdout = failure.stdout ?? "";
    stderr = failure.stderr ?? "";
    exitCode = failure.status ?? 1;
  }
  return {
    label: resolved.join(" "),
    stdout: redact(stdout, world),
    stderr: redact(stderr, world),
    exitCode,
    tree: treeOf(world.home, world),
  };
}

function redact(text: string, world: World): string {
  return text.split(world.home).join("<HOME>").split(world.source).join("<SRC>");
}

/** The home's files, with the non-portable entries collapsed as the corpora do. */
function treeOf(root: string, world: World): Record<string, string> {
  const files: Record<string, string> = {};
  if (!existsSync(root)) return files;
  for (const path of walk(root)) {
    const parts = relative(root, path).split(sep);
    const name = parts[parts.length - 1] as string;
    // CV22.DS10.TS2, one-directional and permanent: both of these are left by a
    // PYTHON PROCESS running at install time. Python's install imports the
    // extension (`__pycache__`) through a path that opens the database (the
    // bootstrap lock); TypeScript imports nothing now and produces neither.
    // Python cannot stop producing them while it owns its own install path, so
    // they are excluded rather than reconciled. Their absence on the TS side is
    // asserted directly in `catalogWrites.test.ts`.
    if (parts.includes("__pycache__")) continue;
    if (name.endsWith(".bootstrap.lock")) continue;
    if (name.endsWith(".db") || name.endsWith("-wal") || name.endsWith("-shm")) continue;
    // The log differs by design (it records the engine that answered) and is
    // asserted separately, on content rather than on bytes.
    if (name === "front-door.log" || name === "mirror-logger.log") continue;
    if (name === "extensions.json") {
      // `generated_at` is a clock; everything else in the catalog is graded.
      files[parts.join("/")] = redact(readFileSync(path, "utf8"), world).replace(
        /"generated_at": "[^"]+"/,
        '"generated_at": "<TIMESTAMP>"',
      );
      continue;
    }
    files[parts.join("/")] = createHash("sha256")
      .update(readFileSync(path))
      .digest("hex")
      .slice(0, 16);
  }
  return files;
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

const STEPS: string[][] = [
  ["extensions", "install", EXTENSION_ID, "--extensions-root", "<SRC>"],
  ["extensions", "list"],
  ["ext", "list"],
  ["ext", EXTENSION_ID],
  ["ext", EXTENSION_ID, "bind", "greeting", "--persona", "engineer"],
  ["ext", EXTENSION_ID, "bindings"],
  // The dispatch, carrying every sentinel the log must not learn. Graded by
  // `tsOnlySubcommandFailures`, not cross-engine -- see that function for why.
  // It still runs on BOTH engines, because the log half of this smoke depends
  // on the TS front door actually dispatching with these arguments.
  ["ext", EXTENSION_ID, "add", SENTINELS[0] as string, SENTINELS[1] as string, SENTINELS[2] as string],
  ["ext", EXTENSION_ID, "unbind", "greeting", "--persona", "engineer"],
  ["ext", EXTENSION_ID, "migrate"],
  ["inspect", "extension", EXTENSION_ID],
  ["list", "all"],
  ["extensions", "uninstall", EXTENSION_ID],
];

/**
 * The two steps that read an extension's SUBCOMMANDS, which are TypeScript's
 * own surface now.
 *
 * One cause, two symptoms. Python answers both from the live `api.cli_registry`
 * it built by importing `extension.py`; with the compatibility host deleted,
 * TypeScript answers both from the manifest's `cli.subcommands[]`. The `notes`
 * fixture registers `add` and documents nothing, so the two engines are
 * SUPPOSED to disagree here, and comparing them could never pass. Everything
 * that does not depend on the registry -- install, catalogs, bindings,
 * migrate, inspect, uninstall -- stays fully cross-engine graded above.
 */
function tsOnlySubcommandFailures(step: readonly string[], ts: StepResult): string[] {
  const failures: string[] = [];
  const isDispatch = step[2] === "add";
  if (isDispatch) {
    if (ts.exitCode !== 1) failures.push(`dispatch should refuse at exit 1, got ${ts.exitCode}`);
    if (!ts.stdout.includes(`unknown subcommand 'add' for extension/${EXTENSION_ID}`)) {
      failures.push(`dispatch should name the unknown subcommand, got ${JSON.stringify(ts.stdout)}`);
    }
  } else if (ts.exitCode !== 0) {
    failures.push(`listing should succeed, got ${ts.exitCode}`);
  }
  // Both surfaces must report what the MANIFEST documents -- here, nothing --
  // rather than inventing the registry's view of it.
  if (!ts.stdout.includes(`=== subcommands of extension/${EXTENSION_ID} ===`)) {
    failures.push("expected the manifest-rendered listing");
  }
  if (!ts.stdout.includes("(none declared)")) {
    failures.push("the fixture documents no subcommands; the listing must say so");
  }
  return failures;
}

function compare(python: StepResult, ts: StepResult): string[] {
  const failures: string[] = [];
  if (python.stdout !== ts.stdout) {
    failures.push(
      `stdout differs\n  python: ${JSON.stringify(python.stdout)}\n  ts:     ${JSON.stringify(ts.stdout)}`,
    );
  }
  if (python.exitCode !== ts.exitCode) {
    failures.push(`exit differs: python=${python.exitCode} ts=${ts.exitCode}`);
  }
  const keys = new Set([...Object.keys(python.tree), ...Object.keys(ts.tree)]);
  for (const key of [...keys].sort()) {
    if (python.tree[key] !== ts.tree[key]) {
      failures.push(
        `tree differs at ${key}\n  python: ${python.tree[key] ?? "(absent)"}\n  ts:     ${ts.tree[key] ?? "(absent)"}`,
      );
    }
  }
  return failures;
}

function main(): number {
  const pythonWorld = makeWorld("python");
  const tsWorld = makeWorld("ts");
  let failed = 0;
  try {
    for (const step of STEPS) {
      const python = run(pythonWorld, "python", step);
      const ts = run(tsWorld, "ts", step);
      // `ext <id>` (the listing) and `ext <id> add` (the dispatch) both read
      // the subcommand set, which moved from Python's registry to the manifest.
      // `ext list` is the extension INVENTORY, not a subcommand listing, and
      // stays cross-engine graded -- hence the explicit id check.
      const readsSubcommands =
        step[0] === "ext" &&
        step[1] === EXTENSION_ID &&
        (step.length === 2 || step[2] === "add");
      const failures = readsSubcommands
        ? tsOnlySubcommandFailures(step, ts)
        : compare(python, ts);
      if (failures.length === 0) {
        console.log(`  ${readsSubcommands ? "TS-ONLY" : "OK"}    ${step.join(" ")}`);
        continue;
      }
      failed += 1;
      console.log(`  DIFF  ${step.join(" ")}`);
      for (const failure of failures) console.log(`        ${failure}`);
    }

    // The log is the other half of this smoke: leaf names, never arguments.
    const logPath = join(tsWorld.home, "front-door.log");
    const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    for (const sentinel of SENTINELS) {
      if (log.includes(sentinel)) {
        failed += 1;
        console.log(`  LEAK  front-door.log carries ${sentinel}`);
      }
    }
    if (!log.includes(`leaf=${EXTENSION_ID}`)) {
      failed += 1;
      console.log("  MISS  front-door.log never recorded the dispatch leaf");
    }
    console.log(
      failed === 0
        ? "\nextension catalog smoke: both engines agree, and the log holds no argument"
        : `\nextension catalog smoke: ${failed} failure(s)`,
    );
    return failed === 0 ? 0 : 1;
  } finally {
    rmSync(pythonWorld.root, { recursive: true, force: true });
    rmSync(tsWorld.root, { recursive: true, force: true });
  }
}

process.exit(main());
