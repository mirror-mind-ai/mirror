import { DS10_RUNTIME_SUBCOMMANDS, TS_RUNTIME_READ_SUBCOMMANDS } from "./runtimeRoute.ts";

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
  MIRROR_TS_CONVERSATION_APPEND?: string;
  MIRROR_TS_CONVERSATION_LLM_REPLAY?: string;
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY?: string;
  MIRROR_TS_BACKUP?: string;
  MIRROR_TS_REPAIR_ENCODING?: string;
  MIRROR_TS_WELCOME?: string;
  MIRROR_TS_RUNTIME_READS?: string;
  MIRROR_TS_SOUL?: string;
  MIRROR_TS_SOUL_EMBEDDING_REPLAY?: string;
  MIRROR_TS_EXPLORE?: string;
  MIRROR_TS_WEEK?: string;
  MIRROR_TS_JOURNAL?: string;
  MIRROR_TS_JOURNAL_LLM_REPLAY?: string;
  MIRROR_TS_JOURNAL_EMBEDDING_REPLAY?: string;
  MIRROR_TS_WEEK_LLM_REPLAY?: string;
  MEMORY_RECEPTION?: string;
}

// CV22.DS7.TS1: the DB safety tools carry independent per-command gates.
// Flipped 2026-09-07 after the seven-point checklist went green (goldens,
// real-DB-copy probe, both-engine smoke with Python's zipfile reading the TS
// archive, regression pass, redaction, revertibility, ledger). They default
// ON; `=0` is the revert control with no code change and no data migration.
// `MIRROR_TS_BACKUP` also governs `conversation-logger repair-journeys
// --apply`, whose only TS dependency is the dated zip backup: reverting the
// backup must revert the repair with it.
const DB_SAFETY_TOOLS_DEFAULT_ON = true;

function gateEnabled(value: string | undefined): boolean {
  if (value === "0") return false;
  if (value === "1") return true;
  return DB_SAFETY_TOOLS_DEFAULT_ON;
}

function backupRouteEnabled(env: RouteEnvironment): boolean {
  return gateEnabled(env.MIRROR_TS_BACKUP);
}

function repairEncodingRouteEnabled(env: RouteEnvironment): boolean {
  return gateEnabled(env.MIRROR_TS_REPAIR_ENCODING);
}

// CV22.DS7.TS3: the daily-visible tail carries two independent gates. Flipped
// 2026-09-08 after the checklist went green (five goldens, the stats/status
// real-DB-copy probes, the both-engine smoke, the spawn spy, redaction,
// revertibility, ledger). They default ON; `=0` is the revert control with no
// code change and no data migration.
//
// `welcome` and the read-only `runtime` subcommands stay SEPARATELY revertible
// because they fail differently: a bad `welcome` is wrong on every turn and
// must be revertible without touching diagnostics, while a bad `runtime
// diagnose` is wrong only when asked.
const DAILY_VISIBLE_TAIL_DEFAULT_ON = true;

function tailGateEnabled(value: string | undefined): boolean {
  if (value === "0") return false;
  if (value === "1") return true;
  return DAILY_VISIBLE_TAIL_DEFAULT_ON;
}

// CV22.DS7.US5 slice A, extended by CV22.DS7.US10 slice F. These
// `conversation-logger` subcommands are deterministic end to end and route to
// TS under the family switch alone.
const TS_CONVERSATION_LOGGER_SUBCOMMANDS = new Set([
  "mute",
  "unmute",
  "status",
  "log-user",
  "log-assistant",
  "user-prompt",
  "discard-current",
  // US10 slice F, group 2 (need slice E): diagnose, dry-run repair, Codex import.
  "diagnose-journeys",
  "repair-journeys",
  "backfill-codex-session",
]);

// CV22.DS7.US10 slice F. These reach Python's `end_conversation`, which runs
// extraction and close-time metadata finalization through the LLM. They route
// to TS only under the replay transport; an unconfigured install keeps the
// Python fallback, which is the live-cutover boundary DS8 owns. Flipped in the
// plan's dependency order: `switch`, `session-end-pi`, `session-end` first
// (they need slice C' only), then `session-start` and `session-maintenance`
// (they compose the close tail with slices D and E).
const TS_CONVERSATION_LOGGER_LLM_SUBCOMMANDS = new Set([
  "switch",
  "session-end-pi",
  "session-end",
  "session-start",
  "session-maintenance",
]);

/** Python's `main()`: strip `--mirror-home X` and `--session-id X`, then `args[0]`. */
function conversationLoggerSubcommand(argv: readonly string[]): string | undefined {
  const args = [...argv.slice(1)];
  for (const option of ["--mirror-home", "--session-id"]) {
    const index = args.indexOf(option);
    if (index !== -1) args.splice(index, 2);
  }
  return args[0];
}

function conversationLlmReplayConfigured(env: RouteEnvironment): boolean {
  return (
    externalRoutesEnabled(env) &&
    Boolean(env.MIRROR_TS_CONVERSATION_LLM_REPLAY) &&
    Boolean(env.MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY)
  );
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
    // The plain listing (DS7.US1) and `append` (DS7.US10) are ported; the
    // metadata-lifecycle/backfill writes are not.
    //
    // `append` (v0.31.13) arrived on main after DS7.US1 claimed this command,
    // and the entry matched every argv shape: the append request routed to TS,
    // rendered a listing, exited 0, and silently discarded the caller's
    // messages. Subcommands of a claimed family must be allowlisted, never
    // inherited -- which is why `append` gets its own explicit entry below
    // even now that it points at TS.
    if (argv[1] === "append") {
      // Same inverted-gate convention slice A gave the logger family: TS by
      // default, with `MIRROR_TS_CONVERSATION_APPEND=0` forcing Python with no
      // code change and no data migration. `append` is the published contract
      // for third-party shells, so an operator hitting a defect in production
      // needs a way back that does not require a release.
      if (env.MIRROR_TS_CONVERSATION_APPEND === "0") {
        return {
          command,
          engine: "python",
          reason: "conversations append TS route disabled by MIRROR_TS_CONVERSATION_APPEND=0",
        };
      }
      return {
        command,
        engine: "ts",
        reason: "DS7.US10 conversations append boundary ported to TS",
      };
    }
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
    // `view` (and the bare `week` default) is a deterministic read ported in
    // DS7.US2 and flipped UNGATED there -- `MIRROR_TS_WEEK` deliberately does
    // not cover it, so reverting a bad `plan`/`save` cannot drag `view` back
    // to Python (US11 Plan review, quality-assurance).
    //
    // CR068 corrected this family's accounting: US2 sent `plan` and `save` to
    // US5, US5 was re-scoped without them, and nothing inherited the work --
    // and the refusal reason recorded here claimed BOTH were "LLM-gated",
    // which is false for `save`. `save_week_items` reads the pending file and
    // calls `add_task`, on TS since US2; it crosses no provider seam and flips
    // ungated. Only `plan` calls a model.
    const sub = argv[1];
    if (sub === undefined || sub === "view") {
      return { command, engine: "ts", reason: "DS7.US2 week view read ported to TS" };
    }
    if (sub === "save") {
      if (!weekGateEnabled(env)) {
        return {
          command,
          engine: "python",
          reason: "week save needs MIRROR_TS_WEEK=1 until the DS7.US11 flip",
        };
      }
      return { command, engine: "ts", reason: "DS7.US11 week save (deterministic) ported to TS" };
    }
    if (sub === "plan") {
      // One model call, no embedding -- so it needs the LLM replay fixture
      // only, unlike `journal` which crosses the seam twice.
      if (!weekGateEnabled(env)) {
        return {
          command,
          engine: "python",
          reason: "week plan needs MIRROR_TS_WEEK=1 until the DS7.US11 flip",
        };
      }
      if (!externalRoutesEnabled(env) || !env.MIRROR_TS_WEEK_LLM_REPLAY) {
        return {
          command,
          engine: "python",
          reason: "week plan needs DS7.US11 replay config for TS route",
        };
      }
      return {
        command,
        engine: "ts",
        reason: "DS7.US11 week plan routed to TS under replay-safe config",
      };
    }
    return {
      command,
      engine: "python",
      reason: `week subcommand not ported to TS: ${sub || "(none)"}`,
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
    const sub = conversationLoggerSubcommand(argv);
    if (sub === "repair-journeys" && argv.includes("--apply")) {
      // The mutating repair is gated behind the dated zip backup (Python's
      // `backup()`, ported by DS7.TS1); the front door's fixed-name pre-write
      // snapshot is a weaker safety property, so this route follows the
      // backup gate rather than the family switch alone.
      if (!backupRouteEnabled(env)) {
        return {
          command,
          engine: "python",
          reason: "repair-journeys --apply follows MIRROR_TS_BACKUP=0 back to Python (DS7.TS1)",
        };
      }
      return {
        command,
        engine: "ts",
        reason: "DS7.TS1 conversation-logger repair-journeys --apply ported to TS",
      };
    }
    if (sub && TS_CONVERSATION_LOGGER_SUBCOMMANDS.has(sub)) {
      return {
        command,
        engine: "ts",
        reason: `DS7.US5 conversation-logger ${sub} ported to TS`,
      };
    }
    if (sub === "session-start" && argv.includes("--fast")) {
      // Unmute and reorient only: no close tail, so no gate.
      return {
        command,
        engine: "ts",
        reason: "DS7.US10 conversation-logger session-start --fast ported to TS",
      };
    }
    if (sub && TS_CONVERSATION_LOGGER_LLM_SUBCOMMANDS.has(sub)) {
      if (conversationLlmReplayConfigured(env)) {
        return {
          command,
          engine: "ts",
          reason: `DS7.US10 conversation-logger ${sub} routed to TS under replay-safe config`,
        };
      }
      return {
        command,
        engine: "python",
        reason: `conversation-logger ${sub} needs DS7.US10 replay config for TS route`,
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

  if (command === "backup") {
    if (!backupRouteEnabled(env)) {
      return {
        command,
        engine: "python",
        reason: "backup TS route disabled by MIRROR_TS_BACKUP=0",
      };
    }
    return { command, engine: "ts", reason: "DS7.TS1 backup ported to TS" };
  }

  if (command === "repair-encoding") {
    if (!repairEncodingRouteEnabled(env)) {
      return {
        command,
        engine: "python",
        reason: "repair-encoding TS route disabled by MIRROR_TS_REPAIR_ENCODING=0",
      };
    }
    return { command, engine: "ts", reason: "DS7.TS1 repair-encoding ported to TS" };
  }

  if (command === "welcome") {
    if (!tailGateEnabled(env.MIRROR_TS_WELCOME)) {
      return {
        command,
        engine: "python",
        reason: "welcome TS route disabled by MIRROR_TS_WELCOME=0",
      };
    }
    return { command, engine: "ts", reason: "DS7.TS3 welcome ported to TS" };
  }

  if (command === "runtime") {
    const subcommand = argv[1] ?? "";
    // Allowlist, not blocklist. The updater and release machinery are DS10's,
    // and so is anything Python grows later: a subcommand this build has never
    // heard of must not acquire a TS route because `runtime` already has one.
    if (!TS_RUNTIME_READ_SUBCOMMANDS.has(subcommand)) {
      return {
        command,
        engine: "python",
        reason: DS10_RUNTIME_SUBCOMMANDS.has(subcommand)
          ? `runtime ${subcommand} is the git-based updater/release machinery, redesigned in DS10`
          : `runtime subcommand not ported to TS: ${subcommand || "(none)"}`,
      };
    }
    if (!tailGateEnabled(env.MIRROR_TS_RUNTIME_READS)) {
      return {
        command,
        engine: "python",
        reason: "runtime read TS route disabled by MIRROR_TS_RUNTIME_READS=0",
      };
    }
    return { command, engine: "ts", reason: `DS7.TS3 runtime ${subcommand} ported to TS` };
  }

  if (command === "soul") {
    const subcommand = argv[1] ?? "";
    // Allowlist by NAME, like `runtime`, and for the same reason: a subcommand
    // Python grows later must reach Python rather than inherit this route
    // because the family is claimed. That is the `conversations append` defect
    // (RS009/CR055), which exited 0 and discarded the caller's payload.
    if (!TS_SOUL_SUBCOMMANDS.has(subcommand)) {
      return {
        command,
        engine: "python",
        reason: `soul subcommand not ported to TS: ${subcommand || "(none)"}`,
      };
    }
    if (!soulGateEnabled(env)) {
      return {
        command,
        engine: "python",
        reason: "soul TS route disabled by MIRROR_TS_SOUL=0",
      };
    }
    // `harvest save` is the one leaf that crosses the provider seam, through
    // the embedding alone. Without the replay transport it stays on Python, the
    // same boundary US10's close tail draws; the live call is DS8's.
    if (subcommand === "harvest" && soulHarvestAction(argv) === "save") {
      if (!env.MIRROR_TS_SOUL_EMBEDDING_REPLAY) {
        return {
          command,
          engine: "python",
          reason: "soul harvest save needs the embedding replay transport until DS8",
        };
      }
    }
    return { command, engine: "ts", reason: `DS7.US6 soul ${subcommand} ported to TS` };
  }

  if (command === "explore") {
    const subcommand = argv[1] ?? "";
    // TWO levels, because `explore` is the first family with a nested
    // subparser. A single-level allowlist would claim `explore story
    // <anything>` and answer an argv shape this route has never implemented.
    if (!TS_EXPLORE_SUBCOMMANDS.has(subcommand)) {
      return {
        command,
        engine: "python",
        reason: `explore subcommand not ported to TS: ${subcommand || "(none)"}`,
      };
    }
    if (subcommand === "story") {
      const action = exploreStoryAction(argv);
      if (!TS_EXPLORE_STORY_ACTIONS.has(action ?? "")) {
        return {
          command,
          engine: "python",
          reason: `explore story action not ported to TS: ${action || "(none)"}`,
        };
      }
    }
    if (!exploreGateEnabled(env)) {
      return {
        command,
        engine: "python",
        reason: "explore TS route disabled by MIRROR_TS_EXPLORE=0",
      };
    }
    return { command, engine: "ts", reason: `DS7.US7 explore ${subcommand} ported to TS` };
  }

  if (command === "journal") {
    if (env.MIRROR_TS_JOURNAL === "0") {
      return {
        command,
        engine: "python",
        reason: "journal TS route disabled by MIRROR_TS_JOURNAL=0",
      };
    }
    if (env.MIRROR_TS_JOURNAL !== "1") {
      return {
        command,
        engine: "python",
        reason: "journal needs MIRROR_TS_JOURNAL=1 until the DS7.US11 flip",
      };
    }
    if (!journalReplayConfigured(env)) {
      return {
        command,
        engine: "python",
        reason: "journal needs DS7.US11 replay config (LLM + embedding) for TS route",
      };
    }
    return {
      command,
      engine: "ts",
      reason: "DS7.US11 journal routed to TS under replay-safe config",
    };
  }

  return { command, engine: "python", reason: "command not ported to TS" };
}

// Python's argparse subcommands for `soul`, by name.
const TS_SOUL_SUBCOMMANDS = new Set([
  "load",
  "listen",
  "rite",
  "close",
  "review",
  "propose",
  "apply",
  "fruit",
  "harvest",
  "prompt",
]);

// CV22.DS7.US6: the Soul ritual. Flipped 2026-09-08 after the seven-point
// checklist went green and the Navigator validated the real home -- ten
// surfaces byte-identical across both engines including the refusal paths, the
// identity write proven on two copies of the live database (document and audit
// row identical), and the revert exercised.
//
// ONE gate for the whole family, unlike the daily-visible tail's two: Soul is a
// single ritual, and a half-flipped ritual cannot be reviewed in a live
// session. `MIRROR_TS_SOUL=0` is the revert control, with no code change and no
// data migration.
function soulGateEnabled(env: RouteEnvironment): boolean {
  return env.MIRROR_TS_SOUL !== "0";
}

// Python's argparse subcommands for `explore`, by name.
// CV22.DS7.US11 plateau 1. `week save` is deterministic, so it carries an
// ordinary revert gate rather than a replay gate. Default OFF until the
// plateau-6 flip; `plan` joins this gate when it lands behind replay.
function weekGateEnabled(env: RouteEnvironment): boolean {
  return env.MIRROR_TS_WEEK === "1";
}

// CV22.DS7.US11 plateau 3. `journal` crosses the provider seam twice — one
// classification call and one embedding — so it routes to TS only under the
// replay transport, exactly as `soul harvest save` and the conversation close
// tail do. An unconfigured install keeps Python until DS8 flips live mode.
// Default OFF until the plateau-6 flip.
function journalReplayConfigured(env: RouteEnvironment): boolean {
  return (
    externalRoutesEnabled(env) &&
    Boolean(env.MIRROR_TS_JOURNAL_LLM_REPLAY) &&
    Boolean(env.MIRROR_TS_JOURNAL_EMBEDDING_REPLAY)
  );
}

const TS_EXPLORE_SUBCOMMANDS = new Set(["load", "deactivate", "story"]);

// Python's `explore story` actions, by name.
//
// `promote` is absent DELIBERATELY, not by oversight: `cmd_story_promote` ends
// by calling Builder `load`, which US8 owns. The leaf stays on Python until the
// Builder tree is ported, and the burn-down ledger carries the dependency so it
// cannot be forgotten when the gate flips.
const TS_EXPLORE_STORY_ACTIONS = new Set([
  "show",
  "list",
  "archive",
  "update",
  "clear",
  "open",
  "thicken",
  "snapshot",
  "attractors",
  "experiment",
  "handoff",
]);

// CV22.DS7.US7: Explorer Mode. Flipped 2026-09-09 after the eleven-point
// checklist went green and the Navigator validated the real home -- nine
// populated surfaces across three real journeys (`mirror`, `mirror-gui`,
// `finances`) byte-identical on both engines, including the promoted-story path
// where an inactive legacy payload must NOT be resurrected.
//
// ONE gate for the family, like Soul: Explorer is a single lived mode, and a
// half-flipped mode cannot be reviewed in a live session. `MIRROR_TS_EXPLORE=0`
// is the revert control, with no code change and no data migration.
function exploreGateEnabled(env: RouteEnvironment): boolean {
  return env.MIRROR_TS_EXPLORE !== "0";
}

/** `explore story <action>`, skipping the options argparse strips first. */
function exploreStoryAction(argv: readonly string[]): string | undefined {
  const args = [...argv.slice(2)];
  for (const option of ["--mirror-home", "--db-path", "--session-id"]) {
    const index = args.indexOf(option);
    if (index !== -1) args.splice(index, 2);
  }
  return args[0];
}

/** `soul harvest <action>`, skipping the options argparse strips first. */
function soulHarvestAction(argv: readonly string[]): string | undefined {
  const args = [...argv.slice(2)];
  for (const option of ["--mirror-home", "--db-path", "--session-id", "--journey"]) {
    const index = args.indexOf(option);
    if (index !== -1) args.splice(index, 2);
  }
  return args[0];
}
