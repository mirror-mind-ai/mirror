// The state-aware welcome card (CV22.DS7.TS3 plateau 4). Port of
// `compose_welcome` from `src/memory/cli/welcome.py`.
//
// Unlike the status line, the card MAY reach the network: on the stable
// channel it performs a bounded remote update check at every render, so a
// newly published release becomes visible at the next session start. The
// check is switched off entirely by
// `MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off|0|false|no`.
//
// The check asks the RUNNING INSTALL, never the cwd (CR135). Pi renders the
// card in the person's project, and the oracle asked whatever repository that
// was: a project with a tagged `origin/stable` made the card announce its tag.
// A package now reads its channel's dist-tag, as `runtime update --check`
// does, with npm run in the install's own root; a clone asks its own checkout
// and its own remote. One budget bounds the remote reads of a render.
//
// Date rendering is done by hand from `_MONTH_ABBR`, never through
// `toLocaleDateString`: the oracle formats the month itself, so a locale-aware
// TypeScript formatter would render "since ago. 2025" on a machine whose
// locale is not English and call it parity.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { type Database, openDatabaseReadOnly } from "#db/database.ts";
import { dbNameForEnv } from "#frontDoor/dbPath.ts";
import { listJourneysForListCommand } from "#identity/journeyListing.ts";
import { channelFor } from "#runtime/channel.ts";
import {
  checkUpdateAvailability,
  GIT_NETWORK_TIMEOUT_MS,
  type GitStatus,
  inspectGit,
  inspectGitUpdatePlan,
  type MarkerValue,
  NO_REPOSITORY,
  runGit,
} from "#runtime/git.ts";
import type { InstallKind } from "#runtime/installKind.ts";
import {
  checkPackageUpdateAvailability,
  defaultNpmRunner,
  type NpmRunner,
} from "#runtime/strategies/package.ts";
import { compareSemver } from "#util/semver.ts";
import { SEPARATOR } from "./statusLine.ts";
import {
  isoNow,
  readUpdateCache,
  type UpdateAwareness,
  verdictApplies,
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

// The oracle's `_semver_key` was `_parse_semver` under a second name; both
// are `#util/semver.ts` now, and an unparseable tag still sorts below every
// real one.

/**
 * Port of `_remote_tag_for_commit`: which published tag names the commit the
 * remote is at. `^{}` refs are the dereferenced peel of an annotated tag and
 * are skipped, so a tag is not counted twice.
 *
 * A network read: it ran on git's 2 s LOCAL budget until CR135, so a lookup
 * slower than that cached an update without its version. The card passes
 * what is left of its own budget.
 */
export function remoteTagForCommit(
  upstream: string,
  remoteCommit: string,
  repository: string | null,
  timeoutMs: number = GIT_NETWORK_TIMEOUT_MS,
): string | null {
  if (!upstream.includes("/")) return null;
  const remote = upstream.split("/", 1)[0] as string;
  if (repository === null) return null;
  const result = runGit(["ls-remote", "--tags", remote, "refs/tags/v*"], repository, timeoutMs);
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

/**
 * Port of `_local_release_title`: the headline of a note already on disk,
 * under `<treeRoot>/docs/releases`. The oracle read `<cwd>/docs/releases`;
 * since CV22.DS10.US3 the caller passes the tree that holds the running front
 * door, so the title is the installed package's own and not whatever
 * directory the person is in.
 */
export function localReleaseTitle(version: string | null, treeRoot: string): string | null {
  if (!version) return null;
  let text: string;
  try {
    text = readFileSync(join(treeRoot, "docs", "releases", `${version}.md`), "utf8");
  } catch {
    return null;
  }
  const prefix = `# ${version} — `;
  for (const line of text.split("\n")) {
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
  }
  return null;
}

/** How long the card's remote reads may take, together (CR135, decision 1). */
export const WELCOME_REMOTE_BUDGET_MS = 5_000;

export interface WelcomeOptions {
  /** The resolved mirror home. Null renders "", as in the oracle. */
  mirrorHome: string | null;
  /**
   * The running install, detected from where the front door lives. The card's
   * channel, its update check, and its "commits behind" line are this
   * install's, whatever the cwd (CR135).
   */
  install: InstallKind;
  env?: NodeJS.ProcessEnv;
  version: string;
  /** The OS home whose config directory holds a package's channel file. */
  osHome?: string;
  /** The npm seam, injected as the update route's is. */
  npm?: NpmRunner;
  /** The budget of the remote reads; production takes `WELCOME_REMOTE_BUDGET_MS`. */
  remoteBudgetMs?: number;
  /** Injected only so the written cache is byte-comparable; production omits it. */
  now?: () => string;
}

/** What one render's remote check asked, how it answered, and how long it took. */
export interface RemoteCheck {
  source: "registry" | "git";
  verdict: string;
  ms: number;
}

export interface WelcomeRender {
  card: string;
  /** Null when no remote check ran. */
  check: RemoteCheck | null;
}

interface CheckSeams {
  npm: NpmRunner;
  budgetMs: number;
  now: () => string;
}

type CheckedInstall = Exclude<InstallKind, { kind: "unknown" }>;

/**
 * A package's verdict: its channel's dist-tag, read as `runtime update
 * --check` reads it, in the install's own root. One read, so it gets the
 * whole budget, and no retries: unanswered, npm retries for over a minute.
 */
function checkPackage(
  install: Extract<InstallKind, { kind: "package" }>,
  channel: MarkerValue,
  seams: CheckSeams,
): UpdateAwareness {
  const report = checkPackageUpdateAvailability(install, channel, seams.npm, {
    timeoutMs: seams.budgetMs,
    fetchRetries: 0,
  });
  const version =
    report.status === "update_available" && report.resolved !== null ? `v${report.resolved}` : null;
  return {
    // `unresolved` is the cache's `unknown`: the check could not answer.
    availability: report.status === "unresolved" ? "unknown" : report.status,
    checked_at: seams.now(),
    channel: channel.value,
    current_commit: null,
    remote_commit: null,
    version,
    title: localReleaseTitle(version, install.root),
    note: report.note,
  };
}

/**
 * Port of `_refresh_update_cache`'s question, asked of the clone's own
 * checkout. The `ls-remote` and then the tag lookup share one deadline.
 */
function checkClone(
  repository: string,
  channel: MarkerValue,
  version: string,
  seams: CheckSeams,
): UpdateAwareness {
  const deadline = Date.now() + seams.budgetMs;
  // At least 1 ms: a spawn timeout of 0 is no timeout at all.
  const report = checkUpdateAvailability(
    repository,
    channel.value,
    version,
    Math.max(1, deadline - Date.now()),
  );
  let tag: string | null = null;
  if (report.status === "update_available" && report.remote_commit && report.upstream) {
    const left = deadline - Date.now();
    if (left >= 1)
      tag = remoteTagForCommit(report.upstream, report.remote_commit, repository, left);
  }
  return {
    availability: report.status,
    checked_at: seams.now(),
    channel: channel.value,
    current_commit: report.local_commit,
    remote_commit: report.remote_commit,
    version: tag,
    title: localReleaseTitle(tag, repository),
    note: report.note,
  };
}

function checkInstall(
  install: CheckedInstall,
  channel: MarkerValue,
  version: string,
  seams: CheckSeams,
): UpdateAwareness {
  try {
    return install.kind === "package"
      ? checkPackage(install, channel, seams)
      : checkClone(install.repository, channel, version, seams);
  } catch (error) {
    return {
      availability: "unknown",
      checked_at: seams.now(),
      channel: channel.value,
      current_commit: null,
      remote_commit: null,
      version: null,
      title: null,
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Port of `_update_awareness`, asking the install instead of the cwd.
 *
 * On `stable` the install is asked at every render; on `main`, never. Only
 * `up_to_date` and `update_available` are written. A check that could not
 * answer (`unknown`) leaves the cache as it is, and the card shows what the
 * cache knows, as the status line does. Any other answer (`local_ahead`,
 * `diverged`, `channel_behind`) is an answer: no update to take, and nothing
 * written.
 */
export function updateAwareness(
  homePath: string,
  install: InstallKind,
  channel: MarkerValue,
  version: string,
  env: NodeJS.ProcessEnv,
  seams: CheckSeams,
): { awareness: UpdateAwareness | null; check: RemoteCheck | null } {
  const cached = readUpdateCache(homePath);
  if (remoteUpdateCheckDisabled(env) || channel.value !== "stable" || install.kind === "unknown") {
    return { awareness: cached, check: null };
  }
  const started = Date.now();
  const fresh = checkInstall(install, channel, version, seams);
  const check: RemoteCheck = {
    source: install.kind === "package" ? "registry" : "git",
    verdict: fresh.availability,
    ms: Date.now() - started,
  };
  if (fresh.availability === "up_to_date" || fresh.availability === "update_available") {
    writeUpdateCache(homePath, fresh);
    return { awareness: fresh, check };
  }
  return { awareness: fresh.availability === "unknown" ? cached : fresh, check };
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
export function composeWelcome(options: WelcomeOptions): WelcomeRender {
  const homePath = options.mirrorHome;
  if (homePath === null) return { card: "", check: null };
  const env = options.env ?? process.env;
  const install = options.install;
  // Nothing here reads the cwd (CR135): the channel is the one `runtime
  // channel` reports for this install, and so is everything below.
  const channel = channelFor(install, env, options.osHome ?? homedir());

  const dbPath = join(homePath, dbNameForEnv(env.MEMORY_ENV || "production"));
  const stats = formatStats(readWelcomeStats(existsSync(dbPath) ? dbPath : null));
  const versionLine = `${options.version} · channel ${channel.value}`;
  const { awareness, check } = updateAwareness(homePath, install, channel, options.version, env, {
    npm: options.npm ?? defaultNpmRunner,
    budgetMs: options.remoteBudgetMs ?? WELCOME_REMOTE_BUDGET_MS,
    now: options.now ?? isoNow,
  });
  // A cached update the install already has is not shown (CR135).
  const shown = awareness !== null && verdictApplies(awareness, options.version) ? awareness : null;
  // A package has no checkout to be behind: its "commits behind" line is none.
  const git = install.kind === "clone" ? inspectGit(install.repository) : NO_REPOSITORY;
  const update = updateLine(channel, shown, git);
  return { card: renderWelcome(basename(homePath), stats, versionLine, update), check };
}
