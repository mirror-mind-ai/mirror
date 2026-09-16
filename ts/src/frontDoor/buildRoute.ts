// CV22.DS7.US8 plateau 8 — production front-door route for `build`.
//
// Routing owns the two-level allowlist and keeps the gate off until plateau 9.
// This module owns argparse-class validation, the writable database boundary,
// and the lazy import of the Builder tree. No Builder module is imported at
// module evaluation time: MIRROR_TS_BUILD=0 must still reach Python when the
// Builder core is broken. Type-only imports are erased and do not cross it.

import type { CommandResult } from "#builder/commands.ts";
import type { Database, WritableDatabase } from "#db/database.ts";
import type { BuildLoadRuntime } from "#frontDoor/buildLoadRuntime.ts";

export interface BuildRouteDeps {
  readonly withReadOnlyDatabase: (run: (db: Database) => number) => number;
  readonly withWritableDatabase: (
    run: (db: WritableDatabase, dbPath: string) => Promise<number> | number,
  ) => Promise<number>;
  readonly createLoadRuntime: (
    db: WritableDatabase,
    dbPath: string,
    ignoreProductionRole: boolean,
  ) => Promise<BuildLoadRuntime | null>;
  readonly nowIso: () => string;
  readonly environmentSessionId?: string | null;
  readonly requestProjectionRefresh: (journey: string, dbPath: string) => void;
}

export interface BuildRouteResult {
  readonly exitCode: number;
  /** Content-free front-door metadata. */
  readonly detail: string;
}

interface CommandSpec {
  readonly values?: readonly string[];
  readonly flags?: readonly string[];
  readonly required?: readonly string[];
  readonly choices?: Readonly<Record<string, readonly string[]>>;
  readonly positionals?: number;
}

const COMMON = ["--method", "--journey", "--session-id"] as const;
const COMMON_REQUIRED = ["--method"] as const;

const COMMAND_SPECS: Readonly<Record<string, CommandSpec>> = {
  "inspect-method": {
    values: ["--journey", "--session-id", "--mirror-home", "--db-path"],
    positionals: 1,
  },
  adopt: { values: [...COMMON, "--mirror-home", "--db-path"], required: COMMON_REQUIRED },
  "prepare-templates": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
  },
  "sync-cursor": { values: [...COMMON, "--mirror-home", "--db-path"], required: COMMON_REQUIRED },
  "pull-candidates": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
  },
  "check-implementation": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
  },
  "pull-item": {
    values: [
      ...COMMON,
      "--item-code",
      "--item-title",
      "--item-level",
      "--why-now",
      "--mirror-home",
      "--db-path",
    ],
    required: ["--method", "--item-code", "--item-title", "--item-level", "--why-now"],
  },
  "prepare-item": { values: [...COMMON, "--mirror-home", "--db-path"], required: COMMON_REQUIRED },
  "plan-item": {
    values: [...COMMON, "--objective", "--stop-after", "--mirror-home", "--db-path"],
    flags: ["--preauthorize-approval"],
    required: COMMON_REQUIRED,
    choices: { "--stop-after": ["navigator_validation"] },
  },
  "approve-plan": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    flags: ["--use-preauthorization"],
    required: COMMON_REQUIRED,
  },
  "cancel-plan-preauthorization": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
  },
  "validate-item": {
    values: [
      ...COMMON,
      "--check",
      "--checks-status",
      "--e2e-decision",
      "--e2e-evidence",
      "--navigator-route",
      "--expected-observation",
      "--pass-condition",
      "--fail-condition",
      "--mirror-home",
      "--db-path",
    ],
    flags: ["--navigator-accepted", "--implementation-complete"],
    required: COMMON_REQUIRED,
    choices: {
      "--checks-status": ["passed", "failed", "not_run"],
      "--e2e-decision": ["required", "not_required", "waived", "skipped"],
    },
  },
  "review-item": {
    values: [
      ...COMMON,
      "--debt",
      "--decision",
      "--defer-reason",
      "--revisit-trigger",
      "--mirror-home",
      "--db-path",
    ],
    required: COMMON_REQUIRED,
    choices: { "--decision": ["pending", "no_action", "defer", "pay_now"] },
  },
  "coherence-item": {
    values: [
      ...COMMON,
      "--process",
      "--project",
      "--product",
      "--local-difference",
      "--mirror-home",
      "--db-path",
    ],
    required: COMMON_REQUIRED,
  },
  "done-item": {
    values: [
      ...COMMON,
      "--history-action",
      "--roadmap-update",
      "--next-recommendation",
      "--mirror-home",
      "--db-path",
    ],
    required: COMMON_REQUIRED,
  },
  "set-flow-unit": {
    values: [...COMMON, "--unit", "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
    choices: { "--unit": ["story_by_story", "delivery_story"] },
  },
  "plan-delivery-story": {
    values: [...COMMON, "--objective", "--child", "--stop-after", "--mirror-home", "--db-path"],
    flags: ["--preauthorize-approval"],
    required: ["--method", "--objective"],
    choices: { "--stop-after": ["navigator_validation"] },
  },
  "approve-delivery-story-plan": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    flags: ["--use-preauthorization"],
    required: COMMON_REQUIRED,
  },
  "cancel-delivery-story-plan-preauthorization": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
  },
  "validate-delivery-story": {
    values: [...COMMON, "--summary", "--mirror-home", "--db-path"],
    flags: ["--navigator-accepted"],
    required: ["--method", "--summary"],
  },
  "review-delivery-story": {
    values: [...COMMON, "--decision", "--summary", "--mirror-home", "--db-path"],
    required: ["--method", "--decision", "--summary"],
    choices: { "--decision": ["no_action", "defer", "pay_now"] },
  },
  "coherence-delivery-story": {
    values: [...COMMON, "--summary", "--mirror-home", "--db-path"],
    required: ["--method", "--summary"],
  },
  "done-delivery-story": {
    values: [...COMMON, "--summary", "--mirror-home", "--db-path"],
    required: ["--method", "--summary"],
  },
  "set-cadence": {
    values: [...COMMON, "--profile", "--limit", "--mirror-home", "--db-path"],
    required: ["--method", "--profile"],
  },
  "release-intent": {
    values: [...COMMON, "--intent", "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
    choices: { "--intent": ["planned", "none", "undecided"] },
  },
  "continue-lifecycle": {
    values: [
      ...COMMON,
      "--process",
      "--project",
      "--product",
      "--local-difference",
      "--history-action",
      "--roadmap-update",
      "--next-recommendation",
      "--mirror-home",
      "--db-path",
    ],
    required: COMMON_REQUIRED,
  },
};

const LOAD_SPEC: CommandSpec = {
  values: ["--session-id", "--mirror-home", "--db-path"],
  flags: ["--ignore-production-role"],
  positionals: 1,
};

function usageError(message: string): CommandResult {
  return { stdout: "", stderr: `Mirror TS build: ${message}\n`, exitCode: 2 };
}

/** Validate the same input class argparse owns, while using honest TS prose. */
export function validateBuilderArgv(argv: readonly string[]): CommandResult | null {
  const command = argv[0] ?? "";
  const spec = command === "load" ? LOAD_SPEC : COMMAND_SPECS[command];
  if (!spec) return usageError(`unknown subcommand ${command || "(none)"}`);

  const values = new Set(spec.values ?? []);
  const flags = new Set(spec.flags ?? []);
  const seen = new Map<string, string>();
  let positionalCount = 0;
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (!token.startsWith("--")) {
      positionalCount += 1;
      continue;
    }
    if (flags.has(token)) continue;
    if (!values.has(token)) return usageError(`${command}: unrecognized argument ${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return usageError(`${command}: ${token} requires a value`);
    }
    seen.set(token, value);
    index += 1;
  }

  if (positionalCount > (spec.positionals ?? 0)) {
    return usageError(`${command}: too many positional arguments`);
  }
  if (command === "load" && positionalCount === 0) {
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
  return null;
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
  const builderArgv = argv.slice(1);
  const command = builderArgv[0] ?? "";
  const invalid = validateBuilderArgv(builderArgv);
  if (invalid) return { exitCode: writeResult(invalid), detail: `leaf=${command || "(none)"}` };

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
      if (runtime === null) throw new Error("build load route disagreed with its routing decision");
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
      requestProjectionRefresh: (journey) => deps.requestProjectionRefresh(journey, dbPath),
    });
    return writeResult(result);
  });
  return { exitCode, detail };
}

function optionValue(argv: readonly string[], name: string): string | null {
  const index = argv.lastIndexOf(name);
  return index === -1 ? null : (argv[index + 1] ?? null);
}
