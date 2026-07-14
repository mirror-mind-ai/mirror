// Node runtime support check for the front door (CR025).
//
// Kept in its own module so it is importable without executing the CLI entry
// (`cli.ts` runs `main()` at module load). The front door calls this first.

/** Minimum Node major the TS core supports (node:sqlite + TS type-stripping). */
export const MINIMUM_NODE_MAJOR = 24;

/**
 * Return an actionable message when `version` is below the supported Node
 * major, or null when it is fine. Pure and side-effect-free. (On Node too old
 * to strip TypeScript the front door never loads at all — that band is covered
 * by the documented prerequisite, not this guard.)
 */
export function nodeVersionError(version: string): string | null {
  const major = Number(version.split(".")[0]);
  if (Number.isFinite(major) && major < MINIMUM_NODE_MAJOR) {
    return (
      `Mirror TS front door requires Node >= ${MINIMUM_NODE_MAJOR} (running ${version}). ` +
      "Upgrade Node (https://nodejs.org/) — node:sqlite and TypeScript execution need it."
    );
  }
  return null;
}
