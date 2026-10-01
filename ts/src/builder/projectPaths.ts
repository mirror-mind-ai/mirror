// CR082 with CR009 — how a Builder surface names a place in the journey's project.
//
// Paths are resolved absolute inside the runtime, deliberately: `storyPaths`'
// confinement guard is only sound on absolutes. What a surface PRINTS is another
// matter. Surfaces are transported verbatim into replies, handoffs, and committed
// documents, so a path printed as resolved carries the owner's home directory, and a
// card cuts it into 54-column chunks where the root's length decides, so the same row
// reads differently on every machine. Every path a card prints therefore goes through
// `displayPath`, relative to the project, and every message that names a package is
// built with it where it is raised.
//
// One core answers "where is this path in the project", and each caller keeps its own
// reading of the two answers that are not a plain relative path: the project root
// itself, and a path outside the project.
//
// A relative path names a file only together with its project, so every report of a
// write also names the project, by its folder, and the journey it was made for, on one
// row (CR009): a wrong journey, or a journey whose project path names the wrong folder,
// shows as a wrong name on the card itself.

import { basename, isAbsolute, relative, resolve } from "node:path";

/**
 * The path's relation to the project, in the platform's separators: `""` for the
 * project root itself, and `null` for a path outside the project.
 *
 * Both arguments are resolved first, so an absolute path and a relative one name the
 * same place when they resolve to it.
 */
export function projectRelative(path: string, projectRoot: string): string | null {
  const relation = relative(resolve(projectRoot), resolve(path));
  if (relation.startsWith("..") || isAbsolute(relation)) return null;
  return relation;
}

/**
 * A path as a surface prints it: relative to the project, `.` for the project root,
 * and the path exactly as given when it lies outside the project or there is none.
 *
 * Printing the ORIGINAL path in the fallback, not the resolved one, is Python's
 * `_display_path`, kept: a path outside the project prints as its caller wrote it.
 */
export function displayPath(path: string, projectPath: string | null): string {
  if (projectPath === null) return path;
  const relation = projectRelative(path, projectPath);
  if (relation === null) return path;
  return relation === "" ? "." : relation;
}

/** The project's folder: the last segment of its path, or the path itself at the root. */
export function projectFolder(projectRoot: string): string {
  const resolved = resolve(projectRoot);
  return basename(resolved) || resolved;
}

/**
 * The row a report of a write prints (CR009): where the files went, by the project's
 * folder, and for which journey. Two checkouts of one repository share a folder name;
 * the slug on the row tells their journeys apart, and `build load` prints the root.
 */
export function targetLine(projectRoot: string, journey: string): string {
  return `project: ${projectFolder(projectRoot)} · journey: ${journey}`;
}
