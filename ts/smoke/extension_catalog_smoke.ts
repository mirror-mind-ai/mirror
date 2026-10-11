// The extension catalog lifecycle as a SEQUENCE, live through the real
// front-door process (CV22.DS7.TS4 plateau 7; single-engine since
// CV22.DS10.TS5).
//
// The goldens grade each command against a recording. This smoke grades the
// FAMILY: install → `ext <id>` → bind → bindings → `ext <id> <subcommand>` →
// unbind → migrate → uninstall, each a fresh process against one disposable
// home. Two things only a live run can prove:
//
//   * the front door's own seams -- database resolution, the write handle, the
//     dispatch spawned from a real process -- carry the whole sequence; and
//   * the front-door LOG carries leaf names only. Every step here passes an
//     argument that would be a leak if it appeared: an account id, a campaign
//     name, and a folder path.
//
// Until CV22.DS10.TS5 every step also ran on the Python engine in a twin world,
// and streams, file trees, and rows were compared after each one. That
// comparison left with the oracle; the per-command bytes are graded by the
// frozen `extension-catalog` and `ext-catalog-writes` goldens.
//
// Disposable homes AND disposable target roots, never the developer's `.pi` —
// the plan-stage panel's explicit constraint for this family.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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
}

function makeWorld(): World {
  const root = mkdtempSync(join(tmpdir(), "ext-smoke-"));
  const home = join(root, "mirror");
  const source = join(root, "source");
  mkdirSync(home, { recursive: true });
  cpSync(FIXTURES, source, { recursive: true });
  return { root, home, source };
}

function environmentFor(world: World): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("MIRROR_TS_")) continue;
    if (key === "MIRROR_HOME" || key === "MIRROR_USER" || key === "DB_PATH") continue;
    environment[key] = value;
  }
  environment.MIRROR_HOME = world.home;
  environment.MEMORY_ENV = "test";
  environment.OPENROUTER_API_KEY = "";
  return environment;
}

function run(world: World, argv: readonly string[]): StepResult {
  const resolved = argv.map((token) => token.replace("<SRC>", world.source));
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    stdout = execFileSync(
      process.execPath,
      [
        "--no-warnings",
        join(REPO_ROOT, "ts/src/frontDoor/cli.ts"),
        ...resolved,
        "--mirror-home",
        world.home,
      ],
      {
        cwd: REPO_ROOT,
        env: environmentFor(world),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
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
  };
}

function redact(text: string, world: World): string {
  return text.split(world.home).join("<HOME>").split(world.source).join("<SRC>");
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
  [
    "ext",
    EXTENSION_ID,
    "add",
    SENTINELS[0] as string,
    SENTINELS[1] as string,
    SENTINELS[2] as string,
  ],
  ["ext", EXTENSION_ID, "unbind", "greeting", "--persona", "engineer"],
  ["ext", EXTENSION_ID, "migrate"],
  ["inspect", "extension", EXTENSION_ID],
  ["list", "all"],
  ["extensions", "uninstall", EXTENSION_ID],
];

/**
 * The two steps that read an extension's SUBCOMMANDS.
 *
 * Since the compatibility host was deleted (CV22.DS10.TS2) both answer from the
 * manifest's `cli.subcommands[]`, never from the `extension.py` the fixture
 * still carries. The `notes` fixture documents no subcommand, so the listing
 * must say so and the dispatch must refuse by name.
 */
function tsOnlySubcommandFailures(step: readonly string[], ts: StepResult): string[] {
  const failures: string[] = [];
  const isDispatch = step[2] === "add";
  if (isDispatch) {
    if (ts.exitCode !== 1) failures.push(`dispatch should refuse at exit 1, got ${ts.exitCode}`);
    if (!ts.stdout.includes(`unknown subcommand 'add' for extension/${EXTENSION_ID}`)) {
      failures.push(
        `dispatch should name the unknown subcommand, got ${JSON.stringify(ts.stdout)}`,
      );
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

/** Every step outside the subcommand surface is an ordinary success. */
function succeeds(ts: StepResult): string[] {
  return ts.exitCode === 0 ? [] : [`exit ${ts.exitCode}, stderr ${JSON.stringify(ts.stderr)}`];
}

function main(): number {
  const world = makeWorld();
  let failed = 0;
  try {
    for (const step of STEPS) {
      const ts = run(world, step);
      // `ext <id>` (the listing) and `ext <id> add` (the dispatch) both read
      // the subcommand set. `ext list` is the extension INVENTORY, not a
      // subcommand listing -- hence the explicit id check.
      const readsSubcommands =
        step[0] === "ext" && step[1] === EXTENSION_ID && (step.length === 2 || step[2] === "add");
      const failures = readsSubcommands ? tsOnlySubcommandFailures(step, ts) : succeeds(ts);
      if (failures.length === 0) {
        console.log(`  OK    ${step.join(" ")}`);
        continue;
      }
      failed += 1;
      console.log(`  FAIL  ${step.join(" ")}`);
      for (const failure of failures) console.log(`        ${failure}`);
    }

    // The log is the other half of this smoke: leaf names, never arguments.
    const logPath = join(world.home, "front-door.log");
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
        ? "\nextension catalog smoke: the sequence completes, and the log holds no argument"
        : `\nextension catalog smoke: ${failed} failure(s)`,
    );
    return failed === 0 ? 0 : 1;
  } finally {
    rmSync(world.root, { recursive: true, force: true });
  }
}

process.exit(main());
