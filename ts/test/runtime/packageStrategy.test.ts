// CV22.DS10.US3 plateau 4 — `runtime update --check` for a package install.
//
// Until this plateau `--check` was git for every install kind: on a package
// it ran `ls-remote` from whatever directory the person stood in. A package
// checks the registry's dist-tags, the same question the pipeline's plan
// stage asks, and says which way the channel lies.

import assert from "node:assert/strict";
import test from "node:test";
import { assertNamesNoInterpreter } from "#helpers/noInterpreter.ts";
import {
  checkPackageUpdateAvailability,
  type NpmRunner,
  renderPackageUpdateAvailability,
} from "#runtime/strategies/package.ts";

const INSTALL = { name: "mirror-mind", version: "0.31.14" };
const STABLE = { value: "stable", note: null };

function npmAnswering(tags: Record<string, string> | null): NpmRunner {
  return (args) => {
    if (args[0] === "view" && tags !== null) {
      return { code: 0, stdout: JSON.stringify(tags), stderr: "" };
    }
    return { code: 1, stdout: "", stderr: "npm ERR! code ENOTFOUND\n" };
  };
}

test("a channel ahead of the install is an available update, named by version", () => {
  const report = checkPackageUpdateAvailability(
    INSTALL,
    STABLE,
    npmAnswering({ stable: "0.32.0", main: "0.33.0" }),
  );
  assert.equal(report.status, "update_available");
  assert.equal(report.resolved, "0.32.0");
  const render = renderPackageUpdateAvailability(report);
  assert.match(render, /^Mirror runtime update check\n\n/);
  assert.match(render, /^Version: 0\.31\.14$/m);
  assert.match(render, /^Install: package \(mirror-mind@0\.31\.14\)$/m);
  assert.match(render, /^Update channel: stable$/m);
  assert.match(render, /^Channel version: 0\.32\.0$/m);
  assert.match(render, /^Availability: update_available$/m);
  assert.match(render, /^Preview:\nruntime update --dry-run$/m);
  assert.match(render, /^Update:\nruntime update$/m);
  assertNamesNoInterpreter(render);
});

test("a channel at the installed version is up to date", () => {
  const report = checkPackageUpdateAvailability(
    INSTALL,
    STABLE,
    npmAnswering({ stable: "0.31.14" }),
  );
  assert.equal(report.status, "up_to_date");
  const render = renderPackageUpdateAvailability(report);
  assert.match(render, /^Availability: up_to_date$/m);
  assert.match(render, /^Next: no update needed$/m);
  assert.doesNotMatch(render, /^Update:$/m);
});

test("a channel behind the install is named as behind, with the channel that carries it", () => {
  // A `main` install that switched to `stable` before stable caught up.
  const report = checkPackageUpdateAvailability(
    INSTALL,
    STABLE,
    npmAnswering({ stable: "0.31.9", main: "0.31.14" }),
  );
  assert.equal(report.status, "channel_behind");
  assert.equal(report.resolved, "0.31.9");
  const render = renderPackageUpdateAvailability(report);
  assert.match(render, /^Availability: channel_behind$/m);
  assert.match(
    render,
    /^Reason: 'stable' is behind the installed version \(0\.31\.9 < 0\.31\.14\)$/m,
  );
  assert.match(render, /^Next: runtime channel main$/m);
  assert.doesNotMatch(render, /^Update:$/m, "a behind channel is never offered as an update");
});

test("an unreachable registry or an unknown tag is unresolved, with the reason", () => {
  const offline = checkPackageUpdateAvailability(INSTALL, STABLE, npmAnswering(null));
  assert.equal(offline.status, "unresolved");
  assert.equal(offline.resolved, null);
  assert.match(renderPackageUpdateAvailability(offline), /^Channel version: unresolved$/m);
  assert.match(renderPackageUpdateAvailability(offline), /^Reason: npm ERR! code ENOTFOUND$/m);

  const untagged = checkPackageUpdateAvailability(
    INSTALL,
    STABLE,
    npmAnswering({ main: "0.33.0" }),
  );
  assert.equal(untagged.status, "unresolved");
  assert.match(untagged.note ?? "", /no dist-tag 'stable'/);

  const notAVersion = checkPackageUpdateAvailability(
    INSTALL,
    STABLE,
    npmAnswering({ stable: "file:/tmp/x" }),
  );
  assert.equal(notAVersion.status, "unresolved");
  assert.match(notAVersion.note ?? "", /is not a version/);
});

test("the channel's own note travels with the report", () => {
  const report = checkPackageUpdateAvailability(
    INSTALL,
    { value: "stable", note: "unknown channel 'beta', defaulting to stable" },
    npmAnswering({ stable: "0.31.14" }),
  );
  assert.match(
    renderPackageUpdateAvailability(report),
    /^Update channel note: unknown channel 'beta', defaulting to stable$/m,
  );
});
