#!/usr/bin/env node
// The `mirror` bin. CV22.DS10.US3, decision D15.
//
// The program is TypeScript run directly by Node -- no build step -- and that
// holds in a checkout and through `npm link`, where the files' real path is
// outside `node_modules`. It does not hold for `npm install -g`: Node refuses
// to strip types for anything under `node_modules`
// (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), a policy with no flag.
//
// So the bin is this one JavaScript file. It registers a load hook that strips
// types for `.ts` files UNDER ITS OWN PACKAGE ROOT ONLY -- never a dependency,
// never the user's project -- and then starts the front door. Every shipped
// path stays what it is in the checkout (D2); the installed tree differs from a
// clone by this file alone, and the checkout carries it too, so `npm link` and
// the install run the same entry.
//
// `registerHooks` and `stripTypeScriptTypes` are experimental in the Node 24
// floor, the same stability class as `node:sqlite`, which the core already
// stands on; `scripts/smoke_npm_package.sh` runs this entry from a real
// global install on CI's Node 24.
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

const { runAsEntry } = await import(new URL("../ts/src/frontDoor/cli.ts", import.meta.url).href);
process.exitCode = await runAsEntry();
