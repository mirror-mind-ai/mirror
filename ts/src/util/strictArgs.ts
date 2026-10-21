// argparse-shaped strict parsing: every option declared, anything else refused.
//
// Moved from `dbSafetyToolsRoute.ts`, where `backup` and `repair-encoding` use
// it, when CR154 needed the same strictness for `conversations imported`. The
// reason is the same in all three: these commands write, and a lenient parser
// turns a typo into a different command. Under the `conversations` listing's
// parser, which ignores what it does not know, `remove --all --projet <folder>
// --apply` would drop the misspelled filter and remove every import in the
// home. Here the typo is refused, and nothing runs.
//
// Positionals are opt-in, for a grammar that takes them (CR154's ids). A token
// that starts with `-` is never a positional: an option nobody declared is a
// typo, not a value.

export interface StrictArgsSpec {
  /** Options that stand alone. */
  readonly flags: readonly string[];
  /** Options that take the next token as their value, whatever it looks like. */
  readonly valued: readonly string[];
  /** Whether bare tokens are accepted, in order; otherwise they are unrecognized. */
  readonly positionals?: boolean;
}

export interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string>;
  positionals: string[];
  /** argparse's message for the first problem, or null. */
  error: string | null;
}

export function parseArgs(args: readonly string[], spec: StrictArgsSpec): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positionals: string[] = [];
  const unrecognized: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;
    if (spec.flags.includes(arg)) {
      flags.add(arg);
    } else if (spec.valued.includes(arg)) {
      const value = args[index + 1];
      if (value === undefined)
        return { flags, values, positionals, error: `argument ${arg}: expected one argument` };
      values.set(arg, value);
      index += 1;
    } else if (spec.positionals === true && !arg.startsWith("-")) {
      positionals.push(arg);
    } else {
      unrecognized.push(arg);
    }
  }
  return {
    flags,
    values,
    positionals,
    error: unrecognized.length > 0 ? `unrecognized arguments: ${unrecognized.join(" ")}` : null,
  };
}
