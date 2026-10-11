#!/usr/bin/env node
// The `mirror-hook` bin: the hook entry every wrapper runs. CV22.DS10.US3, D5.
// The shim it runs on, and why there is one, is `loader.js`.

import { boot } from "./loader.js";

process.exitCode = await boot("ts/src/hooks/main.ts");
