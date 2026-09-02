export type FrontDoorEngine = "ts" | "python";

export interface RouteDecision {
  command: string | null;
  engine: FrontDoorEngine;
  reason: string;
}

const TS_READ_COMMANDS = new Set(["detect-persona", "journeys"]);

// The Conversation Metadata Lifecycle (ES-001) preview/apply flags on
// `conversations` are stateful writes, a separate slice from DS7.US1's plain
// listing port -- any of them forces the Python fallback.
const CONVERSATIONS_LIFECYCLE_FLAGS = [
  "--metadata-lifecycle-dry-run",
  "--metadata-lifecycle-apply",
  "--metadata-lifecycle-demo",
  "--metadata-lifecycle-preview-at-message",
  "--metadata-backfill-preview",
  "--metadata-backfill-apply",
];

export interface RouteEnvironment {
  MIRROR_TS_EXTERNAL_ROUTES?: string;
  MIRROR_TS_SEARCH_EMBEDDING_REPLAY?: string;
  MIRROR_TS_CONSULT_LLM_REPLAY?: string;
  MIRROR_TS_CREDITS_REPLAY?: string;
  MIRROR_TS_CULTIVATION_LLM_REPLAY?: string;
  MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY?: string;
  MIRROR_TS_MIRROR_LLM_REPLAY?: string;
  MIRROR_TS_MIRROR_EMBEDDING_REPLAY?: string;
  MIRROR_TS_CONVERSATION_LOGGER?: string;
  MEMORY_RECEPTION?: string;
}

// CV22.DS7.US5 slice A. Only these `conversation-logger` subcommands are
// deterministic end to end; the rest reach Python's `end_conversation`, which
// runs extraction and close-time metadata finalization through the LLM.
const TS_CONVERSATION_LOGGER_SUBCOMMANDS = new Set([
  "mute",
  "unmute",
  "status",
  "log-user",
  "log-assistant",
  "user-prompt",
  "discard-current",
]);

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
    // `set` (DS4) and `list`/`get` (DS7.US1) are ported. `identity edit` spawns
    // $EDITOR — an interactive seam that stays on Python by design, not oversight.
    if (argv[1] === "set") {
      return { command, engine: "ts", reason: "DS4 identity set write ported to TS" };
    }
    if (argv[1] === "list" || argv[1] === "get") {
      return { command, engine: "ts", reason: "DS7.US1 identity list/get read ported to TS" };
    }
    return {
      command,
      engine: "python",
      reason: "identity edit (interactive $EDITOR) not ported to TS",
    };
  }

  if (command === "init") {
    return {
      command,
      engine: "ts",
      reason: "DS7.US1 Slice B init (filesystem bootstrap) ported to TS",
    };
  }

  if (command === "seed") {
    return { command, engine: "ts", reason: "DS7.US1 Slice B seed write ported to TS" };
  }

  if (command === "recall") {
    return { command, engine: "ts", reason: "DS7.US1 recall read ported to TS" };
  }

  if (command === "conversations") {
    // Only the plain listing (ConversationService.list_recent) is ported.
    if (CONVERSATIONS_LIFECYCLE_FLAGS.some((flag) => argv.includes(flag))) {
      return {
        command,
        engine: "python",
        reason: "conversations metadata-lifecycle/backfill writes not ported to TS",
      };
    }
    return { command, engine: "ts", reason: "DS7.US1 conversations listing read ported to TS" };
  }

  if (command === "inspect") {
    // `persona` (DS7.US1) is a deterministic identity read. `extension` and
    // `runtime-catalog` share the extension-catalog machinery (like `list
    // extensions`), and `llm-calls`/`embedding-provenance` are ops-tail
    // introspection -- all bound to CV22.DS7.TS1, not this story.
    if (argv[1] === "persona") {
      return { command, engine: "ts", reason: "DS7.US1 inspect persona read ported to TS" };
    }
    return {
      command,
      engine: "python",
      reason: "inspect extension/runtime-catalog/llm-calls/embedding-provenance not ported to TS",
    };
  }

  if (command === "list") {
    // `personas`/`journeys` (DS7.US1) are deterministic identity reads.
    // `extensions`/`all` (and no target => "all") touch the extension catalog
    // and stay on Python, bound to CV22.DS7.TS1.
    if (argv[1] === "personas") {
      return { command, engine: "ts", reason: "DS7.US1 list personas read ported to TS" };
    }
    if (argv[1] === "journeys") {
      return { command, engine: "ts", reason: "DS7.US1 list journeys read ported to TS" };
    }
    return {
      command,
      engine: "python",
      reason: "list extensions/all (extension catalog) not ported to TS",
    };
  }

  if (command === "descriptor") {
    // `list` (DS7.US1) is a deterministic read; `generate` calls the LLM
    // (generate_descriptor) and stays on Python as the DS7↔DS8 live seam.
    if (argv[1] === "list") {
      return { command, engine: "ts", reason: "DS7.US1 descriptor list read ported to TS" };
    }
    return { command, engine: "python", reason: "descriptor generate (LLM) not ported to TS" };
  }

  if (command === "tasks") {
    // `list` (and the bare `tasks` default, incl. a leading flag with no
    // subcommand token) is a read; `add/done/doing/block/delete` are the
    // deterministic writes ported in DS7.US2 slice 3a; `import/sync/
    // sync-config` (which also touch the journey sync-file/project-path
    // metadata subsystem) are ported in slice 3c.
    const sub = argv[1]?.startsWith("--") ? undefined : argv[1];
    if (sub === undefined || sub === "list") {
      return { command, engine: "ts", reason: "DS7.US2 tasks list read ported to TS" };
    }
    if (
      sub === "add" ||
      sub === "done" ||
      sub === "doing" ||
      sub === "block" ||
      sub === "delete" ||
      sub === "import" ||
      sub === "sync" ||
      sub === "sync-config"
    ) {
      return { command, engine: "ts", reason: "DS7.US2 tasks write ported to TS" };
    }
    return { command, engine: "python", reason: "command not ported to TS" };
  }

  if (command === "week") {
    // `view` (and the bare `week` default) is a deterministic read ported
    // here. `plan`/`save` are LLM/embedding-gated and reassigned to US5 (see
    // the plan's scope correction) -- they stay on Python fallback, not as an
    // oversight but as a permanent seam boundary.
    const sub = argv[1];
    if (sub === undefined || sub === "view") {
      return { command, engine: "ts", reason: "DS7.US2 week view read ported to TS" };
    }
    return {
      command,
      engine: "python",
      reason: "week plan/save are LLM-gated and reassigned to US5, not ported here",
    };
  }

  if (command === "consolidate") {
    // `list`/`reject` are deterministic reads/writes -- always TS (DS7.US3).
    // `apply` is gated as a WHOLE on the embedding replay config: its action
    // is read from the DB, not argv, so the routing decision (made before any
    // DB is opened) cannot special-case identity_update/shadow_candidate --
    // the entire command routes together, same principle as `scan`.
    const sub = argv[1];
    if (sub === "list" || sub === "reject") {
      return { command, engine: "ts", reason: "DS7.US3 consolidate list/reject ported to TS" };
    }
    if (sub === "apply") {
      if (externalRoutesEnabled(env) && env.MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY) {
        return {
          command,
          engine: "ts",
          reason:
            "DS7.US3 consolidate apply routed to TS under replay-safe config (merge needs embedding)",
        };
      }
      return {
        command,
        engine: "python",
        reason: "consolidate apply needs DS7.US3 replay/live config for TS route (merge embedding)",
      };
    }
    if (sub === "scan") {
      if (externalRoutesEnabled(env) && env.MIRROR_TS_CULTIVATION_LLM_REPLAY) {
        return {
          command,
          engine: "ts",
          reason: "DS7.US3 consolidate scan routed to TS under replay-safe config",
        };
      }
      return {
        command,
        engine: "python",
        reason: "consolidate scan needs DS7.US3 replay/live config for TS route",
      };
    }
    return { command, engine: "python", reason: "command not ported to TS" };
  }

  if (command === "shadow") {
    // `list`/`show`/`reject`/`apply` are all deterministic -- `apply`'s write
    // is a hardcoded-layer identity append, no LLM/embedding call, unlike
    // consolidate's `apply` (which may need to embed a merge).
    const sub = argv[1];
    if (sub === "list" || sub === "show" || sub === "reject" || sub === "apply") {
      return {
        command,
        engine: "ts",
        reason: "DS7.US3 shadow list/show/reject/apply ported to TS",
      };
    }
    if (sub === "scan") {
      if (externalRoutesEnabled(env) && env.MIRROR_TS_CULTIVATION_LLM_REPLAY) {
        return {
          command,
          engine: "ts",
          reason: "DS7.US3 shadow scan routed to TS under replay-safe config",
        };
      }
      return {
        command,
        engine: "python",
        reason: "shadow scan needs DS7.US3 replay/live config for TS route",
      };
    }
    return { command, engine: "python", reason: "command not ported to TS" };
  }

  if (command === "mirror") {
    const sub = argv[1];
    if (sub === "load") {
      const hasQuery = argv.includes("--query");
      if (!hasQuery) {
        return { command, engine: "ts", reason: "DS7.US4 deterministic mirror load ported to TS" };
      }
      if (!externalRoutesEnabled(env) || !env.MIRROR_TS_MIRROR_EMBEDDING_REPLAY) {
        return {
          command,
          engine: "python",
          reason: "mirror load query needs DS7.US4 replay embedding config for TS route",
        };
      }
      if (env.MEMORY_RECEPTION !== "0" && !env.MIRROR_TS_MIRROR_LLM_REPLAY) {
        return {
          command,
          engine: "python",
          reason: "mirror load reception needs DS7.US4 replay LLM config for TS route",
        };
      }
      return {
        command,
        engine: "ts",
        reason: "DS7.US4 mirror load routed to TS under replay-safe config",
      };
    }
    if (sub === "deactivate" || sub === "log" || sub === "journeys") {
      return { command, engine: "ts", reason: `DS7.US4 mirror ${sub} ported to TS` };
    }
    return { command, engine: "python", reason: "mirror subcommand not ported to TS" };
  }

  if (command === "conversation-logger") {
    // CV22.DS7.US5 slice A: flipped 2026-09-02 after the seven-point checklist
    // went green (goldens, real-DB-copy write parity, hook-inclusive E2E,
    // regression pass, redaction, revertibility, ledger).
    //
    // This is the product's highest-volume write path, so the gate was
    // inverted rather than deleted: `MIRROR_TS_CONVERSATION_LOGGER=0` forces
    // the whole family back to Python with no code change and no data
    // migration, which is the revertibility the DS7 plan review requires.
    if (env.MIRROR_TS_CONVERSATION_LOGGER === "0") {
      return {
        command,
        engine: "python",
        reason: "conversation-logger TS route disabled by MIRROR_TS_CONVERSATION_LOGGER=0",
      };
    }
    const sub = argv[1];
    if (sub && TS_CONVERSATION_LOGGER_SUBCOMMANDS.has(sub)) {
      return {
        command,
        engine: "ts",
        reason: `DS7.US5 conversation-logger ${sub} ported to TS`,
      };
    }
    return {
      command,
      engine: "python",
      reason: "conversation-logger subcommand crosses the LLM close tail or is unported",
    };
  }

  if (command === "mode") {
    const sub = argv.find(
      (value, index) => index > 0 && ["activate", "deactivate", "status"].includes(value),
    );
    return sub
      ? { command, engine: "ts", reason: "DS7.US4 operating mode lifecycle ported to TS" }
      : { command, engine: "python", reason: "mode subcommand not ported to TS" };
  }

  if (command === "journey") {
    // `set-path` (DS4), `update` (DS7.US1 Slice B), and the status read
    // (DS7.US1 Slice A) are all ported. Everything besides `set-path`/
    // `update` -- `status [slug]`, a bare slug, or no argument at all -- is a
    // status read in the real Python dispatch (see render/journeyStatus.ts's
    // slug-resolution quirk), so it all routes to the same TS status handler.
    if (argv[1] === "set-path") {
      return { command, engine: "ts", reason: "DS4 journey set-path write ported to TS" };
    }
    if (argv[1] === "update") {
      return { command, engine: "ts", reason: "DS7.US1 Slice B journey update write ported to TS" };
    }
    return { command, engine: "ts", reason: "DS7.US1 journey status read ported to TS" };
  }

  return { command, engine: "python", reason: "command not ported to TS" };
}
