import assert from "node:assert/strict";
import test from "node:test";

import { assertFixtureSafe, redactJson, redactString } from "../../src/providers/redaction.ts";

test("redactString replaces configured secrets and bearer tokens", () => {
  const input = "Authorization: Bearer sk-live-secret and key sk-live-secret";

  const redacted = redactString(input, { secrets: ["sk-live-secret"] });

  assert.equal(redacted, "Authorization: Bearer [REDACTED] and key [REDACTED]");
});

test("redactJson redacts secret-looking keys in nested payloads", () => {
  const payload = {
    ok: true,
    api_key: "sk-json-secret",
    nested: {
      authorization: "Bearer sk-nested-secret",
      token: "token-value",
      public: "visible",
    },
    list: [{ secret: "hidden" }, "plain"],
  };

  assert.deepEqual(redactJson(payload), {
    ok: true,
    api_key: "[REDACTED]",
    nested: {
      authorization: "[REDACTED]",
      token: "[REDACTED]",
      public: "visible",
    },
    list: [{ secret: "[REDACTED]" }, "plain"],
  });
});

test("assertFixtureSafe rejects leaked authorization headers and configured secrets", () => {
  assert.throws(
    () =>
      assertFixtureSafe(
        {
          request: { headers: { Authorization: "Bearer sk-live-secret" } },
          response: { text: "safe" },
        },
        { secrets: ["sk-live-secret"] },
      ),
    /unsafe fixture/i,
  );

  assert.throws(
    () =>
      assertFixtureSafe({ response: "contains sk-live-secret" }, { secrets: ["sk-live-secret"] }),
    /unsafe fixture/i,
  );
});

test("assertFixtureSafe accepts scrubbed fixtures with redaction markers", () => {
  assert.doesNotThrow(() =>
    assertFixtureSafe({
      request: { headers: { Authorization: "[REDACTED]" } },
      response: { text: "ok" },
    }),
  );
});
