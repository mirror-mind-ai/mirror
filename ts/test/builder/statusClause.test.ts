// CR103 — a roadmap status enters Ariad as its first clause.
//
// Every Builder reader of a `**Status:**` line or a status cell read it whole, and the
// rows printed it whole: a package whose status is a changelog printed a hundred card
// lines, and a changelog that named another status steered the candidate filter and the
// recommendation. One function, `statusClause`, reads the line as the status its author
// declared, and it is applied where a status leaves a reader, so the classifiers and
// the formatters are given a clause by construction (D2, D3).

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  inspectPullCandidates,
  inspectRoadmapSnapshot,
  recommend,
  snapshotItemsFromContent,
  statusMarker,
} from "#builder/pullCandidates.ts";
import {
  matchStatus,
  parseCandidateStories,
  STATUS_CLAUSE_WIDTH,
  statusClause,
} from "#builder/roadmapGrammar.ts";
import { resolveRoadmapScope, scopePullCandidates } from "#builder/roadmapScope.ts";

test("statusClause: one row per rule", () => {
  assert.equal(STATUS_CLAUSE_WIDTH, 24);
  const cases: readonly [string, string, string][] = [
    ["a link is its label", "[Done](done.md)", "Done"],
    ["an image is its label", "![icon](icon.png) Done", "icon Done"],
    ["a code span's link stays as written", "`[x](y)` ok", "[x](y) ok"],
    ["** goes", "**🟡 Planned** with emphasis", "🟡 Planned with emphasis"],
    ["__ goes", "__Done__", "Done"],
    ["backticks go", "`done`", "done"],
    ["a ** that closes after the separator", "✅ **Done — 2026-09-23.**", "✅ Done"],
    ["a label's words are the author's words", "[Done, finally](x.md) now", "Done"],
    ["a separator inside a target does not cut", "[Plan](plan - draft.md) now", "Plan now"],
    ["em dash", "🟢 Active — restarted 2026-09-02", "🟢 Active"],
    ["en dash", "Done – validated", "Done"],
    ["spaced hyphen", "In Progress - 3/8", "In Progress"],
    ["a hyphen with no space after it does not cut", "v2 -rc1 pending", "v2 -rc1 pending"],
    ["semicolon", "Dropped; replaced by CV20.DS4.US2", "Dropped"],
    ["comma", "Planned, with CV9.E2.S1 done", "Planned"],
    ["full stop", "Done. Six plateaus.", "Done"],
    ["a dot inside a version does not cut", "Planned for v1.2 release", "Planned for v1.2 release"],
    ["parenthesis", "✅ Done (2026-09-08). `backup`", "✅ Done"],
    ["middle dot", "✅ Done · 2026-05-11", "✅ Done"],
    ["colon", "Blocked: waiting", "Blocked"],
    ["a separator at the start does not cut", "— pending", "— pending"],
    ["trailing punctuation goes", "Done.", "Done"],
    ["a separator at the start does not cut, either way", ". . x", ". . x"],
    ["an empty cut gives way to the reduced line", ".. . x", ".. . x"],
    ["a bare dash is itself", "—", "—"],
    ["an empty status is empty", "", ""],
    ["24 code points stay whole", "🟢 Validated and reviewed", "🟢 Validated and reviewed"],
    [
      "25 and more are clipped at a word, with …",
      "Deferred until the relevant TypeScript migration seams mature",
      "Deferred until the…",
    ],
    ["a word longer than the width is cut inside it", "A".repeat(30), `${"A".repeat(23)}…`],
    ["pyStrip keeps a byte order mark", "\uFEFF🟡 Planned\uFEFF", "\uFEFF🟡 Planned\uFEFF"],
    ["pyStrip strips an ideographic space", "\u3000🟡 Planned\u3000", "🟡 Planned"],
    ["the first physical line is the line", "🟡 Planned — pulled", "🟡 Planned"],
  ];
  for (const [label, line, clause] of cases) {
    assert.equal(statusClause(line), clause, label);
  }
});

const TAIL = "— TAIL after the status, **bold**, [a link](../x.md), `code`";

/** A roadmap with a tailed status in every grammar position Ariad reads. */
function roadmap(root: string): void {
  const r = join(root, "docs/project/roadmap");
  mkdirSync(join(r, "cv1/ds1"), { recursive: true });
  mkdirSync(join(r, "cv3/ds1"), { recursive: true });
  mkdirSync(join(r, "cv3/ds2"), { recursive: true });
  mkdirSync(join(r, "cv3/ds3"), { recursive: true });
  writeFileSync(
    join(r, "index.md"),
    `# Roadmap\n\n| Code | Capability Value | Status |\n|---|---|---|\n| CV1 | Checkout | 🟢 Active ${TAIL} |\n\n` +
      `## CV2: Payments\n\n**Status:** 🟡 Planned ${TAIL}\n\nCandidate Delivery Stories:\n\n- DS1 Pay by card\n`,
    "utf8",
  );
  writeFileSync(
    join(r, "cv1/index.md"),
    `# CV1 — Checkout\n\n**Status:** 🟢 Active ${TAIL}\n`,
    "utf8",
  );
  writeFileSync(
    join(r, "cv1/ds1/index.md"),
    `# CV1.DS1 — Checkout address\n\n**Status:** 🟡 Planned ${TAIL}\n**Type:** Delivery Story\n\n` +
      "## Candidate Stories\n\n| Code | Story | Type | Status |\n|---|---|---|---|\n" +
      `| CV1.DS1.US1 | Enter an address | User Story | 🟡 Planned — Done condition pending |\n` +
      `| CV1.DS1.TS1 | Validate it | Technical Story | ✅ Done ${TAIL} |\n`,
    "utf8",
  );
  writeFileSync(join(r, "cv3/index.md"), "# CV3 — Reports\n\n**Status:** 🟢 Active\n", "utf8");
  writeFileSync(
    join(r, "cv3/ds1/index.md"),
    "# CV3.DS1 — Export to CSV\n\n**Status:** 🔴 Blocked — Planned work waits on the vendor\n**Type:** User Story\n",
    "utf8",
  );
  writeFileSync(
    join(r, "cv3/ds2/index.md"),
    "# CV3.DS2 — Export to PDF\n\n**Status:** 🟡 Candidate\n**Type:** User Story\n",
    "utf8",
  );
  writeFileSync(
    join(r, "cv3/ds3/index.md"),
    "# CV3.DS3 — Monthly digest\n\n**Status:** ✅ Done — Active development moved to CV4\n**Type:** User Story\n",
    "utf8",
  );
}

function withRoadmap<T>(body: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "roadmap-cr103-"));
  try {
    roadmap(root);
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("CR103: every reader yields the clause, and matchStatus still returns the line", () => {
  withRoadmap((root) => {
    const options = { journey: "j", method: "ariad" };
    // The CV table, through the index.
    assert.deepEqual(
      inspectRoadmapSnapshot(root, options).items.map((item) => [item.code, item.status]),
      [["CV1", "🟢 Active"]],
    );
    // The DS table and the `## CV<n>:` heading grammars, through the same reader.
    assert.deepEqual(
      snapshotItemsFromContent(
        `| Code | Delivery Story | Status |\n|---|---|---|\n| DS-1 | Card | 🟡 Planned ${TAIL} |\n`,
      ).map((item) => item.status),
      ["🟡 Planned"],
    );
    assert.deepEqual(
      snapshotItemsFromContent(`## CV9: Legacy\n\n**Status:** ✅ Done ${TAIL}\n`).map(
        (item) => item.status,
      ),
      ["✅ Done"],
    );
    // A package's own line, and the `Candidate Delivery Stories:` bullets.
    const candidates = inspectPullCandidates(root, options).candidates;
    assert.deepEqual(
      candidates.map((candidate) => [candidate.code, candidate.status]),
      [
        ["CV1.DS1", "🟡 Planned"],
        ["CV1", "🟢 Active"],
        ["CV3.DS1", "🔴 Blocked"],
        ["CV3.DS2", "🟡 Candidate"],
        ["CV3", "🟢 Active"],
        ["CV2.DS1", "🟡 Planned"],
      ],
    );
    // The package a journey's scope reads.
    const scope = resolveRoadmapScope(root, { activeItem: "CV1.DS1.US1" });
    assert.ok(scope.kind === "active_item" && scope.position.kind === "cv_package");
    assert.equal(scope.position.package.status, "🟢 Active");
    // The candidate-stories table Expand reads.
    const table = parseCandidateStories(
      readFileSync(join(root, "docs/project/roadmap/cv1/ds1/index.md"), "utf8"),
    ).map((child) => [child.code, child.status]);
    assert.deepEqual(table, [
      ["CV1.DS1.US1", "🟡 Planned"],
      ["CV1.DS1.TS1", "✅ Done"],
    ]);
    // The line itself is still read whole where the line is wanted.
    const line = matchStatus(`**Status:** 🟢 Active ${TAIL}\n`);
    assert.equal(line, `🟢 Active ${TAIL}`);
  });
});

test("CR103: the classifiers read the clause, not the changelog", () => {
  withRoadmap((root) => {
    const report = inspectPullCandidates(root, { journey: "j", method: "ariad" });
    const codes = report.candidates.map((candidate) => candidate.code);
    assert.ok(
      !codes.includes("CV3.DS3"),
      "a Done story whose changelog says Active is no candidate",
    );
    const view = scopePullCandidates(report, resolveRoadmapScope(root, { activeItem: "CV3.DS9" }));
    assert.deepEqual(
      view.shown.map((candidate) => candidate.code),
      ["CV3.DS1", "CV3.DS2"],
    );
    assert.equal(
      view.recommended?.code,
      "CV3.DS2",
      "a Candidate is recommended over a Blocked story whose changelog says Planned",
    );
    assert.equal(recommend(view.shown)?.code, "CV3.DS2");
  });
  assert.equal(
    statusMarker(statusClause("🔴 Blocked — see [the ticket](https://example.com/t/1)")),
    "○ 🔴 blocked",
  );
  assert.equal(statusMarker(statusClause("✅ Done — Active development moved")), "✓ done");
});
