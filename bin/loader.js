// The one loader shim behind every Mirror bin. CV22.DS10.US3, decisions D15 and D5.
//
// The program is TypeScript run directly by Node -- no build step -- and that
// holds in a checkout and through `npm link`, where the files' real path is
// outside `node_modules`. It does not hold for `npm install -g`: Node refuses
// to strip types for anything under `node_modules`
// (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), a policy with no flag.
//
// So each bin is a JavaScript file that calls `boot` with its entry. `boot`
// registers a load hook that strips types for `.ts` files UNDER THIS PACKAGE
// ROOT ONLY -- never a dependency, never the user's project -- and then
// imports the entry and runs it. Every shipped path stays what it is in the
// checkout (D2); the installed tree differs from a clone by the `bin/`
// directory alone, and the checkout carries it too, so `npm link` and the
// install run the same entries.
//
// Two bins share this file rather than each carrying the shim: `mirror`
// (`frontDoor/cli.ts`) and `mirror-hook` (`hooks/main.ts`, D5). The hook
// wrappers run the second one wherever they are -- in a checkout, under
// `npm root -g`, or copied into Claude Code's plugin cache.
//
// `registerHooks` and `stripTypeScriptTypes` are experimental in the Node 24
// floor, the same stability class as `node:sqlite`, which the core already
// stands on; `scripts/smoke_npm_package.sh` runs both bins from a real global
// install on CI's Node 24.
//
// The warning filter below is the shim's own copy, because the hook emits its
// ExperimentalWarning before the core's filter can be imported through it.

import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "ExperimentalWarning") return;
  process.stderr.write(`${warning.name}: ${warning.message}\n`);
});

const packageRoot = new URL("../", import.meta.url).href;

registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith(packageRoot) && url.endsWith(".ts")) {
      const source = readFileSync(fileURLToPath(url), "utf8");
      return {
        format: "module",
        source: stripTypeScriptTypes(source, { mode: "strip" }),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

/**
 * Import the entry at `entryPath` (relative to the package root) and run its
 * `runAsEntry()`, which every Mirror entry exports: it loads configuration,
 * silences the sqlite warning, and returns the exit code.
 *
 * @param {string} entryPath
 * @returns {Promise<number>}
 */
export async function boot(entryPath) {
  const { runAsEntry } = await import(new URL(entryPath, packageRoot).href);
  return runAsEntry();
}
