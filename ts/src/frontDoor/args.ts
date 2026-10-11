// Argv option helpers for the front door.
//
// Small, dependency-free parsing primitives shared by the CLI entry and the
// DB-path resolver. All options handled here are value-carrying flags
// (`--name value`); `stripOptionWithValue` removes both tokens.

/** Return the value following `--name`, or null when the flag is absent. */
export function optionValue(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

/** Whether the flag is present at all. */
export function hasOption(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

/** Remove `--name` AND its following value from the argv slice. */
export function stripOptionWithValue(args: readonly string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name) {
      i += 1;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}
