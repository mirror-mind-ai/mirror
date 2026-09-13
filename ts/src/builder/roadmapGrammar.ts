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
