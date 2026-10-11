// The welcome's update-awareness cache (CV22.DS7.TS3 plateau 4). Port of the
// cache half of `src/memory/cli/welcome.py`.
//
// `<mirror home>/runtime/update-check.json` is READ by the per-turn status line
// and WRITTEN by the full card's refresh. During the transition both cores read
// and write it, so byte compatibility is a hard requirement rather than a
// nicety: two cores that serialize the same state differently would rewrite the
// file on every alternating invocation and thrash the 6h TTL, turning a bounded
// remote check into one on every turn.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MarkerValue } from "#runtime/git.ts";
import { pythonJsonDumpsIndented } from "#util/pyGenerators.ts";

export const UPDATE_CHECK_CACHE = "runtime/update-check.json";
export const UPDATE_CHECK_TTL_MS = 6 * 60 * 60 * 1000;

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

/** Port of `_parse_iso`, narrowed to the timestamps this cache carries. */
export function parseIso(value: string | null): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value.replace("Z", "+00:00"));
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/**
 * Port of `_cache_is_stale`. A timestamp that cannot be parsed is stale, not
 * fresh -- the safe direction for a cache that gates a network call.
 *
 * A NAIVE timestamp (no offset) is read as UTC, matching the oracle's explicit
 * `replace(tzinfo=timezone.utc)`. JavaScript would otherwise read it as local
 * time and shift the TTL by the machine's offset.
 */
export function cacheIsStale(awareness: UpdateAwareness, now: Date = new Date()): boolean {
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(awareness.checked_at);
  const checkedAt = parseIso(hasOffset ? awareness.checked_at : `${awareness.checked_at}Z`);
  if (checkedAt === null) return true;
  return now.getTime() - checkedAt.getTime() > UPDATE_CHECK_TTL_MS;
}

/**
 * Port of `_cache_should_refresh`: stable-channel awareness is refreshed even
 * inside the TTL. A cached notice may point at an intermediate release, and a
 * cached up-to-date answer goes wrong the moment stable advances -- opening
 * Mirror should show the newly published version without manually fetching
 * refs or deleting this file.
 */
export function cacheShouldRefresh(awareness: UpdateAwareness, channel: MarkerValue): boolean {
  return (
    (awareness.availability === "up_to_date" || awareness.availability === "update_available") &&
    channel.value === "stable"
  );
}
