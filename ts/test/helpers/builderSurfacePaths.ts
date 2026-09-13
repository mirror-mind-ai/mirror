// The TypeScript twin of `ts/parity/builder_surface_paths.py`.
//
// Test-only, and it must stay that way: production code renders exactly what
// Python renders, absolute paths included. This is the recording rule the corpus
// was generated under, so the comparison has to apply it to the TypeScript output
// too — otherwise the test compares a normalized golden against an unnormalized
// actual and fails for a reason that has nothing to do with parity.
//
// Why normalization is needed at all: `expand_decision` and `expand_blocked` print
// paths that `storyPaths` resolved to absolute (its confinement guard is only
// sound on absolutes), and `cardPrefixed` / `cardWrapped` then wrap them at 52 or
// 54 code points — so the absolute prefix's length decides where every chunk
// boundary falls, and the rows cannot match across two machines. CR082 is the
// record; the Python module's docstring carries the full rationale and the list of
// what stays graded.
//
// Keeping two implementations is a real cost, accepted because the alternative is
// shipping the rule in production code. Drift is self-detecting: if this twin
// stops matching the Python one, the byte comparison it exists to enable fails.

const PATH_ROW_MARKERS = ["✓ ", "○ ", "- ", "• ", "✕ ", "✎ ", "↻ ", "  "] as const;
const PATH_ROW_TOKEN = "<ABSOLUTE PATH>";
const ABSOLUTE_PATH_RE = /\/[^\s,'"]+/g;
const MIN_STANDALONE_FRAGMENT = 24;
// A wrapped path's final chunk can carry the punctuation that followed it in the
// sentence, because wrapping splits on whitespace rather than on tokens.
const TRAILING_PUNCTUATION = /[,;:.]+$/;
// `cardPrefixed` indents an item's continuation rows by two spaces, which is the
// root-independent signal that a row belongs to the item above it.
const CONTINUATION_MARKER = "  ";

/** Python `absolute_paths_in`: longest first, so a parent cannot corrupt a child. */
export function absolutePathsIn(message: string): string[] {
  const found = new Set<string>();
  for (const match of message.matchAll(ABSOLUTE_PATH_RE)) {
    found.add(match[0].replace(/\.+$/, ""));
  }
  return [...found].sort((a, b) => b.length - a.length);
}

/** Python `_card_row_content`. */
function cardRowContent(line: string): { fragment: string; marker: string } {
  if (!(line.startsWith("│ ") && line.endsWith("│"))) return { fragment: "", marker: "" };
  const inner = line.slice(2, -1).replace(/\s+$/u, "");
  for (const marker of PATH_ROW_MARKERS) {
    if (inner.startsWith(marker)) {
      return { fragment: inner.slice(marker.length).trim(), marker };
    }
  }
  return { fragment: inner, marker: "" };
}

/**
 * Python `normalize_path_rows`.
 *
 * Only a `/`-leading row may OPEN a run. Without that, a relativized row
 * (`docs/project/…`) is also a substring of the absolute path and the rule would
 * collapse the `artifacts_materialized` rows too, erasing content that is
 * machine-independent and must stay graded.
 *
 * A continuation row may carry trailing punctuation, because wrapping splits on
 * whitespace and `<path>,` is one word.
 *
 * A new run opens on the card's list MARKER, never on a leading `/`: where a
 * wrapped path splits depends on the prefix's LENGTH, so opening at every
 * `/`-leading row makes the row count depend on the root. That is not theory — the
 * same four paths normalized to eight rows under the generator's repo-relative root
 * and four under this test's `/tmp` root, which is how the flaw was found.
 */
export function normalizePathRows(text: string, absolutePaths: readonly string[]): string {
  if (absolutePaths.length === 0) return text;
  const normalized: string[] = [];
  let runPaths: string[] | null = null;
  for (const line of text.split("\n")) {
    const { fragment, marker } = cardRowContent(line);
    if (!fragment) {
      runPaths = null;
      normalized.push(line);
      continue;
    }
    const candidate = fragment.replace(TRAILING_PUNCTUATION, "");
    const matches = candidate ? absolutePaths.filter((path) => path.includes(candidate)) : [];
    let opensAllowed = true;
    if (marker !== "" && marker !== CONTINUATION_MARKER) {
      runPaths = null;
    } else if (runPaths !== null && matches.some((path) => runPaths?.includes(path))) {
      continue;
    } else {
      opensAllowed = runPaths === null;
    }
    if (
      opensAllowed &&
      fragment.startsWith("/") &&
      matches.length > 0 &&
      candidate.length >= MIN_STANDALONE_FRAGMENT
    ) {
      normalized.push(`${`│ ${marker}${PATH_ROW_TOKEN}`.padEnd(57)}│`);
      runPaths = matches;
      continue;
    }
    runPaths = null;
    normalized.push(line);
  }
  return normalized.join("\n");
}

/** Python `project_relative`. */
export function projectRelative(path: string, projectRoot: string): string {
  const relative = path.startsWith(projectRoot) ? path.slice(projectRoot.length) : null;
  if (relative === null) return "<OUTSIDE PROJECT>";
  const trimmed = relative.replace(/^\/+/, "");
  return trimmed === "" ? "." : trimmed;
}

/** Python `scrub_message`, scoped to one project root. */
export function scrubMessage(message: string, projectRoot: string): string {
  let result = message;
  for (const absolute of absolutePathsIn(message)) {
    if (!absolute.startsWith(projectRoot)) continue;
    result = result.replaceAll(absolute, projectRelative(absolute, projectRoot));
  }
  return result;
}
