// CV22.DS7.US8 plateau 2 — method template preparation.
//
// Port of `src/memory/builder/template_generation.py`. This is the one command in
// the plateau that writes into the USER's repository: nine files under
// `docs/project/roadmap/`, whose bytes are the template bodies transcribed in
// `ariadMethod.ts` and graded by deep equality there.
//
// The rule that makes it safe to re-run is `if target.exists()` — an existing file
// is PRESERVED, never overwritten, and reported as such. A port that writes
// unconditionally would silently replace a Navigator's authored `plan.md` with the
// blank template, which is the worst defect available in this story: destructive,
// silent, and in someone else's git history.
//
// Confinement is checked after resolution (`is_relative_to(root)`), so a template
// path that escapes the project root raises instead of writing. Today no declared
// template can trigger it — `validateMethodDefinition` already rejects an absolute
// path or a `..` component — but the guard is the second of the two, and it is the
// one that survives a DSL edited by hand after DS10.

import { relative, resolve } from "node:path";
import { writeBuilderArtifact } from "./artifacts/artifactWriter.ts";
import type { MethodDefinition, TemplateDefinition } from "./methodDefinition.ts";

/** Python `PENDING_TEMPLATE_PREPARATION_ITEMS`. */
export const PENDING_TEMPLATE_PREPARATION_ITEMS = [
  "runtime delivery cursor sync",
  "active roadmap item resolution",
  "story lifecycle execution",
  "project/journey override merge",
  "release and push policy enforcement",
] as const;

/** Python `TemplateWriteResult`. */
export interface TemplateWriteResult {
  readonly id: string;
  readonly path: string;
  readonly action: "created" | "preserved";
  readonly description: string | null;
}

/** Python `BuilderTemplatePreparation`. */
export interface BuilderTemplatePreparation {
  readonly journey: string;
  readonly method: string;
  readonly checked: readonly string[];
  readonly created: readonly TemplateWriteResult[];
  readonly preserved: readonly TemplateWriteResult[];
  readonly pending: readonly string[];
}

/** Python `_target_path`, including the escape guard. */
function targetPath(root: string, template: TemplateDefinition): string {
  const target = resolve(root, template.path);
  const relation = relative(root, target);
  if (relation.startsWith("..") || resolve(relation) === relation) {
    throw new Error(`template path escapes project root: ${template.path}`);
  }
  return target;
}

/**
 * Python `prepare_method_templates`.
 *
 * `checked` accumulates EVERY template path, in declaration order, whether or not
 * it was written — so the report distinguishes "looked at nine, created two,
 * preserved seven" from "only saw two".
 */
export function prepareMethodTemplates(
  projectPath: string,
  options: { journey: string; method: MethodDefinition },
): BuilderTemplatePreparation {
  const root = resolve(projectPath);
  const created: TemplateWriteResult[] = [];
  const preserved: TemplateWriteResult[] = [];
  const checked: string[] = [];

  for (const template of options.method.templates) {
    const target = targetPath(root, template);
    checked.push(template.path);
    // A template is a scaffold: written where absent, and the Driver's from then on.
    const outcome = writeBuilderArtifact({
      path: target,
      content: template.content,
      policy: "create-only",
      projectRoot: root,
    });
    const result: TemplateWriteResult = {
      id: template.id,
      path: template.path,
      action: outcome === "existing" ? "preserved" : "created",
      description: template.description ?? null,
    };
    (outcome === "existing" ? preserved : created).push(result);
  }

  return {
    journey: options.journey,
    method: options.method.id,
    checked,
    created,
    preserved,
    pending: [...PENDING_TEMPLATE_PREPARATION_ITEMS],
  };
}

/** Python `_format_paths` / `_format_results`: the PATH, not the id. */
function formatPaths(paths: readonly string[]): string[] {
  return paths.length > 0 ? [...paths] : ["none"];
}

function formatResults(results: readonly TemplateWriteResult[]): string[] {
  return results.length > 0 ? results.map((result) => result.path) : ["none"];
}

/** Python `render_template_preparation_report`: plain text, no card frame. */
export function renderTemplatePreparationReport(report: BuilderTemplatePreparation): string {
  return `${[
    "■ Ariad Template Preparation",
    "",
    "journey",
    report.journey,
    "",
    "method",
    report.method,
    "",
    "checked",
    ...formatPaths(report.checked),
    "",
    "created",
    ...formatResults(report.created),
    "",
    "preserved",
    ...formatResults(report.preserved),
    "",
    "pending",
    ...report.pending,
    "",
    "boundary",
    "No story lifecycle work was executed.",
  ].join("\n")}\n`;
}
