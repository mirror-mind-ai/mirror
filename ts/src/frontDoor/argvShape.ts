// One argv shape for the families that accept options before their subcommand
// (CV22.DS10.TS5 plateau 2, inventory finding F5).
//
// The oracle's parsers take `week --mirror-home H save` as readily as `week save
// --mirror-home H` -- `week`'s own usage line documents the first form -- but
// routing and several handlers read the subcommand by POSITION. So a
// flag-first invocation was answered by Python in five families, and in two
// already on TypeScript it was answered wrongly: `tasks --mirror-home H add "x"`
// printed the task list and wrote nothing, and `journey --mirror-home H update
// <slug> <content>` rendered a status read.
//
// Rather than teach every router branch and handler to skip options, the front
// door rewrites the argv ONCE, before routing, into the subcommand-first shape
// every route already answers. Measured pairwise against the oracle before it
// was deleted: every flag-first form answers byte-identically once rewritten
// (the story's test guide carries the evidence).
//
// Deliberately narrow. Only options the oracle's parser declares BEFORE the
// subcommand move; anything else leaves the argv exactly as given, so a family
// keeps its own answer for a shape it does not accept -- including `-h`.

interface LeadingOptions {
  /** Options that take the next token as their value. */
  readonly withValue: ReadonlySet<string>;
  /** Options that stand alone. */
  readonly flags: ReadonlySet<string>;
  /** What the oracle runs when options are given and no subcommand is. */
  readonly defaultSubcommand?: string;
}

/**
 * `--db-path` is the front door's own option, not the oracle's: the fallback
 * used to strip it and pass `DB_PATH` instead, so every family here accepted
 * it before its subcommand by way of Python. It keeps doing so.
 */
const HOME_OPTIONS = ["--mirror-home", "--db-path"] as const;

/**
 * Each family's parent-parser options, read from the oracle's source:
 * `journey` uses `parse_known_args` for `--mirror-home` anywhere; `week`,
 * `descriptor`, and `tasks` are argparse with parent options; `list`,
 * `extensions`, and `inspect` scan their options from anywhere in argv.
 *
 * Families whose oracle REJECTS a leading option -- `build`, `identity`,
 * `runtime`, `consolidate`, `shadow`, `mirror`, `soul`, `explore`,
 * `conversations` -- are absent on purpose. `mode`, `conversation-logger`,
 * and `ext` are absent because their routes already find the subcommand past
 * the options.
 */
const LEADING_OPTIONS: Readonly<Record<string, LeadingOptions>> = {
  extensions: {
    withValue: new Set([...HOME_OPTIONS, "--extensions-root", "--runtime", "--target-root"]),
    flags: new Set(),
    defaultSubcommand: "list",
  },
  list: {
    withValue: new Set([...HOME_OPTIONS, "--extensions-root", "--runtime"]),
    flags: new Set(["--verbose"]),
    defaultSubcommand: "all",
  },
  inspect: {
    withValue: new Set([...HOME_OPTIONS, "--extensions-root"]),
    flags: new Set(),
  },
  descriptor: { withValue: new Set(HOME_OPTIONS), flags: new Set() },
  week: { withValue: new Set(HOME_OPTIONS), flags: new Set(), defaultSubcommand: "view" },
  tasks: {
    withValue: new Set([...HOME_OPTIONS, "--journey", "--status"]),
    flags: new Set(["--all"]),
    defaultSubcommand: "list",
  },
  journey: { withValue: new Set(HOME_OPTIONS), flags: new Set() },
};

/**
 * The argv with a family's leading options moved after its subcommand, in
 * their original order -- or the argv unchanged when there is nothing this
 * family accepts to move.
 */
export function canonicalArgv(argv: readonly string[]): readonly string[] {
  const [family, ...rest] = argv;
  const accepted = family === undefined ? undefined : LEADING_OPTIONS[family];
  if (family === undefined || accepted === undefined || !rest[0]?.startsWith("-")) return argv;

  const leading: string[] = [];
  let index = 0;
  while (index < rest.length && (rest[index] ?? "").startsWith("-")) {
    const option = rest[index] ?? "";
    const value = rest[index + 1];
    if (accepted.flags.has(option)) {
      leading.push(option);
      index += 1;
    } else if (accepted.withValue.has(option) && value !== undefined) {
      // The value is taken whatever it looks like: argparse reads
      // `--journey list` as the journey called "list".
      leading.push(option, value);
      index += 2;
    } else {
      return argv;
    }
  }

  const subcommand = rest.slice(index);
  if (subcommand.length > 0) return [family, ...subcommand, ...leading];
  return accepted.defaultSubcommand ? [family, accepted.defaultSubcommand, ...leading] : argv;
}
