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
//   * the PATH is relativized against the journey's project root, through
//     `displayPath`, the one rule every card that prints a path follows (CR082).

import { cardText, cardWrapped } from "../card.ts";
import { displayPath } from "../projectPaths.ts";
import { wrapAriadSurface } from "../surfaceProtocol.ts";

/** Python `MaterializedArtifact`, plus a note (CR112): what an existing file is. */
export interface MaterializedArtifact {
  readonly kind: string;
  readonly path: string;
  readonly status: string;
  /** Printed after the kind, as `— <note>`: `scaffold`, `authored`, `partly authored`. */
  readonly note?: string;
}

/** Python `materialized_artifact`. */
export function materializedArtifact(
  kind: string,
  path: string,
  options: { existedBefore: boolean },
): MaterializedArtifact {
  return { kind, path, status: options.existedBefore ? "updated" : "created" };
}

/** Python `existing_artifact`, with the state of the file that was left alone (CR112). */
export function existingArtifact(kind: string, path: string, note?: string): MaterializedArtifact {
  return note === undefined
    ? { kind, path, status: "existing" }
    : { kind, path, status: "existing", note };
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
    // CR079: a record the runtime did not write, or one edited since, left as it is.
    case "preserved":
      return "⊘";
    default:
      return "•";
  }
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
      const note = artifact.note === undefined ? "" : ` — ${artifact.note}`;
      lines.push(
        ...cardWrapped(`${statusIcon(artifact.status)} ${artifact.status} ${artifact.kind}${note}`),
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
