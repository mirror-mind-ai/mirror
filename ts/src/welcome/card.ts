// The state-aware welcome card (CV22.DS7.TS3 plateau 4). Port of
// `compose_welcome` from `src/memory/cli/welcome.py`.
//
// Unlike the status line, the card MAY reach the network: on the stable
// channel it performs a bounded remote update check so a newly published
// release becomes visible without manual cache repair. That check is
// TTL-guarded, refresh-guarded, and switched off entirely by
// `MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off|0|false|no`.
//
// Date rendering is done by hand from `_MONTH_ABBR`, never through
// `toLocaleDateString`: the oracle formats the month itself, so a locale-aware
// TypeScript formatter would render "since ago. 2025" on a machine whose
// locale is not English and call it parity.

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { type Database, openDatabaseReadOnly } from "#db/database.ts";
import { dbNameForEnv } from "#frontDoor/dbPath.ts";
import { listJourneysForListCommand } from "#identity/journeyListing.ts";
import {
  checkUpdateAvailability,
  type GitStatus,
  inspectGit,
  inspectGitUpdatePlan,
  type MarkerValue,
  runGit,
} from "#runtime/git.ts";
import { parseSemver } from "#runtime/releaseNotes.ts";
import { SEPARATOR } from "./statusLine.ts";
import {
  cacheIsStale,
  cacheShouldRefresh,
  readUpdateCache,
  type UpdateAwareness,
  writeUpdateCache,
} from "./updateCache.ts";

export const INVITATION = "→ Where shall we begin?";

/** Port of `_MONTH_ABBR`. Hand-formatted, deliberately: see the module header. */
const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export interface WelcomeStats {
  journeys: number;
  personas: number;
  memories: number;
  conversations: number;
  since: string | null;
}

/** Port of `_fmt_count`: a thousands separator only from 1000 up. */
function fmtCount(value: number): string {
  return value >= 1000 ? value.toLocaleString("en-US") : String(value);
}

/** Port of `_since_label`. An unparseable or absent timestamp reads "today". */
export function sinceLabel(firstStarted: string | null): string {
  if (!firstStarted) return "since today";
  const parsed = Date.parse(firstStarted.replace("Z", "+00:00"));
  if (Number.isNaN(parsed)) return "since today";
  // The oracle reads the naive/offset timestamp's OWN fields, so the month and
  // year come from the stored local wall clock, not from a UTC conversion.
  const match = firstStarted.match(/^(\d{4})-(\d{2})/);
  if (match) return `since ${MONTH_ABBR[Number(match[2]) - 1]} ${Number(match[1])}`;
  const date = new Date(parsed);
  return `since ${MONTH_ABBR[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Port of `_format_stats`. */
export function formatStats(stats: WelcomeStats): string {
  return [
    `${fmtCount(stats.journeys)} journeys`,
    `${fmtCount(stats.personas)} personas`,
    `${fmtCount(stats.memories)} memories`,
    `${fmtCount(stats.conversations)} conversations`,
    sinceLabel(stats.since),
  ].join(SEPARATOR);
}

function scalar(db: Database, sql: string, ...params: string[]): number {
  const row = db.prepare(sql).get(...params);
  const value = row === undefined ? null : Object.values(row)[0];
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

/** Port of `_stats_line`: five numbers, one read-only connection. */
export function readWelcomeStats(dbPath: string | null): WelcomeStats {
  if (dbPath === null || !existsSync(dbPath)) {
    return { journeys: 0, personas: 0, memories: 0, conversations: 0, since: null };
  }
  const db = openDatabaseReadOnly(dbPath);
  try {
    const activeJourneys = listJourneysForListCommand(db).filter(
      (journey) => journey.status === "active",
    ).length;
    const startedRow = db.prepare("SELECT MIN(started_at) AS value FROM conversations").get();
    const started = startedRow?.value;
    return {
      journeys: activeJourneys,
      personas: scalar(db, "SELECT COUNT(*) AS value FROM identity WHERE layer = ?", "persona"),
      memories: scalar(db, "SELECT COUNT(*) AS value FROM memories"),
      conversations: scalar(db, "SELECT COUNT(*) AS value FROM conversations"),
      since: typeof started === "string" && started ? started : null,
    };
  } finally {
    db.close();
  }
}

/** Port of `_render`. */
export function renderWelcome(
  user: string,
  stats: string,
  version: string,
  update: string | null,
): string {
  const lines = [`◇ Mirror · ${user}`, `Version ${version}`, stats];
  if (update) lines.push(update);
  lines.push("", INVITATION);
  return lines.join("\n");
}

/** Port of `_remote_update_check_disabled`. */
export function remoteUpdateCheckDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = (env.MIRROR_WELCOME_REMOTE_UPDATE_CHECK ?? "").trim().toLowerCase();
  return value === "off" || value === "0" || value === "false" || value === "no";
}

/** Port of `_welcome_disabled`. */
export function welcomeDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = (env.MIRROR_WELCOME ?? "").trim().toLowerCase();
  return value === "off" || value === "0" || value === "false" || value === "no";
}

/** Port of `_commits_match`: either id may be the abbreviated form. */
function commitsMatch(candidate: string, target: string): boolean {
  return candidate === target || candidate.startsWith(target) || target.startsWith(candidate);
}

/** Port of `_semver_key`: an unparseable tag sorts below every real one. */
function semverKey(version: string): [number, number, number] {
  const raw = version.startsWith("v") ? version.slice(1) : version;
  const parts = raw.split(".");
  if (parts.length < 3) return [-1, -1, -1];
  const [major, minor, patch] = parseSemver(raw);
  if (![major, minor, patch].every(Number.isInteger)) return [-1, -1, -1];
  return [major, minor, patch];
}

function compareSemver(a: string, b: string): number {
  const left = semverKey(a);
  const right = semverKey(b);
  for (let index = 0; index < 3; index += 1) {
    const delta = (left[index] as number) - (right[index] as number);
    if (delta !== 0) return delta;
  }
  return 0;
}

/**
 * Port of `_remote_tag_for_commit`: which published tag names the commit the
 * remote is at. `^{}` refs are the dereferenced peel of an annotated tag and
 * are skipped, so a tag is not counted twice.
 */
export function remoteTagForCommit(
  upstream: string,
  remoteCommit: string,
  repository: string | null,
): string | null {
  if (!upstream.includes("/")) return null;
  const remote = upstream.split("/", 1)[0] as string;
  if (repository === null) return null;
  const result = runGit(["ls-remote", "--tags", remote, "refs/tags/v*"], repository);
  if (result.code !== 0 || !result.stdout) return null;

  const matches: string[] = [];
  for (const line of result.stdout.split("\n")) {
    const parts = line.split(/\s+/).filter((part) => part.length > 0);
    if (parts.length < 2) continue;
    const [commit, ref] = parts as [string, string];
    if (!commitsMatch(commit, remoteCommit) || ref.endsWith("^{}")) continue;
    const tag = ref.split("/").pop() as string;
    if (tag.startsWith("v")) matches.push(tag);
  }
  if (matches.length === 0) return null;
  return matches.sort((a, b) => compareSemver(b, a))[0] as string;
}

/** Port of `_local_release_title`: the headline of a note already on disk. */
export function localReleaseTitle(version: string | null, cwd: string): string | null {
  if (!version) return null;
  let text: string;
  try {
    text = readFileSync(join(cwd, "docs", "releases", `${version}.md`), "utf8");
  } catch {
    return null;
  }
  const prefix = `# ${version} — `;
  for (const line of text.split("\n")) {
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
  }
  return null;
}

export interface WelcomeOptions {
  /** The resolved mirror home. Null renders "", as in the oracle. */
  mirrorHome: string | null;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  version: string;
  updateChannel: MarkerValue;
  /** Injected only so the written cache is byte-comparable; production omits it. */
  now?: () => string;
}

/** Port of `_iso_now`. */
function isoNow(): string {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000+00:00");
}

/** Port of `_refresh_update_cache`. Any failure leaves the cache untouched. */
function refreshUpdateCache(
  homePath: string,
  channel: MarkerValue,
  cwd: string,
  version: string,
  now: () => string,
): UpdateAwareness | null {
  let report: ReturnType<typeof checkUpdateAvailability>;
  try {
    report = checkUpdateAvailability(cwd, channel.value, version);
  } catch {
    return null;
  }
  let tag: string | null = null;
  let title: string | null = null;
  if (report.status === "update_available" && report.remote_commit && report.upstream) {
    tag = remoteTagForCommit(report.upstream, report.remote_commit, inspectGit(cwd).repository);
    title = localReleaseTitle(tag, cwd);
  }
  const awareness: UpdateAwareness = {
    availability: report.status,
    checked_at: now(),
    channel: channel.value,
    current_commit: report.local_commit,
    remote_commit: report.remote_commit,
    version: tag,
    title,
    note: report.note,
  };
  if (report.status === "up_to_date" || report.status === "update_available") {
    writeUpdateCache(homePath, awareness);
  }
  return awareness;
}

/** Port of `_update_awareness`: cache first, remote only when it must. */
export function updateAwareness(
  homePath: string,
  channel: MarkerValue,
  cwd: string,
  version: string,
  env: NodeJS.ProcessEnv,
  now: () => string,
): UpdateAwareness | null {
  const cached = readUpdateCache(homePath);
  if (cached && !cacheIsStale(cached) && !cacheShouldRefresh(cached, channel)) return cached;
  if (remoteUpdateCheckDisabled(env) || channel.value !== "stable") return cached;
  return refreshUpdateCache(homePath, channel, cwd, version, now) ?? cached;
}

/** Port of `_update_line`. */
export function updateLine(
  channel: MarkerValue,
  awareness: UpdateAwareness | null,
  git: GitStatus,
): string | null {
  if (awareness && awareness.availability === "update_available") {
    let label = "✨ New Version Available";
    if (awareness.version && awareness.title) {
      label = `${label}: ${awareness.version} — ${awareness.title}`;
    } else if (awareness.version) {
      label = `${label}: ${awareness.version}`;
    } else {
      label = `${label} on ${awareness.channel}`;
    }
    return `${label}\nAsk: "what's new in this update?" or "update my Mirror"`;
  }

  if (git.repository === null) return null;
  const plan = inspectGitUpdatePlan(git, channel);
  if (plan.ready && plan.action === "pull" && plan.behind) {
    const plural = plan.behind !== 1 ? "s" : "";
    const upstream = plan.upstream || "upstream";
    return (
      `New Version Available: ${plan.behind} commit${plural} behind ${upstream} · ` +
      "run runtime update\n" +
      'Ask Mirror: "What\'s new in the latest Mirror Mind release?"'
    );
  }
  return null;
}

/**
 * Port of `compose_welcome`. The ONLY path to empty output is an unresolvable
 * mirror home: a fresh database with nothing in it still renders the full card
 * with zeroes.
 */
export function composeWelcome(options: WelcomeOptions): string {
  const homePath = options.mirrorHome;
  if (homePath === null) return "";
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const now = options.now ?? isoNow;

  const dbPath = join(homePath, dbNameForEnv(env.MEMORY_ENV || "production"));
  const stats = formatStats(readWelcomeStats(existsSync(dbPath) ? dbPath : null));
  const versionLine = `${options.version} · channel ${options.updateChannel.value}`;
  const awareness = updateAwareness(
    homePath,
    options.updateChannel,
    cwd,
    options.version,
    env,
    now,
  );
  const update = updateLine(options.updateChannel, awareness, inspectGit(cwd));
  return renderWelcome(basename(homePath), stats, versionLine, update);
}
