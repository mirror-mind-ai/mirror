// argv -> answer for the extension-catalog READS (CV22.DS7.TS4 plateau 1).
//
// The composition layer over `catalog.ts`: the hand-rolled argument parsing
// `cli/extensions.py`, `cli/ext.py`, and `cli/inspect.py` do, and the exact
// order in which each command prints, refuses, and exits. Nothing here is
// routed -- `routing.ts` still sends every one of these to Python; the front
// door is plateau 7.
//
// The write verbs (`sync`, `install`, `uninstall`, `expose-claude`,
// `clean-claude`) are plateau 4. Their REFUSALS live here already, because
// they are produced by this parser before any write is attempted, and a
// validated write argv raises `UnsupportedCatalogCommandError` rather than
// pretending: an unimplemented path must fail loudly, not silently print
// nothing.

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
    throw new UnsupportedCatalogCommandError("extensions install is CV22.DS7.TS4 plateau 4");
  }
  if (command === "uninstall") {
    if (options.positional.length !== 2) {
      return usage(
        "Usage: python -m memory extensions uninstall <id> [--mirror-home PATH] [--runtime NAME]",
      );
    }
    throw new UnsupportedCatalogCommandError("extensions uninstall is CV22.DS7.TS4 plateau 4");
  }
  if (command === "expose-claude" || command === "clean-claude") {
    if (options.targetRoot === null) return usage(`${command} requires --target-root PATH`);
    throw new UnsupportedCatalogCommandError(`extensions ${command} is CV22.DS7.TS4 plateau 4`);
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
  throw new UnsupportedCatalogCommandError("extensions sync is CV22.DS7.TS4 plateau 4");
}

/** Port of `ext._cmd_list`, `_print_top_help`, and their exit codes. */
export function runExtCommand(context: CatalogContext, argv: readonly string[]): RenderedCommand {
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
  throw new UnsupportedCatalogCommandError("ext dispatch is CV22.DS7.TS4 plateau 5");
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
