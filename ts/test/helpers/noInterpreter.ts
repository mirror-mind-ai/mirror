// Assert that something the product PRINTS sends nobody back to the Python core
// (CV22.DS10.TS5 plateau 4).
//
// The `python-core-mentions` row of the retired-surface guard reads tracked
// files. It cannot see a recommendation, a recovery route, or a usage hint the
// code assembles at runtime -- the shape US2 found when `update --check`
// recommended the Python invocation of `runtime update` on both engines. Those
// renders are graded here, against the row's own pattern list, so a test that
// asserts "no interpreter" checks every shape the guard forbids rather than the
// one its author happened to remember.

import assert from "node:assert/strict";

import { INTERPRETER_INVOCATIONS } from "#guards/retiredSurfaces.ts";

export function assertNamesNoInterpreter(text: string, message?: string): void {
  for (const pattern of INTERPRETER_INVOCATIONS) {
    const found = new RegExp(pattern).exec(text);
    assert.equal(
      found,
      null,
      `${message ? `${message}: ` : ""}the output tells a user to run the deleted Python core (\`${found?.[0]}\`)`,
    );
  }
}
