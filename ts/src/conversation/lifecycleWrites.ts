/**
 * The ES-001 metadata-lifecycle WRITE faces — CV22.DS7.TS4 plateau 6.
 *
 * `conversations --metadata-lifecycle-apply <id> [--title/--summary/--tag]` and
 * `--metadata-lifecycle-demo`, the two faces US11 refused by name and handed
 * here (Navigator decision 2026-09-09, option B).
 *
 * This is the WRITE half of an engine already ported: every decision comes from
 * `dryRunMetadataLifecycle`, and what lands here is the bounded application of
 * those decisions. Three rules the corpus pinned and a reading of the code
 * would not give:
 *
 *   1. **A decision is not a permission.** `create` and `repair` apply a title;
 *      `preserve` and `refine_candidate` each skip with their OWN reason, and
 *      any other decision skips as `decision_<name>_not_applied` — but only
 *      when a value was actually offered. With no value the reason is
 *      `no_value_provided`, which is a different fact and is reported as one.
 *   2. **Tags ride the summary.** A `defer` tags decision still applies when a
 *      summary changed in the SAME call, because the deferral was waiting for
 *      exactly that substance. Alone, the same call skips.
 *   3. **The flag is `--tag`, singular and repeatable.** There is no `--tags`;
 *      the parser appends into `dest="tags"`. A port written from the parameter
 *      name would expose an option Python refuses.
 */

import type { ConversationLike, MetadataLifecycleReport } from "#conversation/metadataLifecycle.ts";
import type { WritableDatabase } from "#db/database.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";
import { sliceCodePoints } from "#util/pythonText.ts";
import {
  LifecycleFaceError,
  metadataDict,
  resolveConversation,
  runLifecycleDryRun,
} from "./lifecycleFaces.ts";

export interface ApplyMetadataLifecycleInput {
  title?: string | null;
  summary?: string | null;
  /** The repeated `--tag` values, or a pre-encoded string. */
  tags?: readonly string[] | string | null;
  source?: string;
}

export interface ApplyMetadataLifecycleReport {
  conversation_id: string;
  mode: "apply";
  mutated: boolean;
  changed: Record<string, unknown>;
  skipped: Record<string, string>;
  dry_run: MetadataLifecycleReport;
}

/** Port of `ConversationService._clean_title`. */
export function cleanTitle(title: string): string {
  const clean = title.trim().split(/\s+/u).filter(Boolean).join(" ");
  if (!clean) throw new LifecycleFaceError("title is required");
  if (clean.length > 160) throw new LifecycleFaceError("title must be at most 160 characters");
  return clean;
}

/**
 * Port of `ConversationService._title_metadata`.
 *
 * `previous_title` is recorded only when it differs from the one already
 * stored, so repeated applies do not overwrite the ORIGINAL title with the one
 * the previous apply wrote.
 */
export function titleMetadata(
  metadata: Record<string, unknown>,
  options: { source: string; status: string; previousTitle: string | null },
): Record<string, unknown> {
  const next = { ...metadata };
  if (options.previousTitle && options.previousTitle !== next.previous_title) {
    next.previous_title = options.previousTitle;
  }
  next.title_source = options.source;
  next.title_status = options.status;
  return next;
}

/** Port of `ConversationService.apply_metadata_lifecycle`. */
export function applyMetadataLifecycle(
  db: WritableDatabase,
  conversationId: string,
  input: ApplyMetadataLifecycleInput = {},
): ApplyMetadataLifecycleReport {
  const source = input.source ?? "metadata_lifecycle_apply";
  const conversation = resolveConversation(db, conversationId);
  const dryRun = runLifecycleDryRun(db, conversation.id);
  let metadata = metadataDict(conversation);
  const updates: Record<string, string> = {};
  const changed: Record<string, unknown> = {};
  const skipped: Record<string, string> = {};

  const title = input.title ?? null;
  const titleDecision = String(dryRun.fields.title.decision);
  if (titleDecision === "preserve") {
    skipped.title = "manual_lock_preserved";
  } else if (titleDecision === "refine_candidate") {
    skipped.title = "candidate_decision_requires_explicit_review";
  } else if ((titleDecision === "create" || titleDecision === "repair") && title !== null) {
    const clean = cleanTitle(title);
    updates.title = clean;
    metadata = titleMetadata(metadata, {
      source,
      status: "generated",
      previousTitle: conversation.title,
    });
    changed.title = clean;
  } else if (title !== null) {
    skipped.title = `decision_${titleDecision}_not_applied`;
  } else {
    skipped.title = "no_value_provided";
  }

  const summary = input.summary ?? null;
  const summaryDecision = String(dryRun.fields.summary.decision);
  if (summaryDecision === "create" && summary !== null) {
    const clean = summary.trim();
    if (clean) {
      // Python truncates with a slice, which counts CODE POINTS. A UTF-16
      // slice would cut an astral character in half at the boundary.
      updates.summary = sliceCodePoints(clean, 1000);
      metadata.summary_status = "generated";
      changed.summary = updates.summary;
    } else {
      skipped.summary = "blank_value";
    }
  } else if (summary !== null) {
    skipped.summary = `decision_${summaryDecision}_not_applied`;
  } else {
    skipped.summary = "no_value_provided";
  }

  const tags = input.tags ?? null;
  const tagsDecision = String(dryRun.fields.tags.decision);
  // Rule 2: a deferral waits for substance, and a summary landing in this same
  // call IS that substance.
  const tagsReadyAfterSummary = tagsDecision === "defer" && "summary" in changed;
  if ((tagsDecision === "create" || tagsReadyAfterSummary) && tags !== null) {
    updates.tags = typeof tags === "string" ? tags : pythonJsonDumps([...tags]);
    metadata.tags_status = "generated";
    changed.tags = tags;
  } else if (tags !== null) {
    skipped.tags = `decision_${tagsDecision}_not_applied`;
  } else {
    skipped.tags = "no_value_provided";
  }

  if (Object.keys(changed).length > 0) {
    metadata.metadata_lifecycle_version = 1;
    metadata.last_metadata_update_source = source;
    updates.metadata = pythonJsonDumps(metadata);
    updateConversation(db, conversation.id, updates);
  }

  return {
    conversation_id: conversation.id,
    mode: "apply",
    mutated: Object.keys(changed).length > 0,
    changed,
    skipped,
    dry_run: dryRun,
  };
}

/** Port of `ConversationStore.update_conversation`: the given columns, nothing else. */
export function updateConversation(
  db: WritableDatabase,
  conversationId: string,
  updates: Record<string, string>,
): void {
  const columns = Object.keys(updates);
  if (columns.length === 0) return;
  const assignments = columns.map((column) => `${column} = ?`).join(", ");
  db.prepare(`UPDATE conversations SET ${assignments} WHERE id = ?`).run(
    ...columns.map((column) => updates[column] as string),
    conversationId,
  );
}

/** The conversation columns the demo reports after applying. */
export interface ConversationAfter {
  title: string | null;
  summary: string | null;
  tags: string | null;
}

export interface MetadataLifecycleDemoReport {
  mode: "metadata_lifecycle_demo";
  uses_production_data: false;
  passed: boolean;
  checks: Record<string, boolean>;
  scenarios: Record<string, unknown>;
}

/**
 * Port of `_metadata_lifecycle_demo_report`.
 *
 * A controlled scenario over a throwaway database: it proves the three
 * decisions a reader most needs to trust — a provisional title is repaired, a
 * manual lock is preserved, and a refine candidate is refused — and it touches
 * no production data, which is the claim `uses_production_data: false` makes.
 *
 * The caller supplies the empty database, so the demo never decides where to
 * write. Python's is `sqlite3.connect(":memory:")`.
 */
export function metadataLifecycleDemoReport(
  db: WritableDatabase,
  seed: DemoSeed,
): MetadataLifecycleDemoReport {
  const repair = seed.startConversation("cli");
  seed.setProvisionalTitle(repair, "vamos trabalhar no maestro");
  seed.addMessage(repair, "user", "Vamos validar checkpoint visibility");
  seed.addMessage(repair, "assistant", "Vamos revisar o handoff");
  const preview = runLifecycleDryRun(db, repair);
  const apply = applyMetadataLifecycle(db, repair, {
    title: "Maestro checkpoint visibility validation",
    summary: "Conversation metadata lifecycle validation.",
    tags: ["metadata", "conversation"],
  });
  const afterApply = readConversation(db, repair);

  const manual = seed.startConversation("cli", "Initial title");
  seed.addMessage(manual, "user", "Quero corrigir títulos");
  seed.addMessage(manual, "assistant", "Vamos desenhar a correção");
  seed.updateTitle(manual, "Manual conversation title");
  const manualApply = applyMetadataLifecycle(db, manual, {
    title: "Generated replacement title",
  });

  const refine = seed.startConversation("cli", "Initial editorial session");
  seed.addMessage(refine, "user", "Let's begin");
  seed.addMessage(refine, "assistant", "Ready");
  updateConversation(db, refine, {
    summary:
      "Editorial workflow for Raphael Albino manuscript. Scrivener import, " +
      "cover briefing, Kindle export, EPUB validation, chapter cleanup, raw text hygiene.",
  });
  const refineApply = applyMetadataLifecycle(db, refine, {
    title: "Better editorial workflow title",
  });

  const checks = {
    preview_non_mutating: preview.mutated === false,
    apply_changed_title: apply.changed.title === "Maestro checkpoint visibility validation",
    manual_lock_preserved: manualApply.skipped.title === "manual_lock_preserved",
    refine_candidate_skipped:
      refineApply.skipped.title === "candidate_decision_requires_explicit_review",
  };
  return {
    mode: "metadata_lifecycle_demo",
    uses_production_data: false,
    passed: Object.values(checks).every(Boolean),
    checks,
    scenarios: {
      preview,
      apply: {
        report: apply,
        after: {
          title: afterApply?.title ?? null,
          summary: afterApply?.summary ?? null,
          tags: afterApply?.tags ?? null,
        },
      },
      manual_lock: manualApply,
      refine_candidate: refineApply,
    },
  };
}

/** What the demo needs from the conversation writer, injected rather than reached for. */
export interface DemoSeed {
  startConversation: (interfaceName: string, title?: string) => string;
  addMessage: (conversationId: string, role: string, content: string) => void;
  setProvisionalTitle: (conversationId: string, title: string) => void;
  updateTitle: (conversationId: string, title: string) => void;
}

function readConversation(db: WritableDatabase, conversationId: string): ConversationAfter | null {
  const row = db
    .prepare("SELECT title, summary, tags FROM conversations WHERE id = ?")
    .get(conversationId) as unknown as ConversationAfter | undefined;
  return row ?? null;
}

/**
 * The two title writes the demo scripts, ported from `set_provisional_title`
 * and `update_title`. Both go through `_title_metadata`, which is why a
 * provisional title is later REPAIRABLE and a manual one is locked: the only
 * difference on disk is `title_status`.
 */
export function writeTitle(
  db: WritableDatabase,
  conversationId: string,
  title: string,
  kind: "provisional" | "manual",
): void {
  const conversation = resolveConversation(db, conversationId);
  const clean = cleanTitle(title);
  const metadata = titleMetadata(metadataDict(conversation), {
    source: kind === "manual" ? "manual" : "first_user",
    status: kind === "manual" ? "manual" : "provisional",
    previousTitle: conversation.title,
  });
  updateConversation(db, conversation.id, {
    title: clean,
    metadata: pythonJsonDumps(metadata),
  });
}

export type { ConversationLike };
