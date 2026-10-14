// The welcome's update-awareness cache (CV22.DS7.TS3 plateau 4). Port of the
// cache half of `src/memory/cli/welcome.py`.
//
// `<mirror home>/runtime/update-check.json` is READ by the per-turn status line
// and WRITTEN by the full card's refresh. During the transition both cores read
// and write it, so byte compatibility is a hard requirement rather than a
// nicety: two cores that serialize the same state differently would rewrite the
// file on every alternating invocation and thrash the 6h TTL, turning a bounded
// remote check into one on every turn.
//
// CR135 removed that TTL, which gated nothing: on `stable` every verdict the
// card writes is refreshed at the next render, and on `main` the card never
// checks. What a reader needs instead is to know whether a verdict still
// APPLIES to the install reading it (`verdictApplies`), and a successful
// `runtime update` now says what it installed (`recordUpToDate`).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pythonJsonDumpsIndented } from "#util/pyGenerators.ts";
import { compareSemver } from "#util/semver.ts";

export const UPDATE_CHECK_CACHE = "runtime/update-check.json";

export interface UpdateAwareness {
  availability: string;
  checked_at: string;
  channel: string;
  current_commit: string | null;
  remote_commit: string | null;
  version: string | null;
  title: string | null;
  note: string | null;
}

export function cachePath(homePath: string): string {
  return join(homePath, UPDATE_CHECK_CACHE);
}

/** Port of `_optional_str`: a non-empty string, or null. */
function optionalStr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Port of `_read_update_cache`. Every failure mode -- unreadable, malformed,
 * not an object, or missing one of the three required fields -- yields null,
 * because a cache that cannot be trusted is the same as no cache.
 */
export function readUpdateCache(homePath: string): UpdateAwareness | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(cachePath(homePath), "utf8"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  const availability = optionalStr(record.availability);
  const checkedAt = optionalStr(record.checked_at);
  const channel = optionalStr(record.channel);
  if (availability === null || checkedAt === null || channel === null) return null;

  return {
    availability,
    checked_at: checkedAt,
    channel,
    current_commit: optionalStr(record.current_commit),
    remote_commit: optionalStr(record.remote_commit),
    version: optionalStr(record.version),
    title: optionalStr(record.title),
    note: optionalStr(record.note),
  };
}

/**
 * Port of `_write_update_cache`. Fail-quietly, like the oracle: a cache that
 * cannot be written must never break the welcome it decorates.
 */
export function writeUpdateCache(homePath: string, awareness: UpdateAwareness): void {
  const path = cachePath(homePath);
  const payload = {
    checked_at: awareness.checked_at,
    channel: awareness.channel,
    availability: awareness.availability,
    current_commit: awareness.current_commit,
    remote_commit: awareness.remote_commit,
    version: awareness.version,
    title: awareness.title,
    note: awareness.note,
  };
  try {
    if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${pythonJsonDumpsIndented(payload)}\n`, "utf8");
  } catch {
    // Fail-quietly contract.
  }
}

/** Port of `_iso_now`: the cache's timestamp shape, microseconds and all. */
export function isoNow(): string {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000+00:00");
}

/**
 * Does a cached verdict still apply to the install reading it? (CR135)
 *
 * One verdict goes stale in a way the reader can see: an update to a version
 * the install already has, or has passed -- after an update, after a manual
 * install, or when another install over the same home wrote it. Such a
 * verdict is not shown, by the card or by the status line. A verdict without
 * a version, from a clone's tag lookup that found none, cannot be judged and
 * stands. A version that does not parse as `vX.Y.Z` sorts below every real one
 * (`#util/semver.ts`), so it is never newer and is not shown.
 */
export function verdictApplies(awareness: UpdateAwareness, installedVersion: string): boolean {
  if (awareness.availability !== "update_available" || awareness.version === null) return true;
  return compareSemver(awareness.version, installedVersion) > 0;
}

export interface UpToDateRecord {
  /** The channel the update followed. */
  channel: string;
  /** A clone's commit after the update; null for a package, which has none. */
  commit: string | null;
  checkedAt: string;
}

/**
 * What a successful `runtime update` knows, written where the card and the
 * status line read it (CR135): the install now holds its channel's version.
 * Until CR135 nothing rewrote the cache after an update, so the status line
 * kept announcing the version just installed until some later check, from
 * some repository, said otherwise.
 */
export function recordUpToDate(homePath: string, record: UpToDateRecord): void {
  writeUpdateCache(homePath, {
    availability: "up_to_date",
    checked_at: record.checkedAt,
    channel: record.channel,
    current_commit: record.commit,
    remote_commit: record.commit,
    version: null,
    title: null,
    note: null,
  });
}
