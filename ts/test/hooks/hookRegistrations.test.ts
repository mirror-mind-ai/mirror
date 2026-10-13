// The hook registrations: the plugin's `hooks.json` and the checkout's
// `.claude/settings.json` (CV21.DS2.TS5).
//
// Both are hand-authored, and both name the same four wrappers (five after
// US8). What they say about each command is behavior on three runtimes:
//
//   * the plugin-root variable must be quoted, or a plugin installed under a
//     path with a space splits into several words (Claude Code 2.1.296's
//     validator warns on it; DS12.TS1 static 1). The exec form the validator
//     offers instead (`args`) is not an option: Grok skips any handler that
//     sets `args` (Grok's bundled guide, `10-hooks.md`);
//   * `timeout` is in seconds on Claude Code and Grok. The values the plugin
//     carried, 15000 and 30000, were 4 and 8 hours, so no hook ever timed out,
//     and a hung one held the turn. The SessionStart hook runs maintenance
//     that calls the LLM before it prints the Operating Instructions, which
//     is why its bound is generous rather than the 15 the old value intended.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

interface Handler {
  readonly type?: string;
  readonly command?: string;
  readonly timeout?: unknown;
  readonly async?: unknown;
}
interface Group {
  readonly matcher?: string;
  readonly hooks?: Handler[];
}
type Registrations = Record<string, Group[]>;

function registrations(path: string): Registrations {
  const parsed = JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8")) as {
    hooks: Registrations;
  };
  return parsed.hooks;
}

function handlers(all: Registrations): [string, Handler][] {
  const out: [string, Handler][] = [];
  for (const [event, groups] of Object.entries(all)) {
    for (const group of groups) for (const handler of group.hooks ?? []) out.push([event, handler]);
  }
  return out;
}

/** The longest a plugin hook may hold a turn, in seconds. */
const TIMEOUT_CEILING_SECONDS = 300;

describe("the hook registrations", () => {
  const files: [string, RegExp, string][] = [
    // registration file, the shape every command must have, the wrapper directory
    [
      "plugins/mirror-mind/hooks/hooks.json",
      /^"\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([a-z-]+\.sh)"$/,
      "plugins/mirror-mind/hooks",
    ],
    [
      ".claude/settings.json",
      /^"\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/([a-z-]+\.sh)"$/,
      ".claude/hooks",
    ],
  ];

  for (const [file, shape, wrapperDir] of files) {
    describe(file, () => {
      const all = handlers(registrations(file));

      test("registers at least the four hooks the plugin always carried", () => {
        const events = new Set(all.map(([event]) => event));
        for (const event of ["SessionStart", "UserPromptSubmit", "SessionEnd"]) {
          assert.ok(events.has(event), `${event} is registered`);
        }
      });

      test("quotes the root variable in every command, and names a wrapper that exists", () => {
        for (const [event, handler] of all) {
          assert.equal(handler.type, "command", `${event}: a command handler`);
          const match = shape.exec(handler.command ?? "");
          assert.ok(match, `${event}: ${handler.command} is a quoted root-relative wrapper path`);
          const wrapper = join(REPO_ROOT, wrapperDir, match?.[1] ?? "");
          assert.ok(existsSync(wrapper), `${event}: ${wrapper} exists`);
        }
      });

      test("reads every timeout as seconds, and bounds it", () => {
        for (const [event, handler] of all) {
          if (handler.timeout === undefined) continue;
          assert.ok(
            Number.isInteger(handler.timeout) &&
              (handler.timeout as number) >= 1 &&
              (handler.timeout as number) <= TIMEOUT_CEILING_SECONDS,
            `${event}: timeout ${String(handler.timeout)} is 1..${TIMEOUT_CEILING_SECONDS} seconds`,
          );
        }
      });
    });
  }

  test("the plugin and the checkout register the same wrappers on the same events", () => {
    const pick = (file: string) =>
      handlers(registrations(file))
        .map(([event, handler]) => `${event} ${(handler.command ?? "").replace(/^.*\//, "")}`)
        .sort();
    assert.deepEqual(pick("plugins/mirror-mind/hooks/hooks.json"), pick(".claude/settings.json"));
  });
});
