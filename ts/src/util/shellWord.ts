// CR104 — one shell word for a value a printed command interpolates.
//
// Mirror prints commands for its reader to run: `Run: mirror build adopt --journey
// <slug> --method ariad`, the Pull command, a skipped seed entry's edit command.
// Agents run them as printed. A value that reaches such a command from the database
// — a journey slug, a persona id — may predate the grammar that now keeps new keys
// plain (`#identity/identityKey.ts`), so it can hold anything a shell reads as
// syntax. Every such command therefore quotes what it interpolates, here, once.
//
// CR002 wrote this for the Pull command, private to `scopePhrases.ts`; CR104 made
// it the one helper every printed command uses.

/**
 * A POSIX shell word for `value`: as is when it is a plain token, single-quoted
 * otherwise, so `x;touch PWNED` arrives as one argument and runs nothing. A plain
 * token prints unchanged, which keeps every ordinary slug byte-identical in the
 * commands that print it. The empty string becomes `''`, one empty argument.
 *
 * Quoting does not stop a word that begins with `-` from reading as an option to
 * the command it is passed to. That is the grammar's job, not the shell's.
 */
export function shellWord(value: string): string {
  if (/^[A-Za-z0-9._-]+$/u.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
