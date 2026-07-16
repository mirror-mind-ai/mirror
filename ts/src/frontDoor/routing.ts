export type FrontDoorEngine = "ts" | "python";

export interface RouteDecision {
  command: string | null;
  engine: FrontDoorEngine;
  reason: string;
}

const TS_READ_COMMANDS = new Set(["detect-persona", "journeys"]);

export interface RouteEnvironment {
  MIRROR_TS_EXTERNAL_ROUTES?: string;
  MIRROR_TS_SEARCH_EMBEDDING_REPLAY?: string;
  MIRROR_TS_CONSULT_LLM_REPLAY?: string;
  MIRROR_TS_CREDITS_REPLAY?: string;
}

function externalRoutesEnabled(env: RouteEnvironment): boolean {
  return env.MIRROR_TS_EXTERNAL_ROUTES === "1";
}

export function routeMemoryCommand(
  argv: readonly string[],
  env: RouteEnvironment = process.env,
): RouteDecision {
  const command = argv[0] ?? null;
  if (!command) return { command, engine: "python", reason: "no command" };

  if (TS_READ_COMMANDS.has(command)) {
    return { command, engine: "ts", reason: "DS2 read command ported to TS" };
  }

  if (command === "memories") {
    if (argv.includes("--search")) {
      if (externalRoutesEnabled(env) && env.MIRROR_TS_SEARCH_EMBEDDING_REPLAY) {
        return {
          command,
          engine: "ts",
          reason: "DS5 fresh semantic search routed to TS under replay-safe config",
        };
      }
      return {
        command,
        engine: "python",
        reason: "fresh semantic search needs DS5 replay/live config for TS route",
      };
    }
    return { command, engine: "ts", reason: "DS2 memory listing read ported to TS" };
  }

  if (command === "consult") {
    if (!externalRoutesEnabled(env)) {
      return {
        command,
        engine: "python",
        reason: "consult TS route requires DS5 external route gate",
      };
    }
    if (argv[1] === "credits" && env.MIRROR_TS_CREDITS_REPLAY) {
      return {
        command,
        engine: "ts",
        reason: "DS5 consult credits routed to TS under replay-safe config",
      };
    }
    if (env.MIRROR_TS_CONSULT_LLM_REPLAY && env.MIRROR_TS_CREDITS_REPLAY) {
      return {
        command,
        engine: "ts",
        reason: "DS5 consult ask routed to TS under replay-safe config",
      };
    }
    return {
      command,
      engine: "python",
      reason: "consult needs DS5 replay/live config for TS route",
    };
  }

  if (command === "identity") {
    // Only the non-interactive deterministic write `identity set` is ported.
    // `identity edit` spawns $EDITOR and identity reads stay on Python for now.
    if (argv[1] === "set") {
      return { command, engine: "ts", reason: "DS4 identity set write ported to TS" };
    }
    return { command, engine: "python", reason: "identity edit/read not ported to TS" };
  }

  if (command === "journey") {
    // Only `journey set-path` is ported; `update`/`status`/reads stay on Python.
    if (argv[1] === "set-path") {
      return { command, engine: "ts", reason: "DS4 journey set-path write ported to TS" };
    }
    return { command, engine: "python", reason: "journey update/status/read not ported to TS" };
  }

  return { command, engine: "python", reason: "command not ported to TS" };
}
