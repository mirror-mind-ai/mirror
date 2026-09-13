// CV22.DS7.US8 plateau 1 — the active roadmap position for the resume surface.
//
// Port of `src/memory/builder/roadmap_position.py`. `build load` renders this in
// the `roadmap position` row of `■ BUILDER RESUME`.
//
// It returns the FIRST active package in scan order, so it inherits the
// component-wise path ordering from `roadmapScan` — the same reason a string
// sort would change what the Navigator sees.
//
// `_ACTIVE_STATUS_MARKERS` is `("🟢 Active", "Active")`, which is a substring
// test where the second entry subsumes the first: any status containing
// "Active" qualifies, including "Inactive". Reproduced rather than tightened.

import { pyStrip } from "#util/pythonText.ts";
import { roadmapPaths } from "./pullCandidates.ts";
import { matchHeading, matchStatus } from "./roadmapGrammar.ts";
import { readRoadmapFile, scanRoadmapIndexFiles } from "./roadmapScan.ts";

const ACTIVE_STATUS_MARKERS = ["🟢 Active", "Active"] as const;

export interface RoadmapPosition {
  code: string;
  title: string;
  status: string;
  /** POSIX path relative to the project root, as Python's `.as_posix()`. */
  path: string;
}

/** Python `resolve_roadmap_position`: the first active roadmap file, or `null`. */
export function resolveRoadmapPosition(projectRoot: string | null): RoadmapPosition | null {
  if (projectRoot === null) return null;
  const { roadmapRoot } = roadmapPaths(projectRoot);
  for (const file of scanRoadmapIndexFiles(roadmapRoot)) {
    const content = readRoadmapFile(file.absolutePath);
    if (content === null) continue;
    const status = matchStatus(content);
    if (status === null) continue;
    const statusText = pyStrip(status);
    if (!ACTIVE_STATUS_MARKERS.some((marker) => statusText.includes(marker))) continue;
    const heading = matchHeading(content);
    if (!heading) continue;
    return {
      code: pyStrip(heading.code),
      title: pyStrip(heading.title),
      status: statusText,
      path: `docs/project/roadmap/${file.relativePath}`,
    };
  }
  return null;
}
