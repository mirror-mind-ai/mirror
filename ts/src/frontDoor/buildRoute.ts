// CV22.DS7.US8 plateau 8 — production front-door route for `build`.
//
// Routing owns the two-level allowlist. This module owns argparse-class
// validation, the writable database boundary, and the lazy import of the Builder
// tree. No Builder module is imported at module evaluation time, so a broken
// Builder core breaks `build` and nothing else. Type-only imports are erased and
// do not cross it.

import type { CommandResult } from "#builder/commands.ts";
import type { Database, WritableDatabase } from "#db/database.ts";
import type { BuildLoadRuntime } from "#frontDoor/buildLoadRuntime.ts";
import { COMMAND_SPECS, LOAD_SPEC } from "./buildArgSpecs.ts";

export interface BuildRouteDeps {
  readonly withReadOnlyDatabase: (run: (db: Database) => number) => number;
  readonly withWritableDatabase: (
    run: (db: WritableDatabase, dbPath: string) => Promise<number> | number,
  ) => Promise<number>;
  readonly createLoadRuntime: (
    db: WritableDatabase,
    dbPath: string,
    ignoreProductionRole: boolean,
  ) => Promise<BuildLoadRuntime>;
  readonly nowIso: () => string;
  readonly environmentSessionId?: string | null;
}

export interface BuildRouteResult {
  readonly exitCode: number;
  /** Content-free front-door metadata. */
  readonly detail: string;
}

function usageError(message: string): CommandResult {
  return { stdout: "", stderr: `Mirror TS build: ${message}\n`, exitCode: 2 };
}

export interface ParsedBuilderArgv {
  /**
   * The invocation in canonical `--option value` form: the subcommand, then
   * positionals, then every option pair and flag in the order given. The
   * Builder command mapping reads only this shape.
   */
  readonly argv: readonly string[];
}

/**
 * Validate the input class argparse owns, with honest TS prose, and produce the
 * canonical argv the command mapping reads.
 *
 * Python is the contract for what is ACCEPTED, not only for what is refused:
 * argparse takes `--option=value` for any option, and any unambiguous prefix of
 * a long option (`allow_abbrev` is on), so `--meth=ariad --jour=demo` is a valid
 * Python invocation and must be a valid TypeScript one. An ambiguous prefix and
 * an inline value on a flag are argparse's own refusals, reproduced at exit 2.
 */
export function parseBuilderArgv(argv: readonly string[]): ParsedBuilderArgv | CommandResult {
  const command = argv[0] ?? "";
  const spec = command === "load" ? LOAD_SPEC : COMMAND_SPECS[command];
  if (!spec) return usageError(`unknown subcommand ${command || "(none)"}`);

  const values = new Set(spec.values ?? []);
  const flags = new Set(spec.flags ?? []);
  const known = [...values, ...flags];
  const seen = new Map<string, string>();
  const positionals: string[] = [];
  const options: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const separator = token.indexOf("=");
    const spelled = separator === -1 ? token : token.slice(0, separator);
    const inline = separator === -1 ? null : token.slice(separator + 1);
    let option = spelled;
    if (!values.has(spelled) && !flags.has(spelled)) {
      const candidates = known.filter((name) => name.startsWith(spelled));
      if (candidates.length > 1) {
        return usageError(
          `${command}: ambiguous option ${spelled} could match ${candidates.join(", ")}`,
        );
      }
      if (candidates.length === 0)
        return usageError(`${command}: unrecognized argument ${spelled}`);
      option = candidates[0] ?? spelled;
    }
    if (flags.has(option)) {
      if (inline !== null) return usageError(`${command}: ${option} takes no value`);
      options.push(option);
      continue;
    }
    let value = inline;
    if (value === null) {
      const next = argv[index + 1];
      // A separate token that looks like an option is an option, as argparse
      // reads it; only the `=` form can carry such a value.
      if (next === undefined || next.startsWith("--")) {
        return usageError(`${command}: ${option} requires a value`);
      }
      value = next;
      index += 1;
    }
    seen.set(option, value);
    options.push(option, value);
  }

  if (positionals.length > (spec.positionals ?? 0)) {
    return usageError(`${command}: too many positional arguments`);
  }
  if (command === "load" && positionals.length === 0) {
    return usageError("load requires a journey slug");
  }
  for (const required of spec.required ?? []) {
    if (!seen.has(required))
      return usageError(`${command}: the following argument is required: ${required}`);
  }
  for (const [option, choices] of Object.entries(spec.choices ?? {})) {
    const value = seen.get(option);
    if (value !== undefined && !choices.includes(value)) {
      return usageError(`${command}: invalid value for ${option}: ${value}`);
    }
  }
  return { argv: [command, ...positionals, ...options] };
}

function writeResult(result: CommandResult): number {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.exitCode;
}

function positional(argv: readonly string[], values: readonly string[]): string | null {
  const valueOptions = new Set(values);
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (valueOptions.has(token)) {
      index += 1;
      continue;
    }
    if (!token.startsWith("--")) return token;
  }
  return null;
}

export async function runBuildRoute(
  argv: readonly string[],
  deps: BuildRouteDeps,
): Promise<BuildRouteResult> {
  const command = argv[1] ?? "";
  const parsed = parseBuilderArgv(argv.slice(1));
  if (!("argv" in parsed)) {
    return { exitCode: writeResult(parsed), detail: `leaf=${command || "(none)"}` };
  }
  const builderArgv = parsed.argv;

  // This is the resilience boundary. A reverted invocation never imports this
  // route; an enabled invocation imports the Builder core only now.
  const builder = await import("#builder/index.ts");
  if (builder.READ_ONLY_BUILDER_SUBCOMMANDS.has(command)) {
    const exitCode = deps.withReadOnlyDatabase((db) =>
      writeResult(
        builder.invokeReadOnlyBuilderArgv(db, builderArgv, deps.environmentSessionId ?? null),
      ),
    );
    return { exitCode, detail: `leaf=${command}` };
  }

  let detail = `leaf=${command}`;
  const exitCode = await deps.withWritableDatabase(async (db, dbPath) => {
    if (command === "load") {
      const runtime = await deps.createLoadRuntime(
        db,
        dbPath,
        builderArgv.includes("--ignore-production-role"),
      );
      const slug = positional(builderArgv, LOAD_SPEC.values ?? []);
      if (slug === null) throw new Error("validated build load lost its journey slug");
      // Keep the provider-backed leaf outside the deterministic command-tree
      // import closure; providerIsolation.test.ts grades that reachability.
      const { runBuildLoad } = await import("#builder/load.ts");
      const result = await runBuildLoad(
        db,
        {
          slug,
          sessionId: optionValue(builderArgv, "--session-id"),
          environmentSessionId: deps.environmentSessionId ?? null,
        },
        runtime.deps,
      );
      detail = `leaf=load calls=${result.providerCalls}${
        result.degradedKind ? ` kind=${result.degradedKind}` : ""
      }`;
      return writeResult(result);
    }

    const result = builder.invokeBuilderArgv(db, builderArgv, {
      nowIso: deps.nowIso,
      environmentSessionId: deps.environmentSessionId ?? null,
    });
    return writeResult(result);
  });
  return { exitCode, detail };
}

function optionValue(argv: readonly string[], name: string): string | null {
  const index = argv.lastIndexOf(name);
  return index === -1 ? null : (argv[index + 1] ?? null);
}
