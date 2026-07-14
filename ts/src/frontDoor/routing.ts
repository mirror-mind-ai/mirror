export type FrontDoorEngine = "ts" | "python";

export interface RouteDecision {
  command: string | null;
  engine: FrontDoorEngine;
  reason: string;
}

const TS_READ_COMMANDS = new Set(["detect-persona", "journeys"]);

export function routeMemoryCommand(argv: readonly string[]): RouteDecision {
  const command = argv[0] ?? null;
  if (!command) return { command, engine: "python", reason: "no command" };

  if (TS_READ_COMMANDS.has(command)) {
    return { command, engine: "ts", reason: "DS2 read command ported to TS" };
  }

  if (command === "memories") {
    if (argv.includes("--search")) {
      return {
        command,
        engine: "python",
        reason: "fresh semantic search remains Python until CV22.DS5",
      };
    }
    return { command, engine: "ts", reason: "DS2 memory listing read ported to TS" };
  }

  if (command === "identity") {
    // Only the non-interactive deterministic write `identity set` is ported.
    // `identity edit` spawns $EDITOR and identity reads stay on Python for now.
    if (argv[1] === "set") {
      return { command, engine: "ts", reason: "DS4 identity set write ported to TS" };
    }
    return { command, engine: "python", reason: "identity edit/read not ported to TS" };
  }

  return { command, engine: "python", reason: "command not ported to TS" };
}
