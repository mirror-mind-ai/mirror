import {
  BUILD_LOAD_COMPOSITION,
  CONSULT_ASK_TRANSPORT,
  CONSULT_CREDITS_TRANSPORT,
  CONVERSATION_TAIL_TRANSPORT,
  type ComposedProviderTransportSpec,
  CULTIVATION_APPLY_TRANSPORT,
  CULTIVATION_SCAN_TRANSPORT,
  DESCRIPTOR_TRANSPORT,
  JOURNAL_TRANSPORT,
  MIRROR_QUERY_TRANSPORT,
  type ProviderTransportSpec,
  resolveComposedProviderTransport,
  resolveProviderTransport,
  SEARCH_TRANSPORT,
  SOUL_HARVEST_TRANSPORT,
  WEEK_PLAN_TRANSPORT,
} from "#providers/transport.ts";

import {
  RUNTIME_SUBCOMMANDS,
  TS_RUNTIME_READ_SUBCOMMANDS,
  TS_RUNTIME_UPDATE_SUBCOMMANDS,
} from "./runtimeRoute.ts";
import type { UsageRequest } from "./usage.ts";

/**
 * The engine a routed command answers from. One member since CV22.DS10.TS5:
 * `"python"` left with the fallback it named, and every site that still
 * reached for it stopped compiling -- which is how the last of them were found.
 */
export type FrontDoorEngine = "ts";

/**
 * A surface CV22.DS10 removed rather than ported.
 *
 * Until TS4 a retired name was simply unclaimed: it fell through to Python,
 * which answered `Unknown command: <name>` with its usage block. That answer
 * belongs to the engine TS5 deletes, and it names commands DS10 has already
 * removed. These entries let the front door say *removed* itself, in one line,
 * pointing at the cutoff that explains what to do instead.
 *
 * `matches` reads argv by NAME. Nothing here is matched by inheritance: a verb
 * a retired family never had keeps its family's existing answer (the CR055
 * lesson `conversations append` paid for).
 */
export interface RetiredSurface {
  /** The shape as a user types it, e.g. `journey export-registry`. */
  readonly surface: string;
  /** Heading anchor in `docs/releases/pending-cutoffs.md`. A CONSTANT. */
  readonly anchor: string;
  readonly matches: (argv: readonly string[]) => boolean;
}

export type RouteDecision =
  | {
      command: string | null;
      engine: FrontDoorEngine;
      reason: string;
    }
  | {
      command: string | null;
      engine: "retired";
      reason: string;
      /** The retired shape, from the matched entry -- never from argv. */
      surface: string;
      /** The cutoff anchor, from the matched entry -- never from argv. */
      anchor: string;
    }
  | {
      command: string | null;
      /**
       * CV22.DS10.TS5 (D2): a name the front door does not answer. Rendered by
       * `usage.ts` before dispatch, like `retired` -- nothing opened, nothing
       * read from stdin, nothing spawned.
       */
      engine: "usage";
      reason: string;
      request: UsageRequest;
    };

/**
 * A family was named and its subcommand is not one it answers (D2).
 *
 * `choices` is the allowlist the family ALREADY routes by, so the usage line a
 * user sees cannot drift from what the build answers.
 */
function unknownSubcommand(
  command: string,
  choices: Iterable<string>,
  given: string | undefined,
  program: string = command,
): RouteDecision {
  const name = given ?? "";
  return {
    command,
    engine: "usage",
    reason:
      name === "" ? `${program} needs a subcommand` : `unknown ${program} subcommand: ${name}`,
    request: { scope: "family", program, choices: [...choices], given: name },
  };
}

/** A top-level name nothing answers, or no command at all (D2). */
function unknownCommand(given: string | null): RouteDecision {
  return {
    // Whatever the caller typed is not a command name, so the log records none.
    command: null,
    engine: "usage",
    reason: given === null ? "no command" : `unknown command: ${given}`,
    request: { scope: "top-level", given },
  };
}

const TS_READ_COMMANDS = new Set(["detect-persona", "journeys"]);

// The Conversation Metadata Lifecycle (ES-001) flags on `conversations`.
// CR068 found the whole family unowned: DS7.US1 called it "own slice" and no
// slice claimed it. DS7.US11 splits it three ways by what each flag actually
// needs, rather than treating them as one block.
//
// READS -- pure, over the engine DS7.US10 already ported.
const TS_LIFECYCLE_READ_FLAGS = [
  "--metadata-lifecycle-dry-run",
  "--metadata-lifecycle-preview-at-message",
];

// WRITES -- both need `apply_metadata_lifecycle`, ~80 lines of unported
// decision logic (`closeTail.ts` carries the same refusal), and `demo` calls
// `apply`. Refused BY NAME and assigned to DS7.TS4 by Navigator decision
// 2026-09-09, rather than silently inheriting a route or being reported as
// ported.
const TS4_LIFECYCLE_WRITE_FLAGS = ["--metadata-lifecycle-apply", "--metadata-lifecycle-demo"];

// One-shot backfill of pre-ES-001 rows, retired by CV22.DS10.TS4 with a
// documented cutoff. Named here ONLY for the retired entries below: those match
// before any family, so a family branch naming these flags would be dead code
// (TS5 deleted the one that was -- `retiredRouteShadows.ts` keeps it deleted).
const DS10_BACKFILL_FLAGS = ["--metadata-backfill-preview", "--metadata-backfill-apply"];

// CV22.DS7.TS4: the extension catalog family, allowlisted by NAME.
//
// `extensions` and `inspect` are claimed commands with subcommands Python may
// grow, and this family has already paid for inheritance once: `conversations`
// grew `append` after DS7.US1 claimed the command, and the new subcommand
// silently rendered a listing and discarded the caller's messages. So every
// verb TS answers is listed here, and anything else stays Python's.
export const TS4_EXTENSIONS_VERBS = new Set([
  "list",
  "validate",
  "sync",
  "install",
  "uninstall",
  "expose-claude",
  "clean-claude",
]);

const TS4_INSPECT_TARGETS = new Set([
  "extension",
  "runtime-catalog",
  "llm-calls",
  "embedding-provenance",
]);

/**
 * `ext`'s two levels, exported as the AUDITED denominator rather than as a
 * filter.
 *
 * Level one is every head `cmd_ext` recognises as a verb; level two is the four
 * built-in verbs that follow an id. Everything else — `<id>`, `<id> <builtin>`,
 * `<id> <subcommand>` — is the dynamic leaf, whose subcommand belongs to an
 * extension Mirror does not own and therefore cannot be enumerated.
 *
 * Because the route cannot refuse an unknown head (Python reads it as an id),
 * these sets are checked against `cli/ext.py` itself by a route test. That is
 * what keeps the inheritance honest: the day Python grows a verb beside
 * `list`, the test fails instead of the user silently getting `extension not
 * installed: .../doctor`.
 */
export const TS4_EXT_TOP_LEVEL_VERBS = new Set(["list", "--help", "-h", "help"]);
export const TS4_EXT_BUILTIN_VERBS = new Set(["bind", "unbind", "bindings", "migrate"]);

// CV22.DS7.US8 plateau 8: the 27 Builder leaves ported in plateaus 1–7.
// Exported so the route tests can prove that the allowlist and its audited
// denominator stay the same. The two legacy Workbench groups are deliberately
// absent: their twenty leaves retire unported in DS10.
export const TS_BUILD_SUBCOMMANDS = new Set([
  "load",
  "inspect-method",
  "adopt",
  "prepare-templates",
  "sync-cursor",
  "pull-candidates",
  "pull-item",
  "prepare-item",
  "plan-item",
  "approve-plan",
  "cancel-plan-preauthorization",
  "check-implementation",
  "validate-item",
  "review-item",
  "coherence-item",
  "done-item",
  "set-flow-unit",
  "plan-delivery-story",
  "approve-delivery-story-plan",
  "cancel-delivery-story-plan-preauthorization",
  "validate-delivery-story",
  "review-delivery-story",
  "coherence-delivery-story",
  "done-delivery-story",
  "set-cadence",
  "release-intent",
  "continue-lifecycle",
]);

export const TS_BUILD_WORKBENCH_ACTIONS = {
  "refinement-story": new Set([
    "create",
    "overview",
    "pull",
    "review",
    "coherence",
    "close",
    "park",
  ]),
  "change-request": new Set([
    "capture",
    "attach",
    "discard",
    "select",
    "confirm",
    "resume",
    "plan",
    "mark-implemented",
    "validate",
    "done",
    "park",
    "reject",
    "promote",
  ]),
} as const;

/**
 * The surfaces CV22.DS10.TS4 removed, each with the cutoff that explains it.
 *
 * A LIST OF PREDICATES, not a map keyed by command: the six shapes are four
 * different matchers (whole command; command + verb; command + flag; command +
 * subcommand + verb), and a map would push those differences into ad-hoc string
 * checks inside `routeMemoryCommand`.
 *
 * The surfaces TS1, US1, and TS3 retired are deliberately NOT here. Their
 * stories are closed, and the post-Python answer for every unclaimed name is
 * TS5's to shape at once -- adding them now would reopen three done packages
 * for a cosmetic change. (Naming them here would also trip their own
 * retired-surface rows, which is the guard working.)
 */
export const RETIRED_SURFACES: readonly RetiredSurface[] = [
  {
    surface: "migrate-legacy",
    anchor: "legacy-migration",
    matches: (argv) => argv[0] === "migrate-legacy",
  },
  {
    surface: "journey export-registry",
    anchor: "journey-admin-verbs",
    matches: (argv) => argv[0] === "journey" && argv[1] === "export-registry",
  },
  {
    surface: "journey mutate",
    anchor: "journey-admin-verbs",
    matches: (argv) => argv[0] === "journey" && argv[1] === "mutate",
  },
  {
    surface: "conversations --metadata-backfill-preview",
    anchor: "conversation-metadata-backfill",
    matches: (argv) => argv[0] === "conversations" && argv.includes(DS10_BACKFILL_FLAGS[0]),
  },
  {
    surface: "conversations --metadata-backfill-apply",
    anchor: "conversation-metadata-backfill",
    matches: (argv) => argv[0] === "conversations" && argv.includes(DS10_BACKFILL_FLAGS[1]),
  },
  // CV22.DS10.US2 (D1): the release chain leaves the PRODUCT surface. These
  // two were offered to every installed user and need a git checkout, a clean
  // tree, tags, and push rights -- none of which an installed user has. They
  // are maintainer tooling now, reached through `npm run release:*`, so the
  // old names answer with their cutoff rather than being ported.
  {
    surface: "runtime release-doctor",
    anchor: "release-tooling-leaves-the-product-command-surface",
    matches: (argv) => argv[0] === "runtime" && argv[1] === "release-doctor",
  },
  {
    surface: "runtime release-promote",
    anchor: "release-tooling-leaves-the-product-command-surface",
    matches: (argv) => argv[0] === "runtime" && argv[1] === "release-promote",
  },
  ...(
    [
      "refinement-story",
      "change-request",
    ] as const satisfies readonly (keyof typeof TS_BUILD_WORKBENCH_ACTIONS)[]
  ).flatMap((family) =>
    [...TS_BUILD_WORKBENCH_ACTIONS[family]].map((verb) => ({
      surface: `build ${family} ${verb}`,
      anchor: "the-sqlite-refinement-workbench",
      matches: (argv: readonly string[]) =>
        argv[0] === "build" && argv[1] === family && argv[2] === verb,
    })),
  ),
];

/** The matched entry, or `null` when nothing this story retired was named. */
function retiredSurfaceFor(argv: readonly string[]): RetiredSurface | null {
  return RETIRED_SURFACES.find((entry) => entry.matches(argv)) ?? null;
}

/**
 * The one line a caller sees. No traceback, no usage block, no partial output.
 *
 * Every substitution comes from the matched entry, never from argv: a caller
 * cannot push text into this message, and a path passed to a retired command
 * cannot reach a terminal, a log, or a screen recording through it.
 */
export function retiredRefusal(decision: RouteDecision & { engine: "retired" }): string {
  return (
    `Mirror: '${decision.surface}' was removed in the CV22 migration. ` +
    `See docs/releases/pending-cutoffs.md#${decision.anchor}.\n`
  );
}

// A type alias rather than an interface: aliases get an implicit index
// signature, which is what lets the named variables below still be passed to
// `resolveProviderTransport`, whose families name their variables as data.
//
// Only what still CHOOSES something is here: the replay fixtures, which choose
// a test transport, and `MEMORY_RECEPTION`. The `MIRROR_TS_<FAMILY>` revert
// gates chose an engine, and left with it (CV22.DS10.TS5, D3). A value left in
// someone's `.env` changes no route; `runtime diagnose` names it inert.
export type RouteEnvironment = {
  MIRROR_TS_SEARCH_EMBEDDING_REPLAY?: string;
  MIRROR_TS_CONSULT_LLM_REPLAY?: string;
  MIRROR_TS_CREDITS_REPLAY?: string;
  MIRROR_TS_CULTIVATION_LLM_REPLAY?: string;
  MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY?: string;
  MIRROR_TS_MIRROR_LLM_REPLAY?: string;
  MIRROR_TS_MIRROR_EMBEDDING_REPLAY?: string;
  MIRROR_TS_CONVERSATION_LLM_REPLAY?: string;
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY?: string;
  MIRROR_TS_SOUL_EMBEDDING_REPLAY?: string;
  MIRROR_TS_BUILD_LLM_REPLAY?: string;
  MIRROR_TS_BUILD_EMBEDDING_REPLAY?: string;
  MIRROR_TS_JOURNAL_LLM_REPLAY?: string;
  MIRROR_TS_JOURNAL_EMBEDDING_REPLAY?: string;
  MIRROR_TS_WEEK_LLM_REPLAY?: string;
  MIRROR_TS_DESCRIPTOR_LLM_REPLAY?: string;
  MEMORY_RECEPTION?: string;
};

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

// CV22.DS8.US2 staged the live cutover in the order US10 proved and flipped
// these in: group 1 (`switch`, `session-end-pi`, `session-end`) first, because
// `session-end` fires unattended from the Pi hook; then group 2
// (`session-start` full, `session-maintenance`), which composes the close tail
// WITH backfill and orphan handling and can close several conversations in one
// run, multiplying any defect.
//
// Group 1 was observed live on the real home on 2026-09-11 -- a full close
// tail with extraction_status=ok, six memories at 1536 dims, and every ledger
// row priced with bodies withheld -- so the staging has served its purpose and
// all five subcommands now share one live decision.

/** Python's `main()`: strip `--mirror-home X` and `--session-id X`, then `args[0]`. */
function conversationLoggerSubcommand(argv: readonly string[]): string | undefined {
  const args = [...argv.slice(1)];
  for (const option of ["--mirror-home", "--session-id"]) {
    const index = args.indexOf(option);
    if (index !== -1) args.splice(index, 2);
  }
  return args[0];
}

/**
 * One decision for every provider-backed leaf (CV22.DS8.US3).
 *
 * `MIRROR_TS_EXTERNAL_ROUTES` is GONE, not merely unused. It was DS5's safety
 * catch while replay was the PRODUCTION route for these leaves: requiring an
 * extra opt-in made sense when "routed to TS" meant "answered from a fixture".
 * After the live cutover replay is a test transport, so the gate would only
 * add a second thing to set in CI and a stale value to trip over in a shell.
 * A leftover `=1` or `=0` is inert, and a test pins that.
 */
function providerRoute(
  command: string | null,
  env: RouteEnvironment,
  spec: ProviderTransportSpec | ComposedProviderTransportSpec,
  leaf?: string,
): RouteDecision {
  // A composition resolves three specs at once (`build load` and the one leaf
  // whose tail it is, `explore story promote`); a plain spec resolves one. Both
  // yield the same decision shape, so the reason below is written once.
  const transport =
    "owner" in spec
      ? resolveComposedProviderTransport(env, spec)
      : resolveProviderTransport(env, spec);
  const reason = leaf ? `${transport.reason} (${leaf})` : transport.reason;
  // Every transport answers from TypeScript, `incomplete_replay` included: the
  // route refuses it by name before any provider is built. Until CV22.DS10.TS5
  // a PLAIN family sent it to Python instead -- which has no replay transport
  // and would have called the live provider, the silent spend CR077 made
  // compositions refuse.
  return { command, engine: "ts", reason };
}

export function routeMemoryCommand(
  argv: readonly string[],
  env: RouteEnvironment = process.env,
): RouteDecision {
  // Retired surfaces are matched FIRST, before any family claims the command.
  // This is what closes CR089: `journey export-registry` and `journey mutate`
  // can no longer fall into the `journey` status read and be treated as slugs
  // -- a wrong answer with exit 0 on a read, and a silent no-op on a write.
  const retired = retiredSurfaceFor(argv);
  if (retired) {
    return {
      command: argv[0] ?? null,
      engine: "retired",
      reason: `${retired.surface} retired in CV22.DS10.TS4`,
      surface: retired.surface,
      anchor: retired.anchor,
    };
  }
  return routeByFamily(argv, env);
}

/**
 * The family routes, WITHOUT the retired-surface match in front of them.
 *
 * Exported for one reader: the guard that proves no family branch still names
 * a shape a retired entry already answers (CV22.DS10.TS5, inventory F2). A
 * branch like that is dead code nothing can observe -- the retired match wins
 * before it is reached -- so every front-door test passes over it, which is
 * exactly how TS4 left two of them behind. The front door itself always calls
 * `routeMemoryCommand`.
 */
export function routeByFamily(
  argv: readonly string[],
  env: RouteEnvironment = process.env,
): RouteDecision {
  const command = argv[0] ?? null;
  if (!command) return unknownCommand(null);

  if (TS_READ_COMMANDS.has(command)) {
    return { command, engine: "ts", reason: "DS2 read command ported to TS" };
  }

  if (command === "memories") {
    if (argv.includes("--search")) {
      // CV22.DS8.US1: fresh semantic search reaches the live provider from TS
      // by default; a replay fixture wins for CI and the smokes. One
      // precedence, shared with every provider-backed family.
      return providerRoute(command, env, SEARCH_TRANSPORT);
    }
    return { command, engine: "ts", reason: "DS2 memory listing read ported to TS" };
  }

  if (command === "consult") {
    // Per leaf, because the fixtures are: `credits` needs the credits fixture
    // alone, `ask` needs the chat fixture too. With only the credits one set,
    // `credits` replays and `ask` refuses rather than going half-live.
    return argv[1] === "credits"
      ? providerRoute(command, env, CONSULT_CREDITS_TRANSPORT, "credits")
      : providerRoute(command, env, CONSULT_ASK_TRANSPORT, "ask");
  }

  if (command === "identity") {
    // `set` (DS4), `list`/`get` (DS7.US1), and `edit` (DS7.TS4's editor seam).
    if (argv[1] === "set") {
      return { command, engine: "ts", reason: "DS4 identity set write ported to TS" };
    }
    if (argv[1] === "list" || argv[1] === "get") {
      return { command, engine: "ts", reason: "DS7.US1 identity list/get read ported to TS" };
    }
    if (argv[1] === "edit") {
      return { command, engine: "ts", reason: "DS7.TS4 identity edit ported to TS" };
    }
    // Allowlisted by name rather than inherited: `identity` grew `edit` after
    // `set` claimed the command.
    return unknownSubcommand(command, IDENTITY_SUBCOMMANDS, argv[1]);
  }

  if (command === "extensions") {
    const verb = argv[1] ?? "list";
    if (!TS4_EXTENSIONS_VERBS.has(verb)) {
      return unknownSubcommand(command, TS4_EXTENSIONS_VERBS, verb);
    }
    return { command, engine: "ts", reason: `DS7.TS4 extensions ${verb} ported to TS` };
  }

  if (command === "ext") {
    // No verb allowlist is possible here, and saying so is better than writing
    // one that accepts everything: `cmd_ext` treats EVERY head that is not
    // `list` or a help flag as an extension id, so TS must too. The exposure
    // that creates is real and named — a new top-level verb beside `list`
    // would be read as an id and answered `extension not installed` — and it
    // is guarded by a test that reads `cli/ext.py` and fails when that set of
    // literals changes, rather than by a set duplicated here that nothing
    // checks.
    return { command, engine: "ts", reason: "DS7.TS4 ext dispatcher ported to TS" };
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
      return {
        command,
        engine: "ts",
        reason: "DS7.US10 conversations append boundary ported to TS",
      };
    }
    const writeFlag = TS4_LIFECYCLE_WRITE_FLAGS.find((flag) => argv.includes(flag));
    if (writeFlag) {
      return { command, engine: "ts", reason: `DS7.TS4 ${writeFlag} ported to TS` };
    }
    const readFlag = TS_LIFECYCLE_READ_FLAGS.find((flag) => argv.includes(flag));
    if (readFlag) {
      return {
        command,
        engine: "ts",
        reason: `DS7.US11 ${readFlag} ported to TS`,
      };
    }
    return { command, engine: "ts", reason: "DS7.US1 conversations listing read ported to TS" };
  }

  if (command === "inspect") {
    // `persona` (DS7.US1) is a deterministic identity read. The other four
    // targets are DS7.TS4's: `extension`/`runtime-catalog` share the catalog
    // machinery, `llm-calls`/`embedding-provenance` read the ledger.
    if (argv[1] === "persona") {
      return { command, engine: "ts", reason: "DS7.US1 inspect persona read ported to TS" };
    }
    if (TS4_INSPECT_TARGETS.has(argv[1] ?? "")) {
      return { command, engine: "ts", reason: `DS7.TS4 inspect ${argv[1]} ported to TS` };
    }
    return unknownSubcommand(command, ["persona", ...TS4_INSPECT_TARGETS], argv[1]);
  }

  if (command === "list") {
    // `personas`/`journeys` (DS7.US1) are deterministic identity reads;
    // `extensions` and `all` (which is also the no-target default) touch the
    // extension catalog and belong to DS7.TS4.
    if (argv[1] === "personas") {
      return { command, engine: "ts", reason: "DS7.US1 list personas read ported to TS" };
    }
    if (argv[1] === "journeys") {
      return { command, engine: "ts", reason: "DS7.US1 list journeys read ported to TS" };
    }
    const listTarget = argv[1] ?? "all";
    if (listTarget === "extensions" || listTarget === "all") {
      return { command, engine: "ts", reason: `DS7.TS4 list ${listTarget} ported to TS` };
    }
    return unknownSubcommand(command, LIST_TARGETS, listTarget);
  }

  if (command === "descriptor") {
    // `list` (DS7.US1) is a deterministic read; `generate` calls the LLM
    // (generate_descriptor) and stays on Python as the DS7↔DS8 live seam.
    if (argv[1] === "list") {
      return { command, engine: "ts", reason: "DS7.US1 descriptor list read ported to TS" };
    }
    if (argv[1] === "generate") {
      return providerRoute(command, env, DESCRIPTOR_TRANSPORT, "generate");
    }
    return unknownSubcommand(command, DESCRIPTOR_SUBCOMMANDS, argv[1]);
  }

  if (command === "tasks") {
    // `list` (and the bare `tasks` default) is a read; `add/done/doing/block/
    // delete` are the deterministic writes ported in DS7.US2 slice 3a;
    // `import/sync/sync-config` (which also touch the journey sync-file/
    // project-path metadata subsystem) are ported in slice 3c.
    //
    // A LEADING OPTION IS NOT A LIST ANY MORE (CV22.DS10.TS5, F5). The rule
    // here used to read `tasks --anything ...` as `list`, which is how
    // `tasks --mirror-home H add "x"` printed the list and wrote nothing. The
    // options the oracle accepts before the subcommand are now moved after it
    // by `argvShape.ts` before routing runs, so one that is still here is one
    // the oracle's parser rejected too -- or `-h`.
    const sub = argv[1];
    if (sub === undefined || sub === "list") {
      return { command, engine: "ts", reason: "DS7.US2 tasks list read ported to TS" };
    }
    if (TASKS_SUBCOMMANDS.includes(sub)) {
      return { command, engine: "ts", reason: "DS7.US2 tasks write ported to TS" };
    }
    return unknownSubcommand(command, TASKS_SUBCOMMANDS, sub);
  }

  if (command === "week") {
    // `view` (and the bare `week` default) is a deterministic read ported in
    // DS7.US2. CR068 corrected this family's accounting: US2 sent `plan` and
    // `save` to US5, US5 was re-scoped without them, and nothing inherited the
    // work -- and the reason recorded here claimed BOTH were "LLM-gated",
    // which is false for `save`. `save_week_items` reads the pending file and
    // calls `add_task`; it crosses no provider seam. Only `plan` calls a model.
    const sub = argv[1];
    if (sub === undefined || sub === "view") {
      return { command, engine: "ts", reason: "DS7.US2 week view read ported to TS" };
    }
    if (sub === "save") {
      return { command, engine: "ts", reason: "DS7.US11 week save (deterministic) ported to TS" };
    }
    if (sub === "plan") {
      // One model call, no embedding -- so it needs the LLM replay fixture
      // only, unlike `journal` which crosses the seam twice.
      return providerRoute(command, env, WEEK_PLAN_TRANSPORT, "plan");
    }
    return unknownSubcommand(command, WEEK_SUBCOMMANDS, sub);
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
    // `apply` sends NO prompt: a merge embeds the merged content and an
    // identity_update makes no provider call at all. So it is not blocked by
    // TS2, unlike `scan`. Gated as a whole because its action is read from the
    // DB, not argv, and the routing decision precedes any DB open.
    if (sub === "apply") {
      return providerRoute(command, env, CULTIVATION_APPLY_TRANSPORT, "apply");
    }
    if (sub === "scan") {
      return providerRoute(command, env, CULTIVATION_SCAN_TRANSPORT, "scan");
    }
    return unknownSubcommand(command, CONSOLIDATE_SUBCOMMANDS, sub);
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
      return providerRoute(command, env, CULTIVATION_SCAN_TRANSPORT, "shadow scan");
    }
    return unknownSubcommand(command, SHADOW_SUBCOMMANDS, sub);
  }

  if (command === "mirror") {
    const sub = argv[1];
    if (sub === "load") {
      const hasQuery = argv.includes("--query");
      if (!hasQuery) {
        return { command, engine: "ts", reason: "DS7.US4 deterministic mirror load ported to TS" };
      }
      // `MEMORY_RECEPTION=0` skips the classifier on both engines, so the
      // chat fixture stops being required for a replay run; the embedding half
      // still is, because the query still searches attachments and journeys.
      const spec =
        env.MEMORY_RECEPTION === "0"
          ? {
              ...MIRROR_QUERY_TRANSPORT,
              replay: { embedding: MIRROR_QUERY_TRANSPORT.replay?.embedding },
            }
          : MIRROR_QUERY_TRANSPORT;
      return providerRoute(command, env, spec, "load --query");
    }
    if (sub === "deactivate" || sub === "log" || sub === "journeys") {
      return { command, engine: "ts", reason: `DS7.US4 mirror ${sub} ported to TS` };
    }
    return unknownSubcommand(command, MIRROR_SUBCOMMANDS, sub);
  }

  if (command === "conversation-logger") {
    // CV22.DS7.US5 slice A: flipped 2026-09-02 after the seven-point checklist
    // went green (goldens, real-DB-copy write parity, hook-inclusive E2E,
    // regression pass, redaction, revertibility, ledger).
    const sub = conversationLoggerSubcommand(argv);
    if (sub === "repair-journeys" && argv.includes("--apply")) {
      // The mutating repair takes the dated zip backup (DS7.TS1) before it
      // writes -- the route itself refuses without it.
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
      return providerRoute(command, env, CONVERSATION_TAIL_TRANSPORT, sub);
    }
    // The oracle answered an unknown logger subcommand with NOTHING, exit 0 --
    // a silent success for a hook that named a subcommand that does not exist.
    // It now gets the family's answer like every other family (D2, F6).
    return unknownSubcommand(
      command,
      [...TS_CONVERSATION_LOGGER_SUBCOMMANDS, ...TS_CONVERSATION_LOGGER_LLM_SUBCOMMANDS],
      sub,
    );
  }

  if (command === "mode") {
    const sub = argv.find((value, index) => index > 0 && MODE_SUBCOMMANDS.includes(value));
    return sub
      ? { command, engine: "ts", reason: "DS7.US4 operating mode lifecycle ported to TS" }
      : unknownSubcommand(command, MODE_SUBCOMMANDS, modeGivenSubcommand(argv));
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
    return { command, engine: "ts", reason: "DS7.TS1 backup ported to TS" };
  }

  if (command === "repair-encoding") {
    return { command, engine: "ts", reason: "DS7.TS1 repair-encoding ported to TS" };
  }

  if (command === "welcome") {
    return { command, engine: "ts", reason: "DS7.TS3 welcome ported to TS" };
  }

  if (command === "runtime") {
    const subcommand = argv[1] ?? "";
    // Allowlist, not blocklist: a subcommand this build has never heard of
    // must not acquire a TS route because `runtime` already has one.
    if (!TS_RUNTIME_READ_SUBCOMMANDS.has(subcommand)) {
      // CV22.DS10.US2: the updater family.
      if (TS_RUNTIME_UPDATE_SUBCOMMANDS.has(subcommand)) {
        return { command, engine: "ts", reason: `DS10.US2 runtime ${subcommand} ported to TS` };
      }
      // CV22.DS10.US2 made the unknown answer TypeScript's own, rendered by
      // the runtime route; CV22.DS10.TS5 moved it to the shared usage answer
      // (D2), which renders the same bytes for every family.
      return unknownSubcommand(command, RUNTIME_SUBCOMMANDS, subcommand);
    }
    return { command, engine: "ts", reason: `DS7.TS3 runtime ${subcommand} ported to TS` };
  }

  if (command === "soul") {
    const subcommand = argv[1] ?? "";
    // Allowlist by NAME, like `runtime`, and for the same reason: a subcommand
    // the route never implemented must not inherit it because the family is
    // claimed. That is the `conversations append` defect (RS009/CR055), which
    // exited 0 and discarded the caller's payload.
    if (!TS_SOUL_SUBCOMMANDS.has(subcommand)) {
      return unknownSubcommand(command, TS_SOUL_SUBCOMMANDS, subcommand);
    }
    // `harvest save` is the one leaf that crosses the provider seam, through
    // the embedding alone.
    if (subcommand === "harvest" && soulHarvestAction(argv) === "save") {
      return providerRoute(command, env, SOUL_HARVEST_TRANSPORT, "harvest save");
    }
    return { command, engine: "ts", reason: `DS7.US6 soul ${subcommand} ported to TS` };
  }

  if (command === "explore") {
    const subcommand = argv[1] ?? "";
    // TWO levels, because `explore` is the first family with a nested
    // subparser. A single-level allowlist would claim `explore story
    // <anything>` and answer an argv shape this route has never implemented.
    if (!TS_EXPLORE_SUBCOMMANDS.has(subcommand)) {
      return unknownSubcommand(command, TS_EXPLORE_SUBCOMMANDS, subcommand);
    }
    if (subcommand === "story") {
      const action = exploreStoryAction(argv);
      if (!TS_EXPLORE_STORY_ACTIONS.has(action ?? "")) {
        return unknownSubcommand(command, TS_EXPLORE_STORY_ACTIONS, action, "explore story");
      }
    }
    // `story promote` ends in a Builder session start (`cmd_story_promote`
    // calls `cmd_load`), so it answers to the SAME composed transport decision
    // `build load` does -- resolved here rather than inside the route because
    // promote's writes are not idempotent, so a half-configured replay harness
    // must be refused before the first mutation, not after.
    if (subcommand === "story" && exploreStoryAction(argv) === "promote") {
      return providerRoute(command, env, BUILD_LOAD_COMPOSITION, "story promote");
    }
    return { command, engine: "ts", reason: `DS7.US7 explore ${subcommand} ported to TS` };
  }

  if (command === "build") {
    const subcommand = argv[1] ?? "";
    // `refinement-story` and `change-request` are not build subcommands: the
    // twenty verbs they had are answered by the retired table before this
    // line, and anything else under them is an unknown build subcommand --
    // what the oracle itself has answered since TS4 deleted the groups.
    if (!TS_BUILD_SUBCOMMANDS.has(subcommand)) {
      return unknownSubcommand(command, TS_BUILD_SUBCOMMANDS, subcommand);
    }
    // `load` composes the search and conversation-tail provider families. Its
    // transport must be decided before the banner or any surface is printed.
    if (subcommand === "load") {
      return providerRoute(command, env, BUILD_LOAD_COMPOSITION, "load");
    }
    return { command, engine: "ts", reason: `DS7.US8 build ${subcommand} ported to TS` };
  }

  if (command === "journal") {
    return providerRoute(command, env, JOURNAL_TRANSPORT);
  }

  if (command === "mcp") {
    // CV22.DS10.TS5 (F9): the server DS9 ported, reached through the front
    // door as the oracle's `mcp` was. The plugin launches it directly; this is
    // the same server, not a second one.
    return { command, engine: "ts", reason: "DS9 MCP server, launched through the front door" };
  }

  return unknownCommand(command);
}

// The subcommands of families whose routes above test them one by one. Named
// here so the usage answer lists exactly what the routes answer.
const IDENTITY_SUBCOMMANDS = ["list", "get", "set", "edit"];
const LIST_TARGETS = ["personas", "journeys", "extensions", "all"];
const DESCRIPTOR_SUBCOMMANDS = ["generate", "list"];
const TASKS_SUBCOMMANDS = [
  "list",
  "add",
  "done",
  "doing",
  "block",
  "import",
  "delete",
  "sync",
  "sync-config",
];
const WEEK_SUBCOMMANDS = ["view", "plan", "save"];
const CONSOLIDATE_SUBCOMMANDS = ["scan", "apply", "reject", "list"];
const SHADOW_SUBCOMMANDS = ["scan", "apply", "reject", "list", "show"];
const MIRROR_SUBCOMMANDS = ["load", "deactivate", "log", "journeys"];
const MODE_SUBCOMMANDS = ["activate", "deactivate", "status"];

/** `mode`'s first positional, past the two options its parser declares; "" when none. */
function modeGivenSubcommand(argv: readonly string[]): string {
  const args = [...argv.slice(1)];
  for (const option of ["--mirror-home", "--session-id"]) {
    const index = args.indexOf(option);
    if (index !== -1) args.splice(index, 2);
  }
  return args[0] ?? "";
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

// Python's argparse subcommands for `explore`, by name.
const TS_EXPLORE_SUBCOMMANDS = new Set(["load", "deactivate", "story"]);

// Python's `explore story` actions, by name.
//
// `promote` joined at CV22.DS7.US8 plateau 7, having waited on Python by name
// since US7 because `cmd_story_promote` ends by calling Builder `load`. It is
// the one action here whose engine also depends on the provider composition;
// see the decision above.
const TS_EXPLORE_STORY_ACTIONS = new Set([
  "promote",
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
