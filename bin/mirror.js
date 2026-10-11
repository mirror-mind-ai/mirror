#!/usr/bin/env node
// The `mirror` bin: the front door. CV22.DS10.US3, decision D15.
// The shim it runs on, and why there is one, is `loader.js`.

import { boot } from "./loader.js";

process.exitCode = await boot("ts/src/frontDoor/cli.ts");
