// Self-test for the docs link/anchor checker and the roadmap heading guard.
//
// All 26 cases of `tests/unit/memory/test_docs_lint.py`, carried into
// TypeScript by CV22.DS10.TS5 slice B before the Python original is deleted.
//
// Why they are carried rather than dropped: each case reproduces a failure
// mode the checker actually caught -- or once missed -- during the repo-wide
// docs audit. `scripts/check_doc_links.py` is a 57-line wrapper with no test
// of its own, so these assertions ARE the checker's specification. Porting
// the script without them would have shipped the docs gate untested, in the
// story that rewrites ten documentation files (see the story's inventory,
// finding F1).

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";

import {
  checkFile,
  checkRepo,
  checkRoadmapDuplicateHeadings,
  computeAnchors,
  slugify,
  stripFencedCode,
} from "#docs/docsLint.ts";

const roots: string[] = [];

function tmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "mirror-docs-lint-"));
  roots.push(dir);
  return dir;
}

function write(root: string, relPath: string, content: string): string {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
  return full;
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("slugify", () => {
  test("preserves underscores", () => {
    // The real bug this guards: docs/reference/configuration.md linked to
    // `#memory-env` for a `## MEMORY_ENV` heading. GitHub's slugger keeps
    // underscores; hyphenating them produces a dead anchor.
    assert.equal(slugify("MEMORY_LOG_LLM_CALLS"), "memory_log_llm_calls");
  });

  test("preserves existing hyphens", () => {
    assert.equal(slugify("Local-first architecture"), "local-first-architecture");
  });

  test("strips punctuation to a double hyphen", () => {
    // An em dash is not a hyphen: it is stripped outright, leaving the
    // surrounding spaces to collapse into a double hyphen. This is the exact
    // pattern behind `D1 — Local-first architecture`.
    assert.equal(slugify("D1 — Local-first architecture"), "d1--local-first-architecture");
  });

  test("strips backticks and slashes", () => {
    assert.equal(slugify("`src/memory/skills/`"), "srcmemoryskills");
  });
});

describe("computeAnchors", () => {
  test("disambiguates duplicate headings", () => {
    const anchors = computeAnchors("# Intro\n## Setup\n## Setup\n");
    assert.deepEqual([...anchors].sort(), ["intro", "setup", "setup-1"]);
  });

  test("an empty document has no anchors", () => {
    assert.equal(computeAnchors("just prose, no headings\n").size, 0);
  });
});

describe("stripFencedCode", () => {
  test("removes link-like text inside a fence", () => {
    const stripped = stripFencedCode("before\n```\n[fake](nonexistent.md)\n```\nafter\n");
    assert.ok(!stripped.includes("[fake]"));
  });

  test("preserves line count so reported lines stay accurate", () => {
    const text = "before\n```\nline\nline\n```\nafter\n";
    const stripped = stripFencedCode(text);
    const count = (s: string) => (s.match(/\n/g) ?? []).length;
    assert.equal(count(stripped), count(text));
  });
});

describe("checkFile", () => {
  test("flags a missing target", () => {
    const root = tmpRoot();
    const doc = write(root, "a.md", "See [broken](missing.md).\n");

    const problems = checkFile(doc, root);

    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.reason, "target file does not exist");
    assert.equal(problems[0]?.line, 1);
  });

  test("accepts an existing target", () => {
    const root = tmpRoot();
    write(root, "b.md", "# B\n");
    const doc = write(root, "a.md", "See [ok](b.md).\n");

    assert.deepEqual(checkFile(doc, root), []);
  });

  test("flags a missing anchor in the same file", () => {
    const root = tmpRoot();
    const doc = write(root, "a.md", "# Real Heading\n\nSee [bad](#nope).\n");

    const problems = checkFile(doc, root);

    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.reason, "anchor not found in this file");
  });

  test("accepts a valid cross-file anchor", () => {
    const root = tmpRoot();
    write(root, "b.md", "## Target Section\n");
    const doc = write(root, "a.md", "See [ok](b.md#target-section).\n");

    assert.deepEqual(checkFile(doc, root), []);
  });

  test("flags a missing anchor in the target file", () => {
    const root = tmpRoot();
    write(root, "b.md", "## Real Section\n");
    const doc = write(root, "a.md", "See [bad](b.md#not-real).\n");

    const problems = checkFile(doc, root);

    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.reason, "anchor not found in target file");
  });

  test("skips link-like text inside fenced code", () => {
    // The exact false positive found mid-audit: an "api, []" example inside a
    // fenced block was originally scanned as a broken link.
    const root = tmpRoot();
    const doc = write(root, "a.md", "```\n[fake link](does-not-exist.md)\n```\n");

    assert.deepEqual(checkFile(doc, root), []);
  });

  test("ignores external links", () => {
    const root = tmpRoot();
    const doc = write(root, "a.md", "[Docs](https://example.com/nonexistent)\n");

    assert.deepEqual(checkFile(doc, root), []);
  });

  test("excludes roadmap template placeholder links", () => {
    // roadmap/templates/*.md link to a bare `index.md` breadcrumb that only
    // resolves once the template is copied into a real story folder.
    // templates/ itself never has an index.md -- by design, not a bug.
    const root = tmpRoot();
    const doc = write(
      root,
      "docs/project/roadmap/templates/plan.md",
      "[< Story index](index.md)\n",
    );

    assert.deepEqual(checkFile(doc, root), []);
  });

  test("does not exempt index.md outside templates", () => {
    const root = tmpRoot();
    const doc = write(root, "docs/some-story/plan.md", "[< Story index](index.md)\n");

    const problems = checkFile(doc, root);

    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.reason, "target file does not exist");
  });
});

describe("checkRepo", () => {
  test("aggregates problems across files", () => {
    const root = tmpRoot();
    write(root, "good.md", "# Good\n");
    write(root, "bad.md", "[dead](nowhere.md)\n");

    const problems = checkRepo(root);

    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.sourceFile, "bad.md");
  });

  test("a clean tree has no problems", () => {
    const root = tmpRoot();
    write(root, "a.md", "# A\n\nSee [b](b.md).\n");
    write(root, "b.md", "# B\n");

    assert.deepEqual(checkRepo(root), []);
  });

  test("skips parity fixture trees", () => {
    // CV22.DS7.US8: `ts/test/fixtures/**` carries authored-Markdown edge cases
    // an oracle is graded on -- dangling links and duplicate heading codes
    // among them. Linting them as docs would force the fixtures to stop being
    // fixtures.
    const root = tmpRoot();
    write(
      root,
      "ts/test/fixtures/builder-roadmap/docs/project/roadmap/index.md",
      "# Roadmap\n\n[dangling](does-not-exist.md)\n",
    );

    assert.deepEqual(checkRepo(root), []);
  });

  test("still checks a real docs fixtures directory", () => {
    // The skip is narrow: `fixtures` counts only beneath `test`/`tests`, so a
    // documentation tree that happens to use the word is still linted.
    const root = tmpRoot();
    write(root, "docs/reference/fixtures/index.md", "# Fixtures\n\n[dead](nowhere.md)\n");

    const problems = checkRepo(root);

    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.sourceFile, "docs/reference/fixtures/index.md");
  });
});

describe("checkRoadmapDuplicateHeadings", () => {
  // The CI guard for the class of defect fixed by `resolveStoryDirectory`'s
  // "one code -> one package" invariant -- first seen as CR048 (DS6.TS5),
  // recurring as CV22.DS7.

  test("a clean roadmap has no duplicates", () => {
    const root = tmpRoot();
    write(root, "docs/project/roadmap/cv2-ds1/index.md", "# CV2.DS1 — Title\n");

    assert.deepEqual(checkRoadmapDuplicateHeadings(root), []);
  });

  test("flags two packages claiming the same code", () => {
    const root = tmpRoot();
    for (const suffix of ["a", "b"]) {
      write(root, `docs/project/roadmap/cv2-ds1-${suffix}/index.md`, "# CV2.DS1 — Duplicate\n");
    }

    const problems = checkRoadmapDuplicateHeadings(root);

    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.code, "CV2.DS1");
    assert.deepEqual(problems[0]?.paths, [
      "docs/project/roadmap/cv2-ds1-a/index.md",
      "docs/project/roadmap/cv2-ds1-b/index.md",
    ]);
  });

  test("reports a missing roadmap directory as clean", () => {
    assert.deepEqual(checkRoadmapDuplicateHeadings(tmpRoot()), []);
  });

  test("ignores legacy archive packages", () => {
    const root = tmpRoot();
    write(root, "docs/project/roadmap/cv2-ds1/index.md", "# CV2.DS1 — Live\n");
    write(root, "docs/project/roadmap/legacy/cv2-ds1/index.md", "# CV2.DS1 — Archived\n");

    assert.deepEqual(checkRoadmapDuplicateHeadings(root), []);
  });

  test("handles a repo root that is not pre-resolved", () => {
    // `findDuplicateRoadmapHeadings` returns already-resolved directories; a
    // non-normalized root -- one holding a trailing "..", or on macOS a
    // /var -> /private/var symlink -- must still produce repo-relative paths.
    // Real bug caught by manual smoke-testing: green unit tests alone missed
    // it because the temp directory happened to be pre-resolved.
    const root = tmpRoot();
    for (const suffix of ["a", "b"]) {
      write(root, `docs/project/roadmap/cv2-ds1-${suffix}/index.md`, "# CV2.DS1 — Duplicate\n");
    }
    const nonNormalizedRoot = join(root, "unrelated", "..");

    const problems = checkRoadmapDuplicateHeadings(nonNormalizedRoot);

    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.code, "CV2.DS1");
    assert.deepEqual(problems[0]?.paths, [
      "docs/project/roadmap/cv2-ds1-a/index.md",
      "docs/project/roadmap/cv2-ds1-b/index.md",
    ]);
  });
});
