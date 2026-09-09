// CV22.DS7.US7 plateau 3 — the Explorer → Builder handoff artifacts, ported
// from `src/memory/services/explorer_handoff.py`.
//
// This module writes five Markdown documents into the USER'S OWN PROJECT, under
// `<project>/docs/project/explorations/<slug>/`. That makes it the security
// boundary of the story: `obfuscateSensitiveText` is the last thing standing
// between a conversation transcript and a file the user commits, and an
// under-matching port does not fail loudly — it writes a real key into git.
//
// So none of the five patterns uses a JavaScript character class shorthand.
// Every one of them diverges from Python in a way the corpus proves:
//
//   * `\s` — Python includes U+001C-U+001F and excludes U+FEFF; JavaScript is
//     the exact opposite. The path pattern terminates on it.
//   * `\d` — Python matches EVERY Unicode decimal digit; JavaScript's `\d` is
//     ASCII-only. A phone number in Devanagari digits is redacted by the oracle
//     and, with `\d`, silently is not. Under-redaction is the dangerous
//     direction, and this is the one place the port could reach it.
//   * `\b` — Python's word boundary follows its Unicode-aware `\w`;
//     JavaScript's is ASCII. Reproduced with explicit lookarounds.
//   * `(?i)` — an inline flag JavaScript has no equivalent for; the whole
//     pattern takes `i` instead, which is equivalent only because no other part
//     of it is case-sensitive.
//
// Replacements are literal. `String.prototype.replace` interprets `$&`, `` $` ``,
// `$'`, `$1`, and `$$` in the REPLACEMENT string, so a redaction marker that
// happened to contain one would rewrite itself from the matched secret. The
// markers here are bracketed literals, and the one backreference is written
// deliberately as `$1`.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ExplorerBuilderHandoff, ExplorerStory } from "#explorer/story.ts";
import { PYTHON_WHITESPACE_CLASS } from "#util/pythonText.ts";
import { kebabSlug } from "#util/slug.ts";

export interface HandoffSourceMessage {
  readonly role: string;
  readonly content: string;
}

export interface HandoffConversationSource {
  readonly conversationId: string;
  readonly title: string | null;
  readonly role: string;
  readonly messages: readonly HandoffSourceMessage[];
}

// --- redaction -------------------------------------------------------------

/** Python's `\w`: `str.isalnum()` or underscore, so Unicode-aware. */
const PY_WORD = "\\p{L}\\p{N}_";
/** Python's `\d`: every Unicode decimal digit (category Nd), not `[0-9]`. */
const PY_DIGIT = "\\p{Nd}";

/**
 * Python's `\b` over the Unicode `\w` above.
 *
 * A negative lookbehind is NOT a word boundary, and the difference is visible:
 * `\b` asserts a TRANSITION — word-then-nonword or nonword-then-word — while
 * `(?<![\w])` only asserts "no word character behind". On `call +55 21 ...`
 * the position before `+` satisfies the lookbehind but is not a boundary, so
 * the oracle starts its match at the first digit and leaves the `+` in place.
 * A lookbehind-only port swallows the `+`, over-redacting by one character.
 */
const PY_BOUNDARY = `(?:(?<=[${PY_WORD}])(?![${PY_WORD}])|(?<![${PY_WORD}])(?=[${PY_WORD}]))`;

const REDACTIONS: readonly { pattern: RegExp; replacement: string }[] = [
  // `/Users/[^\s)\]]+`
  {
    pattern: new RegExp(`/Users/[^${PYTHON_WHITESPACE_CLASS})\\]]+`, "gu"),
    replacement: "[LOCAL_PATH]",
  },
  // `(?i)(api[_-]?key|token|secret|password)\s*=\s*[^\s]+`
  {
    pattern: new RegExp(
      `(api[_-]?key|token|secret|password)[${PYTHON_WHITESPACE_CLASS}]*=` +
        `[${PYTHON_WHITESPACE_CLASS}]*[^${PYTHON_WHITESPACE_CLASS}]+`,
      "giu",
    ),
    replacement: "$1=[SECRET]",
  },
  // `sk-[A-Za-z0-9_-]{12,}`
  { pattern: /sk-[A-Za-z0-9_-]{12,}/gu, replacement: "[SECRET]" },
  // `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`
  {
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu,
    replacement: "[PRIVATE_EMAIL]",
  },
  // `\b(?:\+?\d[\d .()-]{8,}\d)\b`
  {
    pattern: new RegExp(
      `${PY_BOUNDARY}(?:\\+?${PY_DIGIT}[${PY_DIGIT} .()-]{8,}${PY_DIGIT})${PY_BOUNDARY}`,
      "gu",
    ),
    replacement: "[PRIVATE_PHONE]",
  },
];

/**
 * Port of `_obfuscate_sensitive_text`. Applied to transcript text before it
 * reaches `full-conversation.md`.
 *
 * Ported at its current strength, gaps included — `/home/...` survives, and so
 * does a bearer token without an `=`. Strengthening the patterns would break
 * parity and is a product decision, not a port decision (US7 plan, Non-Goals).
 */
export function obfuscateSensitiveText(text: string): string {
  let redacted = text;
  for (const { pattern, replacement } of REDACTIONS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

// --- shared document fragments ---------------------------------------------

function renderAttractors(story: ExplorerStory): string {
  if (story.attractors.length === 0) return "_No attractors recorded._";
  const lines: string[] = [];
  for (const attractor of story.attractors) {
    lines.push(`- **${attractor.label}** (\`${attractor.status}\`)`);
    if (attractor.description) lines.push(`  - ${attractor.description}`);
  }
  return lines.join("\n");
}

function renderExperiment(story: ExplorerStory): string {
  const proposal = story.experimentProposal;
  if (!proposal) return "_No experiment proposal recorded._";
  const lines = [`**${proposal.title}** (\`${proposal.status}\`)`];
  if (proposal.description) lines.push("", proposal.description);
  return lines.join("\n");
}

function renderSourceEvidence(sources: readonly HandoffConversationSource[]): string {
  if (sources.length === 0) return "_No source conversations were attached to this handoff._";
  return sources
    .map(
      (source) =>
        `- \`${source.conversationId}\` — ${source.title || "Untitled conversation"} (${source.role})`,
    )
    .join("\n");
}

function renderDecidedProductDirection(story: ExplorerStory): string {
  const parts: string[] = [];
  if (story.currentExploratoryStory) parts.push(story.currentExploratoryStory);
  if (story.narrativeFieldSummary) parts.push(story.narrativeFieldSummary);
  return parts.join("\n\n") || "_No decided product direction recorded._";
}

function renderCompletenessChecklist(
  story: ExplorerStory,
  sources: readonly HandoffConversationSource[],
  includesFullConversation: boolean,
): string {
  const checks: readonly [string, boolean][] = [
    [
      "continuous exploratory thickening",
      Boolean(story.narrativeFieldSummary || story.lastStoryCard),
    ],
    ["source evidence list", sources.length > 0],
    ["surfaces and story state", Boolean(story.currentExploratoryStory)],
    ["phases or evolution narrative", Boolean(story.narrativeFieldSummary)],
    ["examples or simulations", includesFullConversation],
    ["product decisions", Boolean(story.currentExploratoryStory)],
    ["user conversation flows", includesFullConversation],
    ["transition rules", true],
    ["risks", true],
    ["boundaries", true],
    ["open questions", true],
    ["what Builder should preserve", true],
    ["what Builder should not assume", true],
  ];
  const lines = checks.map(([label, present]) => `- [${present ? "x" : " "}] ${label}`);
  const missing = checks.filter(([, present]) => !present).map(([label]) => label);
  if (missing.length > 0) {
    lines.push("", "Missing or weak evidence before Builder should treat this as complete:");
    lines.push(...missing.map((label) => `- ${label}`));
  }
  return lines.join("\n");
}

// --- documents -------------------------------------------------------------

function renderIndexDoc(
  story: ExplorerStory,
  options: {
    title: string;
    summary: string | null;
    editorialSynthesis: string | null;
    sourceConversations: readonly HandoffConversationSource[];
    includesFullConversation: boolean;
  },
): string {
  const fullConversationLine = options.includesFullConversation
    ? "- [Full Conversation Evidence](full-conversation.md): privacy-reviewed raw source material."
    : "- Full conversation evidence was not included in this handoff.";

  return `# Exploration Handoff: ${options.title}

## Editorial Synthesis

${options.editorialSynthesis || options.summary || story.narrativeFieldSummary || "_No editorial synthesis recorded._"}

## Durable Story

- Story id: \`${story.id || "not recorded"}\`
- Journey: \`${story.journey}\`
- Status: \`${story.status}\`

## Source Evidence

${renderSourceEvidence(options.sourceConversations)}

## What Was Decided

${renderDecidedProductDirection(story)}

## Transfer Documents

- [Exploratory Story](exploratory-story.md): discovery narrative and continuous thickening.
- [Handoff Info](handoff-info.md): risks, open questions, boundaries, and non-assumptions for Builder.
- [Product Design Proposal](product-design-proposal.md): user-facing product behavior, without implementation detail.
${fullConversationLine}

## Current Attractors

${renderAttractors(story)}

## Current Experiment Proposal

${renderExperiment(story)}

## Builder Reading Order

Read this \`index.md\` first, then \`exploratory-story.md\`, then \`handoff-info.md\`, then \`product-design-proposal.md\`. If \`full-conversation.md\` exists, read it as source evidence, not as a delivery plan. Treat the set as exploration output, not as a completed delivery plan.
`;
}

function renderExploratoryStoryDoc(
  story: ExplorerStory,
  options: { title: string; editorialSynthesis: string | null },
): string {
  return `# Exploratory Story: ${options.title}

## Source

- Journey: \`${story.journey}\`
- Story id: \`${story.id || "not recorded"}\`
- Mode: Explorer Mode

## Continuous Thickening Narrative

${options.editorialSynthesis || story.narrativeFieldSummary || "_No continuous thickening narrative recorded._"}

## Current Exploratory Story

${story.currentExploratoryStory || "_No story text recorded._"}

## Narrative Summary

${story.narrativeFieldSummary || "_No narrative summary recorded._"}

## Last Story Card

${story.lastStoryCard || "_No last story card recorded._"}

## Attractors

${renderAttractors(story)}

## Experiment Proposal

${renderExperiment(story)}

## What Changed Through Exploration

This section should preserve the evolution of the exploration: the original question, the meaningful pivots, the corrections that changed the story, and the current point of promotion. If this document was generated from a short runtime summary, Builder should ask the Navigator whether more conversation evidence must be folded in before roadmap work starts.
`;
}

function renderHandoffInfoDoc(
  story: ExplorerStory,
  options: {
    title: string;
    summary: string | null;
    sourceConversations: readonly HandoffConversationSource[];
    includesFullConversation: boolean;
  },
): string {
  return `# Handoff Info: ${options.title}

## Handoff Summary

${options.summary || story.narrativeFieldSummary || "_No handoff summary recorded._"}

## Handoff Completeness Checklist

${renderCompletenessChecklist(story, options.sourceConversations, options.includesFullConversation)}

## What Builder Should Preserve

- The exploration is not only a feature request. It carries discovery context and product judgment.
- The attractor and experiment proposal should guide Builder's first roadmap framing.
- The product design proposal should be translated into roadmap/story docs only after Builder reads the project.

## Risks

- Builder may over-treat exploratory material as settled delivery scope.
- Builder may flatten open questions into implementation assumptions.
- Builder may focus on mechanism before preserving the user-facing product shape.

## Open Questions

- Which parts of this exploration should become roadmap stories?
- What validation route proves the product behavior externally?
- What should remain outside the first delivery slice?

## Boundaries

- This handoff is not a delivery plan.
- Builder must still read the project, create or update roadmap/story docs, and validate with the Navigator.
- Explorer preserved uncertainty; Builder should not erase it prematurely.

## Non-Assumptions

- Do not assume implementation architecture from this handoff.
- Do not assume all open questions are in scope.
- Do not assume the experiment proposal has already been validated.

## Attractors

${renderAttractors(story)}

## Experiment Status

${renderExperiment(story)}

## Promotion Boundary

Builder executes only after explicit confirmation from the Navigator.
`;
}

function renderProductDesignDoc(
  story: ExplorerStory,
  options: { title: string; summary: string | null },
): string {
  return `# Product Design Proposal: ${options.title}

## Product Intent

${options.summary || story.narrativeFieldSummary || "_No product intent summary recorded._"}

## User-Facing Behavior

${story.currentExploratoryStory || "_No current story recorded._"}

## What The Product Should Feel Like

The product should preserve the exploratory shape discovered by Explorer Mode. It should show the user what is happening at the product level, not expose implementation mechanics first.

## Interaction Flow

- User works in Explorer Mode while uncertainty is still alive.
- Explorer surfaces story changes visibly.
- Explorer names attractors and proposes small experiments.
- Explorer proposes Builder handoff only when the user asks or confirms readiness.
- Builder begins only after explicit confirmation.

## Product-Level States

- Exploratory Story active.
- Attractor proposed or accepted.
- Experiment proposal proposed or accepted.
- Builder handoff proposed.

## Acceptance Behavior

- The user can understand what is being proposed without reading implementation details.
- The proposal preserves uncertainty and open questions.
- The proposal gives Builder enough product shape to create roadmap or story plans.

## Explicit Non-Goals

- This document does not define implementation architecture.
- This document does not create delivery tasks by itself.
- This document does not replace Builder planning.

## Open Product Questions

- Which behavior is necessary for the first delivery slice?
- What should remain exploratory after Builder starts?
- What user validation will prove the product behavior works?
`;
}

function renderFullConversationDoc(sources: readonly HandoffConversationSource[]): string {
  const sections: string[] = [
    "# Full Conversation Evidence",
    "",
    "This document is source evidence for a Builder handoff. Sensitive personal or local details may have been obfuscated before writing.",
  ];
  for (const source of sources) {
    sections.push(
      "",
      `## Conversation ${source.conversationId}`,
      "",
      `- Title: ${source.title || "Untitled conversation"}`,
      `- Evidence role: ${source.role}`,
    );
    for (const message of source.messages) {
      sections.push("", `### ${message.role}`, "", obfuscateSensitiveText(message.content));
    }
  }
  return `${sections.join("\n")}\n`;
}

// --- artifact write --------------------------------------------------------

export interface WriteHandoffOptions {
  readonly title: string;
  readonly summary?: string | null;
  readonly editorialSynthesis?: string | null;
  readonly sourceConversations?: readonly HandoffConversationSource[];
  readonly includeFullConversation?: boolean;
}

/**
 * Port of `write_builder_handoff_artifacts`.
 *
 * The directory name is `kebab_slug` of the caller-supplied title, falling back
 * to the story text, then the journey, then the literal `"exploration"`. The
 * collision loop appends `-2`, `-3`, ... and is a pre-existing TOCTOU race
 * (check-then-create); it is reproduced rather than fixed, because changing it
 * would be a behavior change hiding inside a port.
 *
 * `kebabSlug` collapses every non-alphanumeric run to a hyphen, so a
 * traversal-looking title cannot escape: `../../etc/passwd` slugs to
 * `etc-passwd`. The corpus proves that rather than the comment asserting it.
 */
export function writeBuilderHandoffArtifacts(
  projectPath: string,
  story: ExplorerStory,
  options: WriteHandoffOptions,
): ExplorerBuilderHandoff {
  const summary = options.summary ?? null;
  const sourceConversations = options.sourceConversations ?? [];
  const includeFullConversation = options.includeFullConversation ?? false;
  const fullConversationWritten = includeFullConversation && sourceConversations.length > 0;

  const explorationsRoot = join(projectPath, "docs", "project", "explorations");
  const slug =
    kebabSlug(options.title || story.currentExploratoryStory || story.journey) || "exploration";

  let base = join(explorationsRoot, slug);
  let suffix = 2;
  while (existsSync(base)) {
    base = join(explorationsRoot, `${slug}-${suffix}`);
    suffix += 1;
  }
  mkdirSync(base, { recursive: true });

  const indexPath = join(base, "index.md");
  const exploratoryStoryPath = join(base, "exploratory-story.md");
  const handoffInfoPath = join(base, "handoff-info.md");
  const productDesignPath = join(base, "product-design-proposal.md");
  const fullConversationPath = join(base, "full-conversation.md");

  writeFileSync(
    indexPath,
    renderIndexDoc(story, {
      title: options.title,
      summary,
      editorialSynthesis: options.editorialSynthesis ?? null,
      sourceConversations,
      includesFullConversation: fullConversationWritten,
    }),
    "utf-8",
  );
  writeFileSync(
    exploratoryStoryPath,
    renderExploratoryStoryDoc(story, {
      title: options.title,
      editorialSynthesis: options.editorialSynthesis ?? null,
    }),
    "utf-8",
  );
  writeFileSync(
    handoffInfoPath,
    renderHandoffInfoDoc(story, {
      title: options.title,
      summary,
      sourceConversations,
      includesFullConversation: fullConversationWritten,
    }),
    "utf-8",
  );
  writeFileSync(
    productDesignPath,
    renderProductDesignDoc(story, { title: options.title, summary }),
    "utf-8",
  );
  if (fullConversationWritten) {
    writeFileSync(fullConversationPath, renderFullConversationDoc(sourceConversations), "utf-8");
  }

  return {
    title: options.title,
    summary,
    readiness: "proposed",
    artifactDir: base,
    indexPath,
    exploratoryStoryPath,
    handoffInfoPath,
    productDesignProposalPath: productDesignPath,
    fullConversationPath: fullConversationWritten ? fullConversationPath : null,
  };
}
