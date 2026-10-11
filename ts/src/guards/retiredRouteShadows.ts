// A retired shape must route, underneath its retired entry, like any name
// nobody claims (CV22.DS10.TS5, inventory F2).
//
// TS4 added the `retired` route and matched it BEFORE dispatch, so the family
// branches that used to answer the same shapes became unreachable -- and stayed
// in the file, because a branch the front door can never reach is invisible to
// every test that goes through the front door. Two of them survived into TS5:
// the backfill flags and the twenty Workbench verbs, each still routed to
// Python by name.
//
// The file-scanning guard cannot see this. Its `sqlite-refinement-workbench`
// row exempts `routing.ts` whole, because the retired entries legitimately
// name the verbs they refuse -- and a file-level exemption is blind to
// everything else in that file (TS2's lesson). So this check asks the router
// instead: route each retired shape with the retired match removed, route an
// unclaimed sibling that differs only in its final token, and require the two
// decisions to be the same. A family branch keyed on the retired token is the
// only thing that can make them differ.

import { RETIRED_SURFACES, type RetiredSurface, type RouteDecision } from "#frontDoor/routing.ts";

/** A final token no family names, so the sibling reaches whatever answers the unclaimed. */
const UNCLAIMED_TOKEN = "__retired_route_sibling__";

export interface ShadowedRetiredRoute {
  /** The retired shape, as its entry names it. */
  readonly surface: string;
  /** What the family branch underneath answers for it -- a route decision reason, never argv. */
  readonly reason: string;
}

/**
 * Every retired shape that some family branch still claims by name.
 *
 * `route` is the family router without the retired match -- `routeByFamily` in
 * production, a fake in the guard's own test, so the check can be seen to fire.
 * Reasons are compared with the sibling's placeholder restored to the retired
 * token, because a generic answer such as `unknown runtime subcommand: <name>`
 * legitimately echoes whichever name it was given.
 */
export function shadowedRetiredRoutes(
  route: (argv: readonly string[]) => RouteDecision,
  surfaces: readonly RetiredSurface[] = RETIRED_SURFACES,
): ShadowedRetiredRoute[] {
  const shadowed: ShadowedRetiredRoute[] = [];
  for (const entry of surfaces) {
    const argv = entry.surface.split(" ");
    const token = argv[argv.length - 1] ?? "";
    const underneath = route(argv);
    const unclaimed = route([...argv.slice(0, -1), UNCLAIMED_TOKEN]);
    const unclaimedReason = unclaimed.reason.split(UNCLAIMED_TOKEN).join(token);
    if (underneath.engine !== unclaimed.engine || underneath.reason !== unclaimedReason) {
      shadowed.push({ surface: entry.surface, reason: underneath.reason });
    }
  }
  return shadowed;
}
