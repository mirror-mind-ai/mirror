// CV21.DS5.US2 — what each runtime holds of a home's extensions plugin, read from
// the runtime's own files, and the lines a person reads about it.
//
// One reading serves two surfaces. `mirror extensions install|uninstall|sync` print
// the block after their report: the runtimes on the PATH that still need a step, or
// one line saying the plugin is wired everywhere. `mirror runtime diagnose` turns the
// same reading into findings. The two cannot disagree because they do not read twice.
//
// Every home is taken from the env the caller hands in (HOME, CODEX_HOME,
// GROK_HOME), never from the process: a test or a route passes stand-ins and a
// maintainer's real wiring never reaches a fixture (CR123/128/137/142).
//
// For this plugin, stale is NOT EQUAL, not "less than": the home generates every
// version, so a copy at a version the home does not hold is stale whichever way it
// differs. A `runtime/plugin/` removed by hand restarts the generation at 1, and a
// copy that then reads "ahead" must still fire (plan amendment 5).

import { join } from "node:path";
import type { ExtensionPluginReport } from "#extensions/extensionPlugin.ts";
import {
  agyPluginCopyState,
  codexPluginCacheState,
  grokPluginCopyState,
  pluginLinkState,
} from "./pluginWiring.ts";
import {
  detectRuntimes,
  EXTENSION_PLUGIN_GROK_TRUST_NOTE,
  type ExtensionPluginPaths,
  extensionPluginReinstallCommand,
  extensionPluginWiringSteps,
  RUNTIME_WIRING,
  type RuntimeName,
} from "./wiring.ts";

export type ExtensionPluginState = "not_wired" | "wired" | "stale" | "dangling" | "duplicated";

export interface ExtensionPluginRuntimeState {
  readonly runtime: RuntimeName;
  readonly title: string;
  readonly state: ExtensionPluginState;
  /** What the runtime holds: `copy at 0.1.2`, `2 copies`, `link dangling`. */
  readonly detail: string;
  /** The path the finding names. */
  readonly subject: string;
  /** The commands that bring the runtime level, in order; empty when wired. */
  readonly steps: readonly string[];
}

export interface ExtensionPluginHomes {
  readonly home: string | null;
  readonly codexHome: string | null;
  readonly grokHome: string | null;
  readonly geminiHome: string | null;
}

/** The homes, defaulted here from the env and never inside a reader. */
export function extensionPluginHomes(env: NodeJS.ProcessEnv): ExtensionPluginHomes {
  const home = env.HOME?.trim() || null;
  return {
    home,
    codexHome: env.CODEX_HOME?.trim() || (home ? join(home, ".codex") : null),
    grokHome: env.GROK_HOME?.trim() || (home ? join(home, ".grok") : null),
    geminiHome: home ? join(home, ".gemini") : null,
  };
}

export function extensionPluginPaths(plugin: ExtensionPluginReport): ExtensionPluginPaths {
  return { dir: plugin.directory, marketplace: plugin.marketplaceRoot, name: plugin.name };
}

/** One runtime's reading. Pi takes extensions through its catalog and is never read. */
export function extensionPluginRuntimeState(
  runtime: RuntimeName,
  plugin: ExtensionPluginReport,
  homes: ExtensionPluginHomes,
): ExtensionPluginRuntimeState | null {
  const paths = extensionPluginPaths(plugin);
  const title = RUNTIME_WIRING[runtime].title;
  const wire = extensionPluginWiringSteps(runtime, paths);
  const reinstall = extensionPluginReinstallCommand(runtime, paths);
  const notWired = (subject: string): ExtensionPluginRuntimeState => ({
    runtime,
    title,
    state: "not_wired",
    detail: "not wired",
    subject,
    steps: wire,
  });
  const stale = (subject: string, held: string): ExtensionPluginRuntimeState => ({
    runtime,
    title,
    state: "stale",
    detail: `copy at ${held}`,
    subject,
    steps: reinstall === null ? [] : [reinstall],
  });
  const wired = (subject: string): ExtensionPluginRuntimeState => ({
    runtime,
    title,
    state: "wired",
    detail: "wired",
    subject,
    steps: [],
  });

  switch (runtime) {
    case "pi":
      return null;
    case "claude": {
      if (homes.home === null) return null;
      const link = pluginLinkState(join(homes.home, ".claude", "skills", plugin.name));
      if (link.state === "absent") return notWired(link.linkPath);
      if (link.state === "dangling") {
        return {
          runtime,
          title,
          state: "dangling",
          detail: `link dangling (points at ${link.target ?? "an unreadable target"})`,
          subject: link.linkPath,
          steps: [
            `rm ~/.claude/skills/${plugin.name} && ln -s "${paths.dir}" ~/.claude/skills/${plugin.name}`,
          ],
        };
      }
      return wired(link.linkPath);
    }
    case "codex": {
      if (homes.codexHome === null) return null;
      const cache = codexPluginCacheState(homes.codexHome, plugin.version, {
        marketplace: plugin.name,
        name: plugin.name,
      });
      if (cache.state === "absent") return notWired(cache.cachePath);
      if (cache.state === "current") return wired(cache.cachePath);
      return stale(cache.cachePath, cache.newestCached ?? "?");
    }
    case "antigravity": {
      if (homes.geminiHome === null) return null;
      const copy = agyPluginCopyState(homes.geminiHome, plugin.version, plugin.name);
      if (copy.state === "absent") return notWired(copy.copyPath);
      if (copy.state === "current") return wired(copy.copyPath);
      return stale(copy.copyPath, copy.copiedVersion ?? "?");
    }
    case "grok": {
      if (homes.grokHome === null) return null;
      const copy = grokPluginCopyState(homes.grokHome, plugin.version, plugin.name);
      if (copy.copies.length > 1) {
        return {
          runtime,
          title,
          state: "duplicated",
          detail: `${copy.copies.length} copies (${copy.copies.map((c) => `${c.key} at ${c.version}`).join(", ")}); Grok loads one and does not say which`,
          subject: copy.registryPath,
          steps: [
            `grok plugin uninstall ${plugin.name} --confirm (until \`grok plugin list\` shows none)`,
            ...(reinstall === null ? [] : [reinstall]),
          ],
        };
      }
      if (copy.state === "absent") return notWired(copy.registryPath);
      const subject = copy.copies[0]?.path ?? copy.registryPath;
      if (copy.state === "current") return wired(subject);
      return stale(subject, copy.newestCopied ?? "?");
    }
  }
}

/** The readings for the runtimes on the PATH, in display order; Pi never appears. */
export function extensionPluginStates(
  plugin: ExtensionPluginReport,
  env: NodeJS.ProcessEnv,
  isExecutable: (path: string) => boolean,
): ExtensionPluginRuntimeState[] {
  const homes = extensionPluginHomes(env);
  const states: ExtensionPluginRuntimeState[] = [];
  for (const runtime of detectRuntimes(env, isExecutable)) {
    const state = extensionPluginRuntimeState(runtime, plugin, homes);
    if (state !== null) states.push(state);
  }
  return states;
}

/**
 * The block a person reads after an `extensions` report: what needs action and
 * nothing else (plan amendment 18); after an uninstall, a stale copy "still has"
 * what was removed (amendment 19). With no runtime on the PATH, the first line alone.
 */
export function renderExtensionPluginBlock(
  plugin: ExtensionPluginReport,
  states: readonly ExtensionPluginRuntimeState[],
  removed: readonly string[] = [],
): string[] {
  const skills = `${plugin.skills} skill${plugin.skills === 1 ? "" : "s"}`;
  // An installed extension with no `claude` block is off the four runtimes, and the
  // person is told which, not left to count (plan amendment 6 of the Debt Review).
  const notCarried =
    plugin.notCarried.length === 0
      ? []
      : [`    not carried (no claude block in skill.yaml): ${plugin.notCarried.join(", ")}`];
  const actionable = states.filter((state) => state.state !== "wired");
  if (states.length > 0 && actionable.length === 0) {
    return [
      `  plugin: ${plugin.name} ${plugin.version}, ${skills}, wired on ${states.map((s) => s.title).join(", ")}`,
      ...notCarried,
    ];
  }
  const lines = [`  plugin: ${plugin.name} ${plugin.version}, ${skills}`, ...notCarried];
  for (const state of actionable) {
    const detail =
      state.state === "stale" && removed.length > 0
        ? `still has ${removed.join(", ")}`
        : state.detail;
    const [first, ...rest] = state.steps;
    lines.push(`    ${state.title}: ${detail}${first ? ` — ${first}` : ""}`);
    for (const step of rest) lines.push(`    ${" ".repeat(state.title.length + 2)}then ${step}`);
    if (state.runtime === "grok" && state.state === "not_wired") {
      lines.push(`    ${" ".repeat(state.title.length + 2)}${EXTENSION_PLUGIN_GROK_TRUST_NOTE}`);
    }
  }
  return lines;
}
