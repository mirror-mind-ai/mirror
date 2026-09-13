// CV22.DS7.US8 plateau 3 — the artifact materialization surface.
//
// Port of `src/memory/builder/artifact_surfaces.py`.
//
// This is the surface that tells the Navigator which files a lifecycle command
// touched and whether it created, updated, or left them alone. Two details carry
// the meaning:
//
//   * the STATUS is a three-way distinction, not a boolean. `existing` is what the
//     preservation rule reports when a file was authored by a human and kept, and
//     it is the only visible evidence that the command did not overwrite it.
//   * the PATH is relativized against the journey's project root. Every sibling
//     lifecycle surface prints the absolute path it resolved instead, which is
//     inconsistent, leaks the owner's home directory into a transported surface,
//     and is recorded as CR082. Reproduced here exactly: this surface relativizes,
//     the others do not.

import { isAbsolute, relative, resolve } from "node:path";
import { cardText, cardWrapped } from "../card.ts";
import { wrapAriadSurface } from "../surfaceProtocol.ts";

/** Python `MaterializedArtifact`. */
export interface MaterializedArtifact {
  readonly kind: string;
  readonly path: string;
  readonly status: string;
}

/** Python `materialized_artifact`. */
export function materializedArtifact(
  kind: string,
  path: string,
  options: { existedBefore: boolean },
): MaterializedArtifact {
  return { kind, path, status: options.existedBefore ? "updated" : "created" };
}

/** Python `existing_artifact`. */
export function existingArtifact(kind: string, path: string): MaterializedArtifact {
  return { kind, path, status: "existing" };
}

/** Python `_status_icon`: an unknown status renders `•` rather than failing. */
function statusIcon(status: string): string {
  switch (status) {
    case "created":
      return "✓";
    case "updated":
      return "✎";
    case "existing":
      return "↻";
    default:
      return "•";
  }
}

/**
 * Python `_display_path`.
 *
 * The fallback returns the ORIGINAL path, not the resolved one, so a path outside
 * the project prints as the caller wrote it. Reproduced deliberately: resolving in
 * the fallback would print a different string than Python for the same input.
 */
function displayPath(path: string, projectPath: string | null): string {
  if (projectPath !== null) {
    const relation = relative(resolve(projectPath), resolve(path));
    // `Path.relative_to` raises only when the path is not under the root, and
    // returns `.` when the two are equal. So: a `..` prefix or an absolute result
    // means "not under", and an empty result means "is the root".
    if (!relation.startsWith("..") && !isAbsolute(relation)) {
      return relation === "" ? "." : relation;
    }
  }
  return path;
}

export interface ArtifactsSurfaceOptions {
  readonly context: string;
  readonly artifacts: readonly MaterializedArtifact[];
  readonly projectPath?: string | null;
  readonly boundary?: string;
}

/** Python `render_artifacts_materialized_surface`. */
export function renderArtifactsMaterializedSurface(options: ArtifactsSurfaceOptions): string {
  const projectPath = options.projectPath ?? null;
  const boundary = options.boundary ?? "Files were materialized only.";
  const lines: string[] = [
    "Artifacts",
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        ✎  ARTIFACTS MATERIALIZED                      │",
    "│                                                        │",
    ...cardWrapped(options.context),
    "│                                                        │",
  ];
  if (options.artifacts.length > 0) {
    options.artifacts.forEach((artifact, index) => {
      // A blank row BETWEEN entries only, so the block does not open or close
      // with one. An off-by-one here is invisible until a golden compares bytes.
      if (index > 0) lines.push("│                                                        │");
      lines.push(
        ...cardWrapped(`${statusIcon(artifact.status)} ${artifact.status} ${artifact.kind}`),
      );
      lines.push(...cardWrapped(displayPath(artifact.path, projectPath)));
    });
  } else {
    lines.push(cardText("none"));
  }
  lines.push(
    "│                                                        │",
    ...cardWrapped(boundary),
    "╰────────────────────────────────────────────────────────╯",
  );
  return wrapAriadSurface("artifacts_materialized", `${lines.join("\n")}\n`);
}
