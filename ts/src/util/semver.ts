// Version comparison, once. (CV22.DS10.US3 plateau 4)
//
// Three readers compared versions before this module and each carried its own
// copy: the release-notes reader (the oracle's `_parse_semver`), the welcome
// card's remote tag (the oracle's `_semver_key`, the same function under a
// second name), and now the package updater's plan, which has to know whether
// a channel is ahead of or BEHIND the installed version. One rule for all
// three, with the oracle's sort behavior kept: an unparseable version sorts
// below every real one.

export type SemverTriple = [number, number, number];

const LOOSE = /^v?(\d+)\.(\d+)\.(\d+)$/;
/** No leading `v`, no prerelease, no build, no surrounding space. */
const PLAIN = /^\d+\.\d+\.\d+$/;

/** Port of `_parse_semver`: an unparseable version is `[-1, -1, -1]`. */
export function parseSemver(version: string): SemverTriple {
  const match = LOOSE.exec(version.trim());
  if (!match) return [-1, -1, -1];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negative when `a` is older than `b`, positive when newer, zero when equal. */
export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] as number) - (right[index] as number);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The strict form: a bare numeric triple and nothing else.
 *
 * This is what a registry's dist-tag answer must look like before it becomes
 * the spec of `npm install -g <name>@<value>`. npm's spec grammar also admits
 * tags, ranges, URLs, and paths, and a value that is one of those installs
 * something other than a version.
 */
export function isPlainSemver(version: string): boolean {
  return PLAIN.test(version);
}
