// CV22.DS7.US8 plateau 1 — shared parsing primitives for the roadmap grammars.
//
// Port of `src/memory/builder/roadmap_grammar.py`. Both the legacy
// `CV → Epic → Story` grammar and the Delivery Story grammar are parsed with
// these, and keeping them in one module is what stopped the heading/status
// regex drift that once made DS-grammar roadmaps unreadable while the CV
// grammar still worked.
//
// Three dialect traps, each of which a literal transcription of the Python
// patterns would walk into:
//
//   1. **`\s` is not `\s`.** In a Python `str` pattern `\s` is `str.isspace()`:
//      it INCLUDES U+001C–U+001F and U+0085 and EXCLUDES U+FEFF. JavaScript's
//      `\s` is the opposite on both counts. So these patterns are built from
//      `PYTHON_WHITESPACE_CLASS`, the set US6 established, rather than `\s`.
//   2. **`.` diverges on line separators.** Python's `.` (no DOTALL) excludes
//      only `\n`; JavaScript's excludes `\n`, `\r`, U+2028, and U+2029. A title
//      containing U+2028 therefore continues in Python and stops in JavaScript.
//      `[^\n]` restores Python's meaning.
//   3. **`str.strip()` is not `.trim()`**, same separator-set reason, so cell
//      trimming goes through `pyStrip`.
//
// And one that cost a test failure before it was found: **`re.MULTILINE` is not
// the `m` flag.** Python's MULTILINE `^`/`$` anchor at `\n` only, while
// JavaScript's `m` also anchors at `\r`, U+2028, and U+2029. With `m`, a lazy
// title followed by `$` stops at an embedded U+2028 and silently truncates —
// which is what the `line_separator` fixture caught. So the anchors are written
// out as `(?<=^|\n)` and `(?=\n|$)` and the `m` flag is deliberately absent.
//
// `re.fullmatch` maps to anchoring the pattern, not to `.test()` on a substring.

import { PYTHON_WHITESPACE_CLASS, pyStrip } from "#util/pythonText.ts";

const WS = `[${PYTHON_WHITESPACE_CLASS}]`;

/**
 * `# <code> — <title>`, multiline. Codes may carry dots (`CV2.DS1`), hyphens
 * (`DS-35`), dotted hyphenated children (`DS-35.US-1`), and a lowercase
 * sub-story suffix (`CV21.E2.S1b`). The separator is an em dash OR a hyphen.
 */
export const HEADING_RE = new RegExp(
  `(?<=^|\\n)#${WS}+(?<code>[A-Za-z0-9.\\-]+)${WS}+[—-]${WS}+(?<title>[^\\n]+?)${WS}*(?=\\n|$)`,
  "u",
);

/** `**Status:** <status>`. Unanchored at the start, exactly as Python's is. */
export const STATUS_RE = new RegExp(
  `\\*\\*Status:\\*\\*${WS}*(?<status>[^\\n]+?)${WS}*(?=\\n|$)`,
  "u",
);

/** `**Type:** <type>`. Lives beside the patterns it is parsed with. */
export const TYPE_RE = new RegExp(`\\*\\*Type:\\*\\*${WS}*(?<type>[^\\n]+?)${WS}*(?=\\n|$)`, "u");

/** A whole-cell `[label](target)` link. Anchored, to mean `re.fullmatch`. */
const MARKDOWN_LINK_RE = /^\[(?<label>[^\]]+)\]\((?<target>[^)]*)\)$/u;

export interface HeadingMatch {
  code: string;
  title: string;
}

/** First `# <code> — <title>` heading in a document, or `null`. */
export function matchHeading(content: string): HeadingMatch | null {
  const match = HEADING_RE.exec(content);
  if (!match?.groups) return null;
  return { code: match.groups.code, title: match.groups.title };
}

/** First `**Status:**` value in a document, or `null`. */
export function matchStatus(content: string): string | null {
  return STATUS_RE.exec(content)?.groups?.status ?? null;
}

/** First `**Type:**` value in a document, or `null`. */
export function matchType(content: string): string | null {
  return TYPE_RE.exec(content)?.groups?.type ?? null;
}

/**
 * Python `is_legacy_path`: true when the path sits under a `legacy/` component
 * of the roadmap root. Component-wise, not a substring test — a directory named
 * `non-legacy-notes` is not legacy.
 *
 * Python resolves both sides and returns `False` when the path lies outside the
 * root (`relative_to` raises). Callers here pass components already relative to
 * the root, so that case is an empty list.
 */
export function isLegacyPath(relativeComponents: readonly string[]): boolean {
  return relativeComponents.includes("legacy");
}

export interface MarkdownLink {
  label: string;
  target: string;
}

/** Python `parse_markdown_link`: a whole-cell link, or `null`. */
export function parseMarkdownLink(value: string): MarkdownLink | null {
  const match = MARKDOWN_LINK_RE.exec(pyStrip(value));
  if (!match?.groups) return null;
  return { label: match.groups.label, target: match.groups.target };
}

/** Python `strip_markdown_link`: the link's label, or the stripped raw value. */
export function stripMarkdownLink(value: string): string {
  return parseMarkdownLink(value)?.label ?? pyStrip(value);
}

/** A code span: a run of backticks up to the next run of the same length. */
const CODE_SPAN_RE = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/gu;

/** An inline link or image with a label, not escaped. The target may carry a quoted title. */
const INLINE_LINK_RE = /(?<!\\)!?\[([^\]\n]+)\]\([^)\n]*\)/gu;

/**
 * A title with every inline Markdown link or image reduced to its label (CR018).
 *
 * A relative link is true only in the file it was written in, and Ariad carries a title
 * into terminal cards, into files at other depths, and into folder names. So a title
 * enters Ariad this way, from the roadmap and from `--item-title` alike. What
 * `stripMarkdownLink` does for a cell that is one whole link is a case of this rule;
 * that function stays for codes.
 *
 * A link inside a code span is code and stays as written, as does a link with an empty
 * label, which has nothing to keep. Reference links (`[label][ref]`) and labels with
 * nested brackets are left alone.
 */
export function linkFreeTitle(title: string): string {
  let result = "";
  let last = 0;
  for (const span of title.matchAll(CODE_SPAN_RE)) {
    result += title.slice(last, span.index).replace(INLINE_LINK_RE, "$1");
    result += span[0];
    last = span.index + span[0].length;
  }
  return result + title.slice(last).replace(INLINE_LINK_RE, "$1");
}

/** Python `_CandidateChild`. */
export interface CandidateChild {
  readonly code: string;
  readonly title: string;
  readonly level: string;
  readonly status: string;
}

const REQUIRED_COLUMNS = ["code", "story", "type", "status"] as const;

/**
 * Python `_parse_candidate_stories`: a Delivery Story's `## Candidate Stories` table,
 * header-driven. Expand reads its children with it, and Pull asks it whether a
 * Delivery Story names a story (CR113), so the two read the table by one rule.
 *
 * Line-by-line rather than block-by-block, and the details matter:
 *
 *   * a non-table line BREAKS the scan once a header was found, but is SKIPPED
 *     before — so the first canonical table wins and nothing after it is read;
 *   * `line.strip("|")` removes every leading and trailing pipe, not one;
 *   * duplicate header names keep the LAST index, because Python builds the map
 *     with a dict comprehension over `enumerate`;
 *   * a row shorter than the widest required column is skipped, not an error,
 *     which is how a ragged authored table degrades instead of blocking.
 */
export function parseCandidateStories(content: string): CandidateChild[] {
  const children: CandidateChild[] = [];
  let columns: Map<string, number> | null = null;

  for (const rawLine of content.split("\n")) {
    const line = pyStrip(rawLine);
    if (!line.startsWith("|")) {
      if (columns !== null) break;
      continue;
    }
    const cells = stripPipes(line)
      .split("|")
      .map((cell) => pyStrip(cell));

    if (columns === null) {
      // `cell.lower()` — ASCII header names in practice; Python's `str.lower()`
      // and JavaScript's `toLowerCase()` differ only on characters no canonical
      // header uses (`İ`, `ẞ`), and a divergence there fails closed by not
      // matching the required set.
      const lowered = cells.map((cell) => cell.toLowerCase());
      if (REQUIRED_COLUMNS.every((name) => lowered.includes(name))) {
        columns = new Map();
        lowered.forEach((name, index) => {
          columns?.set(name, index);
        });
      }
      continue;
    }

    if (line.startsWith("|---")) continue;
    if (cells.every((cell) => cell === "")) continue;
    if (cells.every((cell) => [...cell].every((character) => character === "-"))) continue;

    const widest = Math.max(...[...columns.values()]);
    if (cells.length <= widest) continue;

    const code = stripMarkdownLink(cells[columns.get("code") ?? 0] ?? "");
    if (!code) continue;
    const typeText = (cells[columns.get("type") ?? 0] ?? "").toLowerCase();
    children.push({
      code,
      title: linkFreeTitle(cells[columns.get("story") ?? 0] ?? ""),
      level: typeText.includes("technical") ? "technical_story" : "user_story",
      status: cells[columns.get("status") ?? 0] ?? "",
    });
  }
  return children;
}

/** Python `str.strip("|")`: remove every leading and trailing pipe. */
function stripPipes(line: string): string {
  let start = 0;
  let end = line.length;
  while (start < end && line[start] === "|") start += 1;
  while (end > start && line[end - 1] === "|") end -= 1;
  return line.slice(start, end);
}
