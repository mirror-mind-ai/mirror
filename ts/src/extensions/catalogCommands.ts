// argv -> answer for the extension-catalog READS (CV22.DS7.TS4 plateau 1).
//
// The composition layer over `catalog.ts`: the hand-rolled argument parsing
// `cli/extensions.py`, `cli/ext.py`, and `cli/inspect.py` do, and the exact
// order in which each command prints, refuses, and exits. Nothing here is
// routed -- `routing.ts` still sends every one of these to Python; the front
// door is plateau 7.
//
// The write verbs (`sync`, `install`, `uninstall`, `expose-claude`,
// `clean-claude`) are plateau 5 -- the plan's amendment swapped them with the
// dispatch, because installing a command-skill calls the extension's own
// `register(api)` and so DEPENDS on the host this plateau lands. Their
// REFUSALS live here already, because they are produced by this parser before
// any write is attempted, and a validated write argv raises
// `UnsupportedCatalogCommandError` rather than pretending: an unimplemented
// path must fail loudly, not silently print nothing.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WritableDatabase } from "#db/database.ts";
import {
  type BindingDeps,
  parseBindingTail,
  runBind,
  runBindings,
  runMigrate,
  runUnbind,
} from "./bindings.ts";
import {
  discoverExtensions,
  extensionsRootForHome,
  filterManifestsForRuntime,
  type RenderedCommand,
  renderCommandSkillList,
  renderExtensionList,
  renderInspectExtension,
  renderInspectRuntimeCatalog,
  runtimeSkillsRootForHome,
} from "./catalog.ts";
import {
  cleanupClaudeRuntimeSkills,
  exposeClaudeRuntimeSkills,
  installExtension,
  loadRuntimeCatalog,
  type RegisterValidator,
  renderInstallReport,
  renderUninstallReport,
  syncExtensionsForRuntime,
  uninstallExtension,
} from "./catalogWrites.ts";
import {
  type ExtensionDispatch,
  extensionNotInstalled,
  installedExtensionDir,
} from "./dispatch.ts";
import { ExtensionValidationError } from "./errors.ts";

export class UnsupportedCatalogCommandError extends Error {}

const EXTENSIONS_USAGE =
  "Usage: python -m memory extensions [list|validate|sync|install|uninstall|" +
  "expose-claude|clean-claude] [--mirror-home PATH] [--extensions-root PATH] " +
  "[--runtime NAME] [--target-root PATH]";
const LIST_USAGE =
  "Usage: python -m memory list [personas|journeys|extensions|all] " +
  "[--mirror-home PATH] [--verbose] [--extensions-root PATH] [--runtime NAME]";
const INSPECT_USAGE =
  "Usage: python -m memory inspect persona|extension|runtime-catalog|llm-calls|" +
  "embedding-provenance <id> [--mirror-home PATH] [--extensions-root PATH]";
const EXT_USAGE = [
  "Usage:",
  "  python -m memory ext list",
  "  python -m memory ext <id> [--help]",
  "  python -m memory ext <id> <subcommand> [args...]",
  "  python -m memory ext <id> bind <capability> (--persona <id> | --journey <id> | --global)",
  "  python -m memory ext <id> unbind <capability> (--persona <id> | --journey <id> | --global)",
  "  python -m memory ext <id> bindings",
  "  python -m memory ext <id> migrate",
  "",
].join("\n");

const EXTENSIONS_VERBS = new Set([
  "list",
  "validate",
  "sync",
  "install",
  "uninstall",
  "expose-claude",
  "clean-claude",
]);

/** Everything these commands need from the environment, passed, never read. */
export interface CatalogContext {
  /** The resolved Mirror home; `--mirror-home` has already been applied. */
  readonly mirrorHome: string;
}

/** The writable half, for the four `ext` verbs that touch the database. */
export interface ExtWriteContext extends CatalogContext {
  readonly db: WritableDatabase;
  readonly deps: BindingDeps;
}

/**
 * The catalog WRITE half. It adds one capability the others do not need:
 * validating an installed command-skill's `register(api)`, which still runs
 * through the temporary Python host and so must be injected rather than
 * reached for -- a write context assembled without it cannot silently skip
 * the check and report a successful install of a broken extension.
 */
export interface CatalogWriteContext extends ExtWriteContext {
  readonly validateRegister: RegisterValidator;
}

const BUILTIN_VERBS = new Set(["bind", "unbind", "bindings", "migrate"]);
const HELP_FLAGS = new Set(["--help", "-h", "help"]);

const BUILTIN_VERB_HELP: Record<string, readonly [string, string]> = {
  bind: [
    "bind <capability> (--persona <id> | --journey <id> | --global)",
    "Bind a capability to a persona, a journey, or every context.",
  ],
  unbind: [
    "unbind <capability> (--persona <id> | --journey <id> | --global)",
    "Remove a capability binding.",
  ],
  bindings: ["bindings", "List the extension's capability bindings."],
  migrate: ["migrate", "Apply the extension's pending database migrations."],
};

function out(stdout: string, exitCode = 0): RenderedCommand {
  return { stdout, stderr: "", exitCode };
}

function usage(text: string): RenderedCommand {
  return out(`${text}\n`, 1);
}

interface ParsedOptions {
  extensionsRoot: string | null;
  mirrorHome: string | null;
  runtime: string | null;
  targetRoot: string | null;
  positional: string[];
}

/**
 * Port of `extensions._parse_args`.
 *
 * A flag whose value is missing is NOT an error here: the loop's `i + 1 <
 * len(args)` guard fails, so a trailing `--runtime` falls through to the
 * positional list and is read as a subcommand. Reproduced deliberately.
 */
export function parseCatalogOptions(argv: readonly string[]): ParsedOptions {
  const parsed: ParsedOptions = {
    extensionsRoot: null,
    mirrorHome: null,
    runtime: null,
    targetRoot: null,
    positional: [],
  };
  let index = 0;
  while (index < argv.length) {
    const token = argv[index] as string;
    const value = argv[index + 1];
    if (token === "--extensions-root" && value !== undefined) {
      parsed.extensionsRoot = value;
      index += 2;
    } else if (token === "--mirror-home" && value !== undefined) {
      parsed.mirrorHome = value;
      index += 2;
    } else if (token === "--runtime" && value !== undefined) {
      parsed.runtime = value;
      index += 2;
    } else if (token === "--target-root" && value !== undefined) {
      parsed.targetRoot = value;
      index += 2;
    } else {
      parsed.positional.push(token);
      index += 1;
    }
  }
  return parsed;
}

function resolveRoot(context: CatalogContext, explicit: string | null): string {
  return explicit ?? extensionsRootForHome(context.mirrorHome);
}

/** Python's `Path(p).expanduser()`, which the two `--target-root` verbs apply. */
function expandHomePath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function writeContext(context: CatalogContext, command: string): CatalogWriteContext {
  if (!isWriteContext(context) || !("validateRegister" in context)) {
    throw new UnsupportedCatalogCommandError(`extensions ${command} needs a write context`);
  }
  return context as CatalogWriteContext;
}

/**
 * Python lets `install`'s validation errors escape as a traceback: exit 1,
 * nothing on stdout. TypeScript cannot reproduce those bytes, so it answers
 * the recorded divergence shape -- the same exit code, one line on stderr --
 * and, like Python, writes nothing to stdout.
 */
function failLoudly(run: () => RenderedCommand): RenderedCommand {
  try {
    return run();
  } catch (error) {
    if (!(error instanceof ExtensionValidationError)) throw error;
    return { stdout: "", stderr: `${error.message}\n`, exitCode: 1 };
  }
}

/** Port of the read half of `cmd_extensions`. */
export function runExtensionsCommand(
  context: CatalogContext,
  argv: readonly string[],
): RenderedCommand {
  const options = parseCatalogOptions(argv);
  const command = options.positional[0] ?? "list";
  if (!EXTENSIONS_VERBS.has(command)) return usage(EXTENSIONS_USAGE);

  if (command === "install") {
    if (options.positional.length !== 2) {
      return usage(
        "Usage: python -m memory extensions install <id> [--extensions-root PATH] " +
          "[--mirror-home PATH] [--runtime NAME]",
      );
    }
    if (options.extensionsRoot === null) return usage("install requires --extensions-root PATH");
    const write = writeContext(context, "install");
    return failLoudly(() =>
      renderInstallReport(
        installExtension({
          extensionId: options.positional[1] as string,
          sourceRoot: options.extensionsRoot as string,
          mirrorHome: write.mirrorHome,
          runtime: options.runtime,
          db: write.db,
          deps: write.deps,
          validateRegister: write.validateRegister,
        }),
      ),
    );
  }
  if (command === "uninstall") {
    if (options.positional.length !== 2) {
      return usage(
        "Usage: python -m memory extensions uninstall <id> [--mirror-home PATH] [--runtime NAME]",
      );
    }
    const write = writeContext(context, "uninstall");
    // Python CATCHES the validation error here and prints it as a line, where
    // `install` lets the same class escape as a traceback. Same command, two
    // refusal shapes, measured rather than unified.
    try {
      return renderUninstallReport(
        uninstallExtension({
          extensionId: options.positional[1] as string,
          mirrorHome: write.mirrorHome,
          runtime: options.runtime,
          db: write.db,
          deps: write.deps,
        }),
      );
    } catch (error) {
      if (!(error instanceof ExtensionValidationError)) throw error;
      return out(`${error.message}\n`, 1);
    }
  }
  if (command === "expose-claude" || command === "clean-claude") {
    if (options.targetRoot === null) return usage(`${command} requires --target-root PATH`);
    const write = writeContext(context, command);
    const projectRoot = expandHomePath(options.targetRoot);
    if (command === "clean-claude") {
      const report = cleanupClaudeRuntimeSkills(projectRoot);
      const lines = [
        `Removed Claude external skills from ${report.claudeSkillsRoot}`,
        `  overlay catalog: ${report.overlayCatalogPath}`,
        ...report.removed.map((path) => `  removed ${path}`),
      ];
      return out(`${lines.join("\n")}\n`);
    }
    try {
      const catalog = loadRuntimeCatalog("claude", write.mirrorHome);
      const report = exposeClaudeRuntimeSkills(projectRoot, catalog);
      const lines = [
        `Exposed Claude external skills into ${report.claudeSkillsRoot}`,
        `  overlay catalog: ${report.overlayCatalogPath}`,
        ...report.removed.map((path) => `  pruned ${path}`),
        ...report.exposed.map((item) => `  ${item.commandName} -> ${item.targetSkillPath}`),
      ];
      return out(`${lines.join("\n")}\n`);
    } catch (error) {
      if (!(error instanceof ExtensionValidationError)) throw error;
      return out(`${error.message}\n`, 1);
    }
  }

  const root = resolveRoot(context, options.extensionsRoot);
  const discovery = discoverExtensions(root);
  const manifests = filterManifestsForRuntime(discovery.manifests, options.runtime);

  if (command === "list") {
    const header = options.runtime === null ? "" : `Runtime filter: ${options.runtime}\n`;
    return out(header + renderExtensionList(manifests, discovery.errors, root));
  }

  // `validate` and `sync` share this prelude, and its ORDER is the measured
  // surprise: an invalid extension exits 1 here, BEFORE `sync` can complain
  // about a missing `--runtime`. This INVALID block also has no leading blank
  // line, unlike the one inside `print_extension_list`.
  let stdout = `Extensions root: ${root}\n`;
  if (options.runtime !== null) stdout += `Runtime filter: ${options.runtime}\n`;
  if (discovery.errors.length > 0) {
    stdout += "=== INVALID EXTENSIONS ===\n";
    for (const [extensionId, message] of discovery.errors) {
      stdout += `  ${extensionId}: ${message}\n`;
    }
    return out(stdout, 1);
  }
  if (command === "validate") {
    return out(`${stdout}Validated ${manifests.length} extension(s).\n`);
  }
  if (options.runtime === null) return out(`${stdout}sync requires --runtime\n`, 1);
  if (options.targetRoot === null) return out(`${stdout}sync requires --target-root PATH\n`, 1);

  // `sync` writes files but never the database, so it needs the clock seam and
  // nothing else. Note the target root is used RAW, not expanded: only
  // `expose-claude` and `clean-claude` call `expanduser` on theirs.
  const write = writeContext(context, "sync");
  const synced = syncExtensionsForRuntime(
    manifests,
    options.runtime,
    options.targetRoot,
    write.deps,
  );
  const lines = [
    `${stdout}Synced ${synced.length} extension(s) to ${options.targetRoot}`,
    ...synced.map((item) => `  ${item.command_name} -> ${item.installed_skill_path}`),
  ];
  return out(`${lines.join("\n")}\n`);
}

/**
 * Port of `cmd_ext`: the top-level parse, `_cmd_list`, `_print_top_help`, the
 * built-in verbs, and the DECISION to dispatch into an extension.
 *
 * It answers with bytes for everything it can decide alone, and with an
 * `ExtensionDispatch` for `ext <id>` and `ext <id> <subcommand>` -- the two
 * leaves that must load extension code. Deciding and executing are separate on
 * purpose: this layer stays pure and testable, and only the caller that is
 * allowed to spawn a process runs the decision.
 */
export function runExtCommand(
  context: CatalogContext,
  argv: readonly string[],
): RenderedCommand | ExtensionDispatch {
  const args: string[] = [];
  let mirrorHome: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    const value = argv[index + 1];
    if (token === "--mirror-home" && value !== undefined) {
      mirrorHome = value;
      index += 1;
      continue;
    }
    args.push(token);
  }
  const home = mirrorHome ?? context.mirrorHome;
  const head = args[0];
  // A bare `ext` and `ext --help` print the SAME bytes and differ only in the
  // exit code. Measured, not assumed.
  if (head === undefined) return out(EXT_USAGE, 1);
  if (head === "--help" || head === "-h" || head === "help") return out(EXT_USAGE, 0);
  if (head === "list") {
    const root = extensionsRootForHome(home);
    const discovery = discoverExtensions(root);
    return out(renderCommandSkillList(discovery.manifests, discovery.errors, root));
  }

  const extensionId = head;
  const rest = args.slice(1);
  const verb = rest[0];
  // `ext <id>` lists the extension's subcommands, and Python models that as a
  // dispatch of `--help` rather than as a command of its own.
  if (verb === undefined) return dispatchOrNotInstalled(home, extensionId, "--help", []);
  const tail = rest.slice(1);

  // Describe, never execute: this guard is a fix `cli/ext.py` carries, and
  // losing it would make `ext <id> migrate --help` APPLY migrations.
  if (BUILTIN_VERBS.has(verb) && tail.some((token) => HELP_FLAGS.has(token))) {
    const [usage, description] = BUILTIN_VERB_HELP[verb] as readonly [string, string];
    return out(`Usage:\n  python -m memory ext ${extensionId} ${usage}\n\n${description}\n`);
  }

  if (!BUILTIN_VERBS.has(verb)) return dispatchOrNotInstalled(home, extensionId, verb, tail);
  if (!isWriteContext(context)) {
    throw new UnsupportedCatalogCommandError(`ext ${verb} needs a writable database`);
  }
  if (verb === "bindings") return runBindings(context.db, extensionId);
  if (verb === "migrate") return runMigrate(context.db, home, extensionId, context.deps);

  const parsed = parseBindingTail(extensionId, verb === "bind" ? "bind" : "unbind", tail);
  if ("stdout" in parsed) return parsed;
  const target = { kind: parsed.kind, id: parsed.id };
  return verb === "bind"
    ? runBind(context.db, extensionId, parsed.capabilityId, target, context.deps)
    : runUnbind(context.db, extensionId, parsed.capabilityId, target);
}

function isWriteContext(context: CatalogContext): context is ExtWriteContext {
  return "db" in context;
}

/**
 * The installed check `_dispatch_subcommand` runs before loading anything.
 *
 * The refusal prints the path Python BUILT, not the path it would resolve --
 * see `installedExtensionDir` for why that distinction is observable.
 */
function dispatchOrNotInstalled(
  mirrorHome: string,
  extensionId: string,
  subcommand: string,
  argv: readonly string[],
): RenderedCommand | ExtensionDispatch {
  const extensionRoot = installedExtensionDir(mirrorHome, extensionId);
  if (!existsSync(extensionRoot)) return extensionNotInstalled(mirrorHome, extensionId);
  return {
    kind: "extension-subcommand",
    extensionId,
    subcommand,
    argv: [...argv],
    mirrorHome,
    extensionRoot,
  };
}

/** Port of `cmd_list`'s extension branch and its usage refusal. */
export function runListCommand(context: CatalogContext, argv: readonly string[]): RenderedCommand {
  const options = parseCatalogOptions(argv);
  const target = options.positional[0] ?? "all";
  if (!["personas", "journeys", "extensions", "all"].includes(target)) return usage(LIST_USAGE);
  if (target !== "extensions") {
    // `personas`, `journeys`, and the persona/journey halves of `all` are
    // DS7.US1's ported reads; the front-door composition is plateau 7.
    throw new UnsupportedCatalogCommandError(`list ${target} composes the DS7.US1 reads`);
  }
  const root = resolveRoot(context, options.extensionsRoot);
  const discovery = discoverExtensions(root);
  const manifests = filterManifestsForRuntime(discovery.manifests, options.runtime);
  const header = options.runtime === null ? "" : `Runtime filter: ${options.runtime}\n`;
  return out(header + renderExtensionList(manifests, discovery.errors, root));
}

/** Port of `cmd_inspect`'s catalog targets and its usage refusal. */
export function runInspectCommand(
  context: CatalogContext,
  argv: readonly string[],
): RenderedCommand {
  const options = parseCatalogOptions(argv);
  const [target, targetId] = options.positional;
  if (
    options.positional.length !== 2 ||
    target === undefined ||
    !["persona", "extension", "runtime-catalog"].includes(target)
  ) {
    return usage(INSPECT_USAGE);
  }
  if (target === "persona") {
    throw new UnsupportedCatalogCommandError("inspect persona is DS7.US1's ported read");
  }
  if (target === "extension") {
    return renderInspectExtension(resolveRoot(context, options.extensionsRoot), targetId as string);
  }
  const runtime = targetId as string;
  return out(
    renderInspectRuntimeCatalog(runtimeSkillsRootForHome(context.mirrorHome, runtime), runtime),
  );
}
