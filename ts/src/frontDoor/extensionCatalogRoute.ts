// Front-door route for the extension catalog family (CV22.DS7.TS4 plateau 7):
// `extensions`, `ext`, `list extensions|all`, and `inspect`'s four TS4 targets.
//
// The route is thin on purpose. Every byte it prints was decided by
// `catalogCommands.ts` or `inspectLedger.ts`, both pure and graded by their own
// corpora. What happens here is the part a corpus cannot cover: choosing a read
// or a write handle, composing `list all` from three ported renderers,
// executing a dispatch decision in a real process, and reporting a LEAF NAME to
// the front-door log.
//
// Two rules shape it:
//
//   * **Redaction.** `detail` carries the leaf and nothing else. An extension
//     subcommand's argv routinely holds account ids, campaign names, and folder
//     paths — the security-engineer's plan-stage requirement — so a dispatch
//     logs `leaf=<id>` and never what followed it.
//   * **No handle while the host runs.** `ext <id> <subcommand>` reaches the
//     compat host, which opens the database itself, exactly as Python's
//     dispatcher does. So the dispatch decision is taken WITHOUT a handle and
//     the host is spawned with none open: two writers on one file is a
//     SQLITE_BUSY this route would be creating for itself.

import type { Database, WritableDatabase } from "#db/database.ts";
import type { BindingDeps } from "#extensions/bindings.ts";
import type { RenderedCommand } from "#extensions/catalog.ts";
import {
  type CatalogContext,
  type ExtWriteContext,
  runExtCommand,
  runExtensionsCommand,
  runInspectCommand,
  runListCommand,
  UnsupportedCatalogCommandError,
} from "#extensions/catalogCommands.ts";
import {
  type ExtensionDispatch,
  isExtensionDispatch,
  runExtensionSubcommand,
} from "#extensions/dispatch.ts";
import { listJourneysForListCommand } from "#identity/journeyListing.ts";
import { listPersonas } from "#identity/personaListing.ts";
import { runInspectEmbeddingProvenance, runInspectLlmCalls } from "#observability/inspectLedger.ts";
import { renderListJourneys, renderListPersonas } from "./render/list.ts";

export interface ExtensionRouteOutcome {
  exitCode: number;
  /** Leaf names only. Never an argument value. */
  detail: string;
}

export interface ExtensionRouteDeps {
  mirrorHome: string;
  databasePath: string;
  deps: BindingDeps;
  /**
   * The database seams, narrowed to an EXIT CODE on purpose: every caller here
   * answers a command, and a generic `<T>` would let a future branch smuggle a
   * value out of a handle that is already closed by the time it is read.
   */
  withReadOnlyDatabase: (run: (db: Database) => number) => number;
  withWritableDatabase: (
    run: (db: WritableDatabase) => Promise<number> | number,
  ) => Promise<number>;
  environment?: NodeJS.ProcessEnv;
}

/** The `extensions` verbs that need a writable handle; the rest read. */
const EXTENSIONS_WRITE_VERBS = new Set([
  "sync",
  "install",
  "uninstall",
  "expose-claude",
  "clean-claude",
]);
/** The `ext` built-in verbs that write. `bindings` reads; the rest dispatch. */
const EXT_WRITE_VERBS = new Set(["bind", "unbind", "migrate"]);
const EXT_READ_VERBS = new Set(["bindings"]);
const EXT_HELP_HEADS = new Set(["list", "--help", "-h", "help"]);

/** A failed `register(api)` during install: Python's traceback, one TS line. */

function emit(rendered: RenderedCommand): number {
  if (rendered.stdout) process.stdout.write(rendered.stdout);
  if (rendered.stderr) process.stderr.write(rendered.stderr);
  return rendered.exitCode;
}

/** The dispatcher's own `--mirror-home` consumption, so the verb is the verb. */
function extArgs(argv: readonly string[]): string[] {
  const args: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (token === "--mirror-home" && argv[index + 1] !== undefined) {
      index += 1;
      continue;
    }
    args.push(token);
  }
  return args;
}

/**
 * The leaf name for the front-door log.
 *
 * `extensions install ext-google-ads` logs `leaf=install`: the verb is the
 * leaf and the id is an argument. `ext google-ads campaigns --account 1234`
 * logs `leaf=google-ads` — the installed extension that answered — because the
 * subcommand's arguments are where account ids and campaign names live.
 */
export function leafFor(argv: readonly string[]): string {
  const command = argv[0] ?? "";
  if (command === "extensions") return firstPositional(argv.slice(1)) ?? "list";
  if (command === "inspect") return firstPositional(argv.slice(1)) ?? "(none)";
  if (command === "list") return firstPositional(argv.slice(1)) ?? "all";
  if (command === "ext") {
    const args = extArgs(argv);
    const head = args[0];
    if (head === undefined) return "(none)";
    if (EXT_HELP_HEADS.has(head)) return head;
    const verb = args[1];
    if (verb !== undefined && (EXT_WRITE_VERBS.has(verb) || EXT_READ_VERBS.has(verb))) {
      return `${head}/${verb}`;
    }
    return head;
  }
  return command;
}

function firstPositional(args: readonly string[]): string | null {
  const valued = new Set(["--mirror-home", "--extensions-root", "--runtime", "--target-root"]);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] as string;
    if (valued.has(token)) {
      index += 1;
      continue;
    }
    if (!token.startsWith("--")) return token;
  }
  return null;
}

function readContextFor(route: ExtensionRouteDeps): CatalogContext {
  return { mirrorHome: route.mirrorHome };
}

function dispatchOptions(route: ExtensionRouteDeps) {
  return {
    databasePath: route.databasePath,
    ...(route.environment ? { environment: route.environment } : {}),
  };
}

function writeContextFor(route: ExtensionRouteDeps, db: WritableDatabase): ExtWriteContext {
  return { mirrorHome: route.mirrorHome, db, deps: route.deps };
}

export async function runExtensionCatalogRoute(
  argv: readonly string[],
  route: ExtensionRouteDeps,
): Promise<ExtensionRouteOutcome> {
  const command = argv[0] ?? "";
  const args = argv.slice(1);
  const detail = `leaf=${leafFor(argv)}`;

  // No translation layer here any more: `install` no longer imports extension
  // code, so the one failure class this route used to catch -- a `register(api)`
  // raising inside the Python host -- cannot occur. Manifest and migration
  // failures keep the paths they already had.
  if (command === "extensions") {
    const verb = firstPositional(args) ?? "list";
    if (!EXTENSIONS_WRITE_VERBS.has(verb)) {
      return { exitCode: emit(runExtensionsCommand(readContextFor(route), args)), detail };
    }
    const exitCode = await route.withWritableDatabase((db) =>
      emit(runExtensionsCommand(writeContextFor(route, db), args)),
    );
    return { exitCode, detail };
  }

  if (command === "inspect") return { exitCode: runInspect(args, route), detail };
  if (command === "list") return { exitCode: runList(args, route), detail };
  if (command === "ext") return { exitCode: await runExt(argv, route), detail };

  throw new UnsupportedCatalogCommandError(`extension catalog route: ${command}`);
}

/**
 * `inspect`'s four TS4 targets, dispatched by target because they do not share
 * a refusal class: the catalog pair prints usage on stdout at exit 1, and the
 * ledger pair is argparse and exits 2 on stderr. One command, two classes.
 */
function runInspect(args: readonly string[], route: ExtensionRouteDeps): number {
  const target = firstPositional(args);
  if (target === "llm-calls" || target === "embedding-provenance") {
    return route.withReadOnlyDatabase((db) => {
      const result =
        target === "llm-calls"
          ? runInspectLlmCalls(db, args.slice(1))
          : runInspectEmbeddingProvenance(db, args.slice(1));
      return emit(result);
    });
  }
  return emit(runInspectCommand(readContextFor(route), args));
}

/**
 * `list`, composed.
 *
 * `all` prints personas, journeys, and extensions in that order with a blank
 * line between blocks — three renderers from two stories, which is why this
 * composition lives at the front door rather than inside either of them.
 */
function runList(args: readonly string[], route: ExtensionRouteDeps): number {
  const target = firstPositional(args) ?? "all";
  const verbose = args.includes("--verbose");
  if (target === "extensions") return emit(runListCommand(readContextFor(route), args));

  return route.withReadOnlyDatabase((db) => {
    process.stdout.write(renderListPersonas(listPersonas(db), verbose));
    process.stdout.write("\n");
    process.stdout.write(renderListJourneys(listJourneysForListCommand(db)));
    process.stdout.write("\n");
    // The extension block of `all` is `list extensions` with the same options.
    return emit(runListCommand(readContextFor(route), ["extensions", ...args.slice(1)]));
  });
}

/**
 * `ext`, in three shapes.
 *
 * The built-in verbs take a handle (write or read). The dispatch takes NONE:
 * the decision is pure, and the host that executes it opens the database
 * itself, exactly as Python's dispatcher does.
 */
async function runExt(argv: readonly string[], route: ExtensionRouteDeps): Promise<number> {
  const args = extArgs(argv);
  const verb = args[1];
  if (verb !== undefined && EXT_WRITE_VERBS.has(verb)) {
    return route.withWritableDatabase((db) =>
      emit(runExtCommand(writeContextFor(route, db), argv.slice(1)) as RenderedCommand),
    );
  }
  if (verb !== undefined && EXT_READ_VERBS.has(verb)) {
    return route.withWritableDatabase((db) =>
      emit(runExtCommand(writeContextFor(route, db), argv.slice(1)) as RenderedCommand),
    );
  }

  const answer = runExtCommand(readContextFor(route), argv.slice(1));
  if (!isExtensionDispatch(answer)) return emit(answer);
  return runExtensionSubcommand(answer as ExtensionDispatch, dispatchOptions(route));
}
