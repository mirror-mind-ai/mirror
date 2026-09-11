/**
 * Front-door serving paths for the CV22.DS7.US11 content & planning tail.
 *
 * `routing.ts` decides; these functions answer. Each mirrors the shape the
 * cultivation and soul routes established: the replay provider is loaded from
 * the environment variable `routing.ts` already gated on, so reaching one of
 * these without it is direct misuse rather than a user-visible path.
 *
 * The ported logic lives in `#memory/journal.ts`, `#planning/weekPlan.ts`, and
 * `#identity/descriptorGenerate.ts` and is graded there against the Python
 * goldens. This module only assembles prompts, awaits providers, and hands the
 * results to that synchronous logic — deliberately, so the graded units stay
 * pure and the async seam stays thin.
 */

import {
  LifecycleFaceError,
  runLifecycleDryRun,
  runLifecyclePreviewAtMessage,
} from "#conversation/lifecycleFaces.ts";
import type { Database, WritableDatabase } from "#db/database.ts";
import { parseJsonResponse } from "#extraction/json.ts";
import { resolveDescriptorTargets, runDescriptorGenerate } from "#identity/descriptorGenerate.ts";
import {
  addJournal,
  interpretJournalClassification,
  renderJournalReceipt,
} from "#memory/journal.ts";
import { chatLedgerHook, embeddingLedgerHook } from "#observability/ledgerHooks.ts";
import {
  buildDescriptorPrompt,
  buildJournalClassificationPrompt,
  buildWeekPlanPrompt,
  DESCRIPTOR_TEMPERATURE,
  JOURNAL_TEMPERATURE,
  WEEK_PLAN_TEMPERATURE,
  weekPlanClock,
} from "#planning/promptAssembly.ts";
import { defaultPendingPath } from "#planning/weekPending.ts";
import { buildJourneyContext, runWeekPlan } from "#planning/weekPlan.ts";
import { type EmbeddingProvider, generateEmbeddingSafely } from "#providers/embedding.ts";
import type { LlmProvider } from "#providers/llm.ts";
import { memoryEmbedText } from "#soul/harvest.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";
import { pyStrip } from "#util/pythonText.ts";

/** Python `journal`: positional words joined by a single space, plus `--journey`. */
export function parseJournalArgs(args: readonly string[]): {
  content: string;
  journey: string | null;
} {
  const words: string[] = [];
  let journey: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--journey") {
      journey = args[index + 1] ?? null;
      index += 1;
    } else if (token === "--mirror-home" || token === "--db-path") {
      index += 1;
    } else {
      words.push(token);
    }
  }
  return { content: words.join(" "), journey };
}

export async function runJournalRoute(
  db: WritableDatabase,
  args: readonly string[],
  providers: { llm: LlmProvider; embedding: EmbeddingProvider },
): Promise<number> {
  const { content, journey } = parseJournalArgs(args);
  if (!content.trim()) {
    console.error("Error: journal entry text cannot be empty");
    return 1;
  }

  const prompt = buildJournalClassificationPrompt(content);
  const response = await providers.llm.complete({
    role: "journal_classification",
    prompt,
    temperature: JOURNAL_TEMPERATURE,
  });
  // Python's `add_journal` passes build_llm_logger(role="journal_classification").
  chatLedgerHook(db, "journal_classification")(response, prompt);
  const classification = interpretJournalClassification(
    response.content,
    content,
    parseJsonResponse,
  );

  // Embed the SAME text `addJournal` would compute, so the vector and the
  // graded write path cannot drift apart.
  //
  // Through `generateEmbeddingSafely`, not `provider.embed` directly (CR075).
  // The wrapper owns three behaviors Python's `generate_embedding` has and a
  // bare call does not: bounded retry of a transient empty payload, the AI-07
  // permanent dimension-mismatch guard, and the ledger hook. All three were
  // harmless while a fixture always answered with a well-formed vector for
  // free, and all three become reachable the moment this is billable.
  const vector = await generateEmbeddingSafely(
    providers.embedding,
    memoryEmbedText(classification.title, content, null),
    { onAttempt: embeddingLedgerHook(db) },
  );
  const embedding = new Uint8Array(new Float32Array(vector).buffer);

  const result = addJournal(
    db,
    { content, journey, classification },
    { newId, nowIso: nowIso(), embed: () => embedding },
  );

  const stored = db
    .prepare("SELECT tags FROM memories WHERE id = ?")
    .get(result.memoryId) as unknown as { tags: string | null } | undefined;
  process.stdout.write(renderJournalReceipt(result, journey, stored?.tags ?? null));
  return 0;
}

export async function runWeekPlanRoute(
  db: WritableDatabase,
  args: readonly string[],
  llm: LlmProvider,
  // Test seam only: the pending file lives at one well-known path, shared with
  // Python, and a test must not write to the operator's real one. The default
  // is unchanged -- hardening the file itself is CR074, which has to move both
  // engines together.
  options: { pendingPath?: string } = {},
): Promise<number> {
  const text = args.find((token) => !token.startsWith("--")) ?? "";
  const clock = weekPlanClock(new Date());

  // Assembled here so the bytes sent are the bytes the digest pins, then the
  // response is handed to the synchronous, golden-graded walk.
  const prompt = buildWeekPlanPrompt(text, buildJourneyContext(db), clock);
  const response = await llm.complete({
    role: "week_plan",
    prompt,
    temperature: WEEK_PLAN_TEMPERATURE,
  });
  // Python's `services/tasks.py` passes build_llm_logger(role="week_plan").
  chatLedgerHook(db, "week_plan")(response, prompt);

  runWeekPlan(db, text, {
    complete: () => response.content,
    parseJson: parseJsonResponse,
    clock,
    pendingPath: options.pendingPath ?? defaultPendingPath(),
    print: (value) => process.stdout.write(value),
  });
  return 0;
}

export async function runDescriptorGenerateRoute(
  db: WritableDatabase,
  args: readonly string[],
  llm: LlmProvider,
): Promise<number> {
  const flag = (name: string): string | null => {
    const index = args.indexOf(name);
    return index === -1 ? null : (args[index + 1] ?? null);
  };
  const selection = { layer: flag("--layer"), key: flag("--key") };

  const resolved = resolveDescriptorTargets(db, selection);
  const descriptors = new Map<string, string>();
  if (resolved.kind === "targets") {
    for (const target of resolved.targets) {
      // `generate_descriptor` returns "" for empty content BEFORE the model
      // call, and "" on any provider exception. Both reach the same
      // "skipped (empty response)" line.
      if (!pyStrip(target.content)) {
        descriptors.set(`${target.layer}/${target.key}`, "");
        continue;
      }
      try {
        const prompt = buildDescriptorPrompt(target.content, target.layer, target.key);
        const response = await llm.complete({
          role: "descriptor",
          prompt,
          temperature: DESCRIPTOR_TEMPERATURE,
        });
        // A DELIBERATE DIVERGENCE, decided at plan time (CV22.DS8.US3).
        // Python's `generate_descriptor` is the one LLM caller that takes no
        // `on_llm_call`, so neither engine recorded this spend. US11 preserved
        // the gap as parity and flagged it as a DS8 input; DS8 closes it in
        // TypeScript, which is the product authority for a ported command
        // (2026-08-13). `descriptor generate` fans out one call per persona
        // and per journey, so a ledger blind to it is blind to the largest
        // single-command spend in this story. Recorded in decisions.md; the
        // descriptor golden now reads "Python zero rows, TS one per entity".
        chatLedgerHook(db, "descriptor")(response, prompt);
        descriptors.set(`${target.layer}/${target.key}`, pyStrip(response.content));
      } catch {
        descriptors.set(`${target.layer}/${target.key}`, "");
      }
    }
  }

  return runDescriptorGenerate(db, selection, {
    generate: (target) => descriptors.get(`${target.layer}/${target.key}`) ?? "",
    nowIso: nowIso(),
  }).exitCode;
}

/** The two ES-001 read faces; `routing.ts` has already refused the write faces. */
export function runLifecycleFaceRead(db: Database, args: readonly string[]): number {
  const value = (name: string): string | null => {
    const index = args.indexOf(name);
    return index === -1 ? null : (args[index + 1] ?? null);
  };
  try {
    const dryRunId = value("--metadata-lifecycle-dry-run");
    const report =
      dryRunId !== null
        ? runLifecycleDryRun(db, dryRunId)
        : runLifecyclePreviewAtMessage(db, value("--metadata-lifecycle-preview-at-message") ?? "");
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof LifecycleFaceError) {
      console.error(`Error: ${error.message}`);
      return 1;
    }
    throw error;
  }
}
