// Conversation metadata lifecycle decision policy (CV22.DS7.US10 slice C′).
//
// A faithful TypeScript port of `src/memory/services/metadata_lifecycle.py`,
// plus the `title_needs_improvement` predicate the engine receives as an
// injected callable (`ConversationService.title_needs_improvement`).
//
// This engine is what makes the close tail expensive: `end_conversation`
// finalizes non-manual metadata through it, and its per-field decisions —
// combined with the execution profile — determine whether a title, summary, or
// tag set is generated through the LLM at all. Getting a decision wrong here
// does not just diverge a report; it changes how many model calls the close
// tail makes.
//
// Like Python's module, this is pure: it reads no storage, no clock, and no
// provider. Callers supply the conversation, messages, and parsed metadata.
//
// Two regex fidelity notes, because Python and JavaScript disagree by default:
//   * Python's `\w` is Unicode-aware in `str` patterns; JavaScript's is ASCII.
//     Every ported pattern therefore spells the class out with `\p{L}\p{N}_`
//     under the `u` flag, so accented content (routine in this corpus) is
//     classified identically.
//   * Python's `\b` is likewise Unicode-aware. The transcript probe replaces it
//     with an explicit `(?<![\p{L}\p{N}_])` lookbehind rather than JS `\b`.

/** The conversation fields the lifecycle policy reads. */
export interface ConversationLike {
  id: string;
  title?: string | null;
  summary?: string | null;
  tags?: string | null;
  metadata?: string | null;
}

/** The message fields the lifecycle policy reads. */
export interface MessageLike {
  role: string;
  content: string;
}

/** Execution posture for applying metadata lifecycle decisions. */
export interface MetadataExecutionProfile {
  name: string;
  titleApplyDecisions: ReadonlySet<string>;
  summaryApplyDecisions: ReadonlySet<string>;
  tagsApplyDecisions: ReadonlySet<string>;
  forceRegenerate: boolean;
  preserveManual: boolean;
}

/** One field's lifecycle decision report. Shape mirrors Python's dicts. */
export type FieldReport = Record<string, unknown>;

export interface MetadataLifecycleReport {
  conversation_id: string;
  mode: string;
  mutated: boolean;
  metadata_lifecycle_version: number;
  fields: { title: FieldReport; summary: FieldReport; tags: FieldReport };
}

export interface LifecycleDeps {
  titleNeedsImprovement: (conversation: ConversationLike) => boolean;
}

function profile(
  name: string,
  titleApply: string[],
  summaryApply: string[],
  tagsApply: string[],
  forceRegenerate = false,
  preserveManual = true,
): MetadataExecutionProfile {
  return {
    name,
    titleApplyDecisions: new Set(titleApply),
    summaryApplyDecisions: new Set(summaryApply),
    tagsApplyDecisions: new Set(tagsApply),
    forceRegenerate,
    preserveManual,
  };
}

export const METADATA_EXECUTION_PROFILES: Readonly<Record<string, MetadataExecutionProfile>> = {
  manual_safe: profile("manual_safe", ["create", "repair"], ["create"], ["create"]),
  backfill_safe: profile("backfill_safe", ["create", "repair"], ["create"], ["create"]),
  backfill_force: profile(
    "backfill_force",
    ["create", "repair", "keep", "refine_candidate"],
    ["create", "keep", "refine_candidate"],
    ["create", "keep"],
    true,
  ),
  close_time: profile(
    "close_time",
    ["create", "repair", "keep", "refine_candidate"],
    ["create", "keep", "refine_candidate"],
    ["create", "keep"],
    true,
  ),
  active_runtime: profile("active_runtime", ["create"], [], []),
};

/** Return a named metadata execution profile. Mirrors Python's ValueError. */
export function metadataExecutionProfile(name: string): MetadataExecutionProfile {
  const found = METADATA_EXECUTION_PROFILES[name];
  if (!found) throw new Error(`Unknown metadata execution profile: ${name}`);
  return found;
}

/** Return the profile action for one field report. */
export function metadataProfileAction(
  executionProfile: MetadataExecutionProfile,
  field: string,
  report: FieldReport,
): string {
  const decision = report.decision;
  if (
    field === "title" &&
    report.lock_state === "manual_locked" &&
    executionProfile.preserveManual
  ) {
    return "preserve_manual";
  }
  if (decision === "defer") return "defer";
  if (decision === "preserve") return "preserve_manual";

  const applyDecisions =
    field === "title"
      ? executionProfile.titleApplyDecisions
      : field === "summary"
        ? executionProfile.summaryApplyDecisions
        : field === "tags"
          ? executionProfile.tagsApplyDecisions
          : null;
  if (applyDecisions && typeof decision === "string" && applyDecisions.has(decision)) {
    return executionProfile.forceRegenerate ? "regenerate" : "apply";
  }
  if (decision === "refine_candidate") return "review";
  return "skip";
}

/** Return metadata lifecycle decisions without mutating conversation state. */
export function dryRunMetadataLifecycle(
  conversation: ConversationLike,
  messages: MessageLike[],
  metadata: Record<string, unknown>,
  deps: LifecycleDeps,
): MetadataLifecycleReport {
  const titleReport = dryRunTitleLifecycle(conversation, messages, metadata, deps);
  const summaryReport = dryRunSummaryLifecycle(conversation, messages);
  const tagsReport = dryRunTagsLifecycle(conversation, messages);
  return {
    conversation_id: conversation.id,
    mode: "dry_run",
    mutated: false,
    metadata_lifecycle_version: 1,
    fields: { title: titleReport, summary: summaryReport, tags: tagsReport },
  };
}

/** Return title lifecycle decision for a conversation. */
export function dryRunTitleLifecycle(
  conversation: ConversationLike,
  messages: MessageLike[],
  metadata: Record<string, unknown>,
  deps: LifecycleDeps,
): FieldReport {
  const title = (conversation.title ?? "").trim();
  const lockState = titleIsManual(metadata) ? "manual_locked" : "unlocked";

  if (lockState === "manual_locked") {
    return {
      decision: "preserve",
      reason: "manual title lock is preserved",
      current_value: title || null,
      readiness: "locked",
      provenance: metadata.title_source ?? "manual",
      lock_state: lockState,
    };
  }
  if (!messagesAreTitleable(messages)) {
    return {
      decision: "defer",
      reason: "conversation needs at least one user and one assistant message",
      current_value: title || null,
      readiness: "not_ready",
      provenance: metadata.title_source ?? null,
      lock_state: lockState,
    };
  }

  let confidence: string | null = null;
  let decision: string;
  let reason: string;

  if (!title) {
    decision = "create";
    reason = "conversation has no title";
  } else if (deps.titleNeedsImprovement(conversation)) {
    decision = "repair";
    reason = "current title is provisional or weak";
  } else {
    const refinementEvidence = titleRefinementEvidence(conversation);
    if (refinementEvidence) {
      return {
        decision: "refine_candidate",
        reason: "later evidence is more specific than the current unlocked title",
        current_value: title || null,
        readiness: "ready",
        provenance: metadata.title_source ?? null,
        lock_state: lockState,
        confidence: refinementEvidence.confidence,
        evidence: refinementEvidence,
      };
    }
    if (titleMayNeedCoherenceRefinement(messages, metadata)) {
      decision = "refine_candidate";
      reason = "conversation has enough later context for coherence refinement";
      confidence = "low";
    } else {
      decision = "keep";
      reason = "current title appears usable";
      confidence = null;
    }
  }

  const report: FieldReport = {
    decision,
    reason,
    current_value: title || null,
    readiness: "ready",
    provenance: metadata.title_source ?? null,
    lock_state: lockState,
  };
  if (confidence) report.confidence = confidence;
  return report;
}

/** Return summary lifecycle decision for a conversation. */
export function dryRunSummaryLifecycle(
  conversation: ConversationLike,
  messages: MessageLike[],
): FieldReport {
  const summary = (conversation.summary ?? "").trim();
  if (summary) {
    const qualityIssues = summaryQualityIssues(summary);
    if (qualityIssues.length > 0) {
      return {
        decision: "refine_candidate",
        reason: "stored summary needs editorial refinement",
        // Python reports the raw stored value here, not the stripped one.
        current_value: conversation.summary ?? null,
        readiness: "ready",
        provenance: "stored",
        evidence: { quality_issues: qualityIssues },
      };
    }
    return {
      decision: "keep",
      reason: "summary already exists",
      current_value: conversation.summary ?? null,
      readiness: "ready",
      provenance: "stored",
    };
  }
  if (substantiveMessages(messages).length >= 4) {
    return {
      decision: "create",
      reason: "conversation has enough substance for a summary",
      current_value: null,
      readiness: "ready",
      provenance: null,
    };
  }
  return {
    decision: "defer",
    reason: "summary needs more conversation substance",
    current_value: null,
    readiness: "not_ready",
    provenance: null,
  };
}

/** Return user-facing quality issues for stored conversation summaries. */
export function summaryQualityIssues(summary: string): string[] {
  const issues: string[] = [];
  if (summary.length > 900) issues.push("too_long");
  if (/(^|\n)\s*(?:[-*]|\d+[.)])\s+/u.test(summary)) issues.push("contains_bullets");
  if (/\*\*|__|`/u.test(summary)) issues.push("contains_markdown");
  if (/(?:\/Users\/|~\/|[A-Za-z]:\\|\/[\p{L}\p{N}_ .~:-]+\/[\p{L}\p{N}_ .~:-]+)/u.test(summary)) {
    issues.push("contains_paths");
  }
  if (/(?<![\p{L}\p{N}_])(user|assistant|mirror|você|eu):/iu.test(summary)) {
    issues.push("looks_like_transcript");
  }
  return issues;
}

/** Return tags lifecycle decision for a conversation. */
export function dryRunTagsLifecycle(
  conversation: ConversationLike,
  messages: MessageLike[],
): FieldReport {
  const currentTags = conversation.tags;
  if (currentTags && !["[]", "null"].includes(currentTags.trim())) {
    return {
      decision: "keep",
      reason: "tags already exist",
      current_value: currentTags,
      readiness: "ready",
      provenance: "stored",
    };
  }
  if (substantiveMessages(messages).length >= 4 || (conversation.summary ?? "").trim()) {
    return {
      decision: "create",
      reason: "conversation has enough substance for tags",
      current_value: null,
      readiness: "ready",
      provenance: null,
    };
  }
  return {
    decision: "defer",
    reason: "tags need more conversation substance",
    current_value: null,
    readiness: "not_ready",
    provenance: null,
  };
}

function substantiveMessages(messages: MessageLike[]): MessageLike[] {
  return messages.filter(
    (msg) => (msg.role === "user" || msg.role === "assistant") && msg.content.trim(),
  );
}

/** Return true when messages contain enough exchange context for title work. */
export function messagesAreTitleable(messages: MessageLike[]): boolean {
  const hasUser = messages.some((msg) => msg.role === "user" && msg.content.trim());
  const hasAssistant = messages.some((msg) => msg.role === "assistant" && msg.content.trim());
  return hasUser && hasAssistant;
}

/** Return true when title metadata records a manual lock/source. */
export function titleIsManual(metadata: Record<string, unknown>): boolean {
  return metadata.title_status === "manual" || metadata.title_source === "manual";
}

/** Return true for generated titles with enough later context to revisit. */
export function titleMayNeedCoherenceRefinement(
  messages: MessageLike[],
  metadata: Record<string, unknown>,
): boolean {
  if (metadata.title_status !== "generated") return false;
  return messages.filter((msg) => msg.role === "user" || msg.role === "assistant").length >= 6;
}

export interface TitleRefinementEvidence {
  confidence: string;
  title_terms: string[];
  summary_specific_terms: string[];
  overlap_terms: string[];
}

/** Return evidence when the summary carries substantially more specificity. */
export function titleRefinementEvidence(
  conversation: ConversationLike,
): TitleRefinementEvidence | null {
  const titleTerms = meaningfulTerms(conversation.title ?? "");
  const summaryTerms = meaningfulTerms(conversation.summary ?? "");
  if (titleTerms.size < 2 || summaryTerms.size < 8) return null;

  const additionalTerms = sortByCodePoint([...summaryTerms].filter((t) => !titleTerms.has(t)));
  if (additionalTerms.length < 6) return null;

  const overlap = sortByCodePoint([...titleTerms].filter((t) => summaryTerms.has(t)));
  return {
    confidence: additionalTerms.length >= 10 ? "medium" : "low",
    title_terms: sortByCodePoint([...titleTerms]),
    summary_specific_terms: additionalTerms.slice(0, 12),
    overlap_terms: overlap.slice(0, 8),
  };
}

/**
 * Return coarse meaningful terms for structural title-vs-summary comparison.
 *
 * The character class reproduces Python's `[\wÀ-ÿ]` exactly: Unicode word
 * characters plus the literal `À-ÿ` range — which, as in Python, also admits
 * `×` (U+00D7) and `÷` (U+00F7).
 */
export function meaningfulTerms(text: string): Set<string> {
  const stopWords = new Set([
    "about",
    "after",
    "also",
    "antes",
    "com",
    "como",
    "das",
    "dos",
    "for",
    "from",
    "into",
    "mais",
    "não",
    "para",
    "pela",
    "pelo",
    "por",
    "que",
    "the",
    "uma",
    "vamos",
    "with",
    "work",
    "working",
  ]);
  const matches = text.match(/[\p{L}\p{N}_\u00C0-\u00FF]{4,}/gu) ?? [];
  const terms = new Set(matches.map((token) => token.toLowerCase()));
  return new Set([...terms].filter((term) => !stopWords.has(term)));
}

/** Sort by Unicode code point, matching Python's `sorted()` on strings. */
function sortByCodePoint(values: string[]): string[] {
  return [...values].sort((a, b) => {
    const aPoints = [...a].map((c) => c.codePointAt(0) ?? 0);
    const bPoints = [...b].map((c) => c.codePointAt(0) ?? 0);
    const shared = Math.min(aPoints.length, bPoints.length);
    for (let i = 0; i < shared; i += 1) {
      if (aPoints[i] !== bPoints[i]) return (aPoints[i] as number) - (bPoints[i] as number);
    }
    return aPoints.length - bPoints.length;
  });
}

/**
 * Mirror of `ConversationService.title_needs_improvement`.
 *
 * The engine receives this as an injected predicate; it lives here so the pure
 * decision core is testable without a Store, exactly as Python's module is.
 */
export function titleNeedsImprovement(conversation: ConversationLike): boolean {
  let metadata: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(conversation.metadata || "{}");
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      metadata = parsed as Record<string, unknown>;
    }
  } catch {
    metadata = {};
  }
  if (metadata.title_status === "manual" || metadata.title_source === "manual") return false;
  const title = (conversation.title ?? "").trim();
  if (!title) return true;
  if (metadata.title_status === "provisional") return true;
  if (title.endsWith("...") || title.includes("...")) return true;
  if (title.length >= 55) return true;
  if (title.toLowerCase().startsWith("<skill")) return true;
  return false;
}
