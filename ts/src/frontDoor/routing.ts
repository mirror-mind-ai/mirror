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

import { DS10_RUNTIME_SUBCOMMANDS, TS_RUNTIME_READ_SUBCOMMANDS } from "./runtimeRoute.ts";

export type FrontDoorEngine = "ts" | "python";

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
    };

const TS_READ_COMMANDS = new Set(["detect-persona", "journeys"]);

// The Conversation Metadata Lifecycle (ES-001) flags on `conversations`.
// CR068 found the whole family unowned: DS7.US1 called it "own slice" and no
// slice claimed it. DS7.US11 splits it three ways by what each flag actually
// needs, rather than treating them as one block.
//
// READS -- pure, over the engine DS7.US10 already ported. Gated by
// MIRROR_TS_CONVERSATIONS_LIFECYCLE.
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

// One-shot backfill of pre-ES-001 rows. Retired unported in DS10 with a
// documented cutoff; refused by name so it can never inherit the read route.
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
export type RouteEnvironment = {
  /** CV22.DS8.US1 revert control for the fresh-semantic-search leaf. */
  MIRROR_TS_SEARCH?: string;
  MIRROR_TS_SEARCH_EMBEDDING_REPLAY?: string;
  /** CV22.DS8.US3 revert control for both consult leaves. */
  MIRROR_TS_CONSULT?: string;
  MIRROR_TS_CONSULT_LLM_REPLAY?: string;
  MIRROR_TS_CREDITS_REPLAY?: string;
  /** CV22.DS8.US3 tail-only revert: the provider-crossing cultivation leaves. */
  MIRROR_TS_CULTIVATION?: string;
  MIRROR_TS_CULTIVATION_LLM_REPLAY?: string;
  MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY?: string;
  /** CV22.DS8.US3 revert control for `mirror load --query` only. */
  MIRROR_TS_MIRROR_QUERY?: string;
  MIRROR_TS_MIRROR_LLM_REPLAY?: string;
  MIRROR_TS_MIRROR_EMBEDDING_REPLAY?: string;
  MIRROR_TS_CONVERSATION_LOGGER?: string;
  MIRROR_TS_CONVERSATION_APPEND?: string;
  MIRROR_TS_CONVERSATION_LLM_REPLAY?: string;
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY?: string;
  /** CV22.DS8.US2 tail-only revert: the five close-tail subcommands, not the family. */
  MIRROR_TS_CONVERSATION_LLM_TAIL?: string;
  MIRROR_TS_BACKUP?: string;
  MIRROR_TS_REPAIR_ENCODING?: string;
  MIRROR_TS_WELCOME?: string;
  MIRROR_TS_RUNTIME_READS?: string;
  MIRROR_TS_SOUL?: string;
  MIRROR_TS_SOUL_EMBEDDING_REPLAY?: string;
  MIRROR_TS_EXPLORE?: string;
  /**
   * CV22.DS7.US8: the Builder family's revert and its replay fixtures.
   *
   * They reach routing through `explore story promote`, whose tail is a Builder
   * session start, and through the `build` route at plateau 8. Declared here so
   * a caller cannot pass one under a typo'd name and silently get the default.
   */
  MIRROR_TS_BUILD?: string;
  MIRROR_TS_BUILD_LLM_REPLAY?: string;
  MIRROR_TS_BUILD_EMBEDDING_REPLAY?: string;
  MIRROR_TS_WEEK?: string;
  MIRROR_TS_JOURNAL?: string;
  MIRROR_TS_JOURNAL_LLM_REPLAY?: string;
  MIRROR_TS_JOURNAL_EMBEDDING_REPLAY?: string;
  MIRROR_TS_WEEK_LLM_REPLAY?: string;
  MIRROR_TS_CONVERSATIONS_LIFECYCLE?: string;
  /**
   * CV22.DS7.TS4: the extension catalog family and the editor seam.
   *
   * `MIRROR_TS_EXTENSIONS` covers `extensions`, `ext`, `list extensions|all`,
   * and `inspect extension|runtime-catalog` as ONE gate (decision D2): they
   * share discovery, and a half-flipped catalog would report two truths about
   * the same installed world. `identity edit` gets its own — an editor seam
   * that can lose a person's identity content deserves a revert that does not
   * also revert the catalog.
   */
  MIRROR_TS_EXTENSIONS?: string;
  MIRROR_TS_IDENTITY_EDIT?: string;
  MIRROR_TS_DESCRIPTOR?: string;
  MIRROR_TS_DESCRIPTOR_LLM_REPLAY?: string;
  MEMORY_RECEPTION?: string;
};

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

// CV22.DS7.TS4 plateau 8: FLIPPED 2026-09-16, after the Navigator ran the
// validation route on the real home and accepted it — the read diff, the
// dispatch through the compat host with `leaf=session-export` and no argument
// in the log, and `identity edit` saving through their own editor. The rest of
// the route was run on copies of that home (`ts/parity/ts4_home_copy_route.ts`)
// and in CI.
//
// Each `=0` is now the revert control: no code change, no data migration, and
// nothing in this family writes a shape the other engine cannot read.
const EXTENSIONS_DEFAULT_ON = true;
const IDENTITY_EDIT_DEFAULT_ON = true;
const LIFECYCLE_WRITES_DEFAULT_ON = true;

/**
 * Exported because its default is about to change.
 *
 * While a gate defaults OFF, `=0` and "unset" produce the same route, so a test
 * that only checks "unset and `=0` both reach Python" passes even if the `=0`
 * branch is deleted — which a mutant proved. Plateau 8 flips these defaults to
 * ON, and on that day the `=0` branch IS the revert control the flip is safe
 * to take with. So the contract is pinned here, independent of today's default.
 */
export function gateWithDefault(value: string | undefined, defaultOn: boolean): boolean {
  if (value === "0") return false;
  if (value === "1") return true;
  return defaultOn;
}

/**
 * The extension family's single gate.
 *
 * `inspect llm-calls|embedding-provenance` ride it too, which is a deliberate
 * narrowing of decision D2: that decision left the two ledger reads ungated,
 * like their `inspect persona` sibling. Keeping them here gives the STORY one
 * revert control instead of a family with a hole in it — an operator reverting
 * "the extension catalog work" should not discover that two of its leaves kept
 * answering from the new engine. Unhooking them is a one-line change if the
 * Navigator prefers D2 literally.
 */
function extensionsRouteEnabled(env: RouteEnvironment): boolean {
  return gateWithDefault(env.MIRROR_TS_EXTENSIONS, EXTENSIONS_DEFAULT_ON);
}

function identityEditRouteEnabled(env: RouteEnvironment): boolean {
  return gateWithDefault(env.MIRROR_TS_IDENTITY_EDIT, IDENTITY_EDIT_DEFAULT_ON);
}

/**
 * The ES-001 WRITE faces share the reads' environment variable (D2) but not
 * their default: the reads flipped in US11 and are on, these are wired here and
 * off. One variable, two defaults, until plateau 8 makes them one again.
 */
function lifecycleWritesRouteEnabled(env: RouteEnvironment): boolean {
  return gateWithDefault(env.MIRROR_TS_CONVERSATIONS_LIFECYCLE, LIFECYCLE_WRITES_DEFAULT_ON);
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
  // yield the same decision shape, so the engine rule below is written once.
  const composition = "owner" in spec;
  const transport = composition
    ? resolveComposedProviderTransport(env, spec)
    : resolveProviderTransport(env, spec);
  const reason = leaf ? `${transport.reason} (${leaf})` : transport.reason;
  return {
    command,
    // A composed command MUST reach its TS runtime on incomplete replay so it
    // can refuse before mutation. Python has no replay transport and could
    // spend live; routing it there would violate the CR077 rule this
    // composition exists to enforce. Plain-family behavior is left unchanged
    // here because changing every external route is outside US8.
    engine:
      transport.mode === "python" || (transport.mode === "incomplete_replay" && !composition)
        ? "python"
        : "ts",
    reason,
  };
}

export function routeMemoryCommand(
  argv: readonly string[],
  env: RouteEnvironment = process.env,
): RouteDecision {
  const command = argv[0] ?? null;
  if (!command) return { command, engine: "python", reason: "no command" };

  // Retired surfaces are matched FIRST, before any family claims the command.
  // This is what closes CR089: `journey export-registry` and `journey mutate`
  // can no longer fall into the `journey` status read and be treated as slugs
  // -- a wrong answer with exit 0 on a read, and a silent no-op on a write.
  const retired = retiredSurfaceFor(argv);
  if (retired) {
    return {
      command,
      engine: "retired",
      reason: `${retired.surface} retired in CV22.DS10.TS4`,
      surface: retired.surface,
      anchor: retired.anchor,
    };
  }

  if (TS_READ_COMMANDS.has(command)) {
    return { command, engine: "ts", reason: "DS2 read command ported to TS" };
  }

  if (command === "memories") {
    if (argv.includes("--search")) {
      // CV22.DS8.US1: fresh semantic search reaches the live provider from TS
      // by default. `MIRROR_TS_SEARCH=0` is the revert; a replay fixture still
      // wins for CI and the parity harness. One precedence, shared with every
      // family US2/US3 flips.
      const transport = resolveProviderTransport(env, SEARCH_TRANSPORT);
      return {
        command,
        engine: transport.mode === "python" ? "python" : "ts",
        reason: transport.reason,
      };
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
    // `set` (DS4) and `list`/`get` (DS7.US1) are ported; `edit` is DS7.TS4's
    // editor seam, wired here and off until the flip.
    if (argv[1] === "set") {
      return { command, engine: "ts", reason: "DS4 identity set write ported to TS" };
    }
    if (argv[1] === "list" || argv[1] === "get") {
      return { command, engine: "ts", reason: "DS7.US1 identity list/get read ported to TS" };
    }
    if (argv[1] === "edit") {
      if (!identityEditRouteEnabled(env)) {
        return {
          command,
          engine: "python",
          reason: "identity edit TS route disabled by MIRROR_TS_IDENTITY_EDIT",
        };
      }
      return { command, engine: "ts", reason: "DS7.TS4 identity edit ported to TS" };
    }
    // A subcommand this family does not know is Python's, by name rather than
    // by inheritance: `identity` grew `edit` after `set` claimed the command.
    return {
      command,
      engine: "python",
      reason: "identity subcommand not ported to TS",
    };
  }

  if (command === "extensions") {
    const verb = argv[1] ?? "list";
    if (!TS4_EXTENSIONS_VERBS.has(verb)) {
      // `cmd_extensions` refuses an unknown verb with a usage line. TS owns that
      // refusal only for the verbs it knows; a verb Python grows later must
      // reach Python, not a TS refusal written before it existed.
      return { command, engine: "python", reason: "extensions verb not ported to TS" };
    }
    if (!extensionsRouteEnabled(env)) {
      return {
        command,
        engine: "python",
        reason: "extensions TS route disabled by MIRROR_TS_EXTENSIONS",
      };
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
    if (!extensionsRouteEnabled(env)) {
      return { command, engine: "python", reason: "ext TS route disabled by MIRROR_TS_EXTENSIONS" };
    }
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
    const backfillFlag = DS10_BACKFILL_FLAGS.find((flag) => argv.includes(flag));
    if (backfillFlag) {
      return {
        command,
        engine: "python",
        reason: `${backfillFlag} retires unported in DS10, not ported here`,
      };
    }
    const writeFlag = TS4_LIFECYCLE_WRITE_FLAGS.find((flag) => argv.includes(flag));
    if (writeFlag) {
      if (!lifecycleWritesRouteEnabled(env)) {
        return {
          command,
          engine: "python",
          reason: `${writeFlag} TS route disabled by MIRROR_TS_CONVERSATIONS_LIFECYCLE`,
        };
      }
      return { command, engine: "ts", reason: `DS7.TS4 ${writeFlag} ported to TS` };
    }
    const readFlag = TS_LIFECYCLE_READ_FLAGS.find((flag) => argv.includes(flag));
    if (readFlag) {
      if (env.MIRROR_TS_CONVERSATIONS_LIFECYCLE === "0") {
        return {
          command,
          engine: "python",
          reason: "conversations lifecycle reads disabled by MIRROR_TS_CONVERSATIONS_LIFECYCLE=0",
        };
      }
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
      if (!extensionsRouteEnabled(env)) {
        return {
          command,
          engine: "python",
          reason: `inspect ${argv[1]} TS route disabled by MIRROR_TS_EXTENSIONS`,
        };
      }
      return { command, engine: "ts", reason: `DS7.TS4 inspect ${argv[1]} ported to TS` };
    }
    // An unknown target is Python's by NAME. `cmd_inspect` refuses it with a
    // usage line, and reproducing that refusal is a port, not an inheritance:
    // a target Python grows tomorrow must not silently land on a TS refusal.
    return {
      command,
      engine: "python",
      reason: "inspect target not ported to TS",
    };
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
      if (!extensionsRouteEnabled(env)) {
        return {
          command,
          engine: "python",
          reason: `list ${listTarget} TS route disabled by MIRROR_TS_EXTENSIONS`,
        };
      }
      return { command, engine: "ts", reason: `DS7.TS4 list ${listTarget} ported to TS` };
    }
    // Anything else is `cmd_list`'s usage refusal, which TS reproduces only for
    // the targets it owns.
    return { command, engine: "python", reason: "list target not ported to TS" };
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
    return {
      command,
      engine: "python",
      reason: `descriptor subcommand not ported to TS: ${argv[1] || "(none)"}`,
    };
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
          reason: "week save TS route disabled by MIRROR_TS_WEEK=0",
        };
      }
      return { command, engine: "ts", reason: "DS7.US11 week save (deterministic) ported to TS" };
    }
    if (sub === "plan") {
      // One model call, no embedding -- so it needs the LLM replay fixture
      // only, unlike `journal` which crosses the seam twice.
      return providerRoute(command, env, WEEK_PLAN_TRANSPORT, "plan");
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
      return providerRoute(command, env, CULTIVATION_SCAN_TRANSPORT, "shadow scan");
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
      const transport = resolveProviderTransport(env, CONVERSATION_TAIL_TRANSPORT);
      if (transport.mode === "python") {
        return { command, engine: "python", reason: `${transport.reason} (${sub})` };
      }
      if (transport.mode === "replay") {
        return { command, engine: "ts", reason: `${transport.reason} (${sub})` };
      }
      return { command, engine: "ts", reason: `${transport.reason} (${sub})` };
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
    // Allowlist, not blocklist. The updater and release machinery are DS10's:
    // a subcommand this build has never heard of must not acquire a TS route
    // because `runtime` already has one.
    if (!TS_RUNTIME_READ_SUBCOMMANDS.has(subcommand)) {
      if (DS10_RUNTIME_SUBCOMMANDS.has(subcommand)) {
        return {
          command,
          engine: "python",
          reason: `runtime ${subcommand} is the git-based updater/release machinery, redesigned in DS10`,
        };
      }
      // CV22.DS10.US2: the unknown answer is TypeScript's own. It used to fall
      // through to Python's argparse; at TS5 there is no Python to fall
      // through to, and an unowned answer is how a surface disappears without
      // anyone deciding to remove it.
      return {
        command,
        engine: "ts",
        reason: `unknown runtime subcommand: ${subcommand || "(none)"}`,
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
        // Same shape as every other family's revert (`<VAR>=0 revert to
        // Python`); the odd one out was a US3 review finding, swept in TS2.
        reason: "MIRROR_TS_SOUL=0 revert to Python",
      };
    }
    // `harvest save` is the one leaf that crosses the provider seam, through
    // the embedding alone. Without the replay transport it stays on Python, the
    // same boundary US10's close tail draws; the live call is DS8's.
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
    // `story promote` ends in a Builder session start (`cmd_story_promote`
    // calls `cmd_load`), so it answers to the SAME composed decision `build
    // load` does: `MIRROR_TS_BUILD=0`, `MIRROR_TS_SEARCH=0`, or
    // `MIRROR_TS_CONVERSATION_LLM_TAIL=0` each send it to Python. Resolved here
    // rather than inside the route because promote's writes are not idempotent
    // -- once the story is promoted a second run finds none -- so the engine
    // must be decided before the first mutation, not after.
    if (subcommand === "story" && exploreStoryAction(argv) === "promote") {
      return providerRoute(command, env, BUILD_LOAD_COMPOSITION, "story promote");
    }
    return { command, engine: "ts", reason: `DS7.US7 explore ${subcommand} ported to TS` };
  }

  if (command === "build") {
    const subcommand = argv[1] ?? "";
    if (subcommand === "refinement-story" || subcommand === "change-request") {
      const action = argv[2] ?? "";
      const known = TS_BUILD_WORKBENCH_ACTIONS[subcommand].has(action);
      return {
        command,
        engine: "python",
        reason: known
          ? `build ${subcommand} ${action} retires unported in DS10`
          : `build ${subcommand} action not ported to TS: ${action || "(none)"}`,
      };
    }
    if (!TS_BUILD_SUBCOMMANDS.has(subcommand)) {
      return {
        command,
        engine: "python",
        reason: `build subcommand not ported to TS: ${subcommand || "(none)"}`,
      };
    }
    if (!buildGateEnabled(env)) {
      return { command, engine: "python", reason: "MIRROR_TS_BUILD=0 revert to Python" };
    }
    // `load` composes the search and conversation-tail provider families. Its
    // engine must be chosen before the banner or any surface is printed.
    if (subcommand === "load") {
      return providerRoute(command, env, BUILD_LOAD_COMPOSITION, "load");
    }
    return { command, engine: "ts", reason: `DS7.US8 build ${subcommand} ported to TS` };
  }

  if (command === "journal") {
    return providerRoute(command, env, JOURNAL_TRANSPORT);
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

// CV22.DS7.US8: the Builder/Ariad tree. Flipped 2026-09-16 after the Navigator
// validated the gated route on the real home -- the four read-only leaves
// byte-identical, a live `build load` on two real-database copies identical on
// all four faces, a full story lifecycle on real-database copies and scratch
// clones diff-clean at every step, and the revert exercised.
//
// ONE gate for the whole family, like Soul and Explorer: Builder is a lived
// mode whose lifecycle writes one cursor row, and a half-flipped lifecycle
// cannot be reviewed. `MIRROR_TS_BUILD=0` is the revert control, with no code
// change and no data migration; `load` additionally honors the search and
// conversation-tail reverts through its composed transport decision.
function buildGateEnabled(env: RouteEnvironment): boolean {
  return env.MIRROR_TS_BUILD !== "0";
}

// Python's argparse subcommands for `explore`, by name.
// CV22.DS7.US11. `week save` is deterministic and carries an ordinary revert
// gate; `week plan` needs this gate AND the LLM replay fixture. FLIPPED
// 2026-09-09: default ON, `=0` is the revert control with no code change and
// no data migration. `week view` deliberately stays outside this gate -- it
// was flipped ungated in US2 and reverting `save`/`plan` must not drag a
// previously unrevertible read back to Python.
function weekGateEnabled(env: RouteEnvironment): boolean {
  return env.MIRROR_TS_WEEK !== "0";
}

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
