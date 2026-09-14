// CV22.DS7.US8 plateau 7 — one leaf of twenty-seven may reach a provider.
//
// `build load` embeds its query twice and runs the previous conversation's close
// tail. The other twenty-six leaves make no model call at all, and plateau 8's
// route builds family providers only for `load`.
//
// The plan asks for that to be asserted ON THE SEAM rather than as "no call
// happened" (item 18): a test that runs a leaf with no provider configured and
// observes no network traffic proves nothing about the leaf that stops being
// deterministic tomorrow. What is provable, and stays true as the tree grows, is
// REACHABILITY — the provider modules are not in the twenty-six leaves' import
// closure, so no code path through them can construct a provider, spend money, or
// read an API key, whatever the route does.
//
// Reachability is computed over the real source tree rather than declared in a
// list, because a list is exactly the thing that drifts from the code (the US11
// `LLM_ROLES` lesson).

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";

const TS_ROOT = resolve(import.meta.dirname, "..", "..");
const SRC = join(TS_ROOT, "src");
const BUILDER = join(SRC, "builder");
const LOAD = join(BUILDER, "load.ts");
const PROVIDERS = join(SRC, "providers");
const FAMILY_PROVIDERS = join(PROVIDERS, "familyProviders.ts");

const IMPORT_SPECIFIER = /from\s+"([^"]+)"/g;

/** Every `.ts` file under a directory, recursively. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.name.endsWith(".ts") ? [absolute] : [];
  });
}

/**
 * Resolve one import specifier to a file in this package, or null when it leaves
 * it (`node:fs`, a dependency). The `#alias/*` form maps to `src/*` exactly as
 * `package.json`'s `imports` field declares.
 */
function resolveSpecifier(specifier: string, origin: string): string | null {
  if (specifier.startsWith("#")) {
    const [alias, ...rest] = specifier.slice(1).split("/");
    return join(SRC, alias, ...rest);
  }
  if (specifier.startsWith(".")) return resolve(dirname(origin), specifier);
  return null;
}

/** Every module reachable from `entries`, following imports transitively. */
function importClosure(entries: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (seen.has(current)) continue;
    let source: string;
    try {
      source = readFileSync(current, "utf8");
    } catch {
      continue; // a type-only path that does not exist as a file
    }
    seen.add(current);
    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      const target = resolveSpecifier(match[1] as string, current);
      if (target !== null) stack.push(target);
    }
  }
  return seen;
}

function providerModules(closure: Set<string>): string[] {
  return [...closure]
    .filter((file) => file.startsWith(`${PROVIDERS}/`))
    .map((file) => relative(SRC, file))
    .sort();
}

test("no provider module is reachable from the twenty-six deterministic leaves", () => {
  const leaves = sourceFiles(BUILDER).filter((file) => file !== LOAD);
  const closure = importClosure(leaves);

  assert.deepEqual(
    providerModules(closure),
    [],
    "a build leaf other than `load` can now reach the provider seam",
  );
});

test("the closure walker actually walks, so the assertion above cannot pass vacuously", () => {
  // The failure mode of a reachability test is silence: a walker that resolves
  // nothing reports a provider-free closure for every input. These pin that it
  // followed both specifier forms — `#alias/...` across packages and `./...`
  // within the family — and reached a module several hops deep.
  const closure = importClosure([join(BUILDER, "commands.ts")]);

  assert.ok(closure.size > 30, `expected a deep closure, walked ${closure.size} modules`);
  assert.ok(closure.has(join(BUILDER, "pull.ts")), "relative imports are followed");
  assert.ok(closure.has(join(SRC, "identity", "identityRead.ts")), "#alias imports are followed");
});

test("`load` DOES reach the provider seam, which is what makes it the exception", () => {
  // The other half of the same property. If `load` ever stopped importing the
  // seam — because the route started injecting providers, say — the test above
  // would keep passing while describing a tree that no longer exists.
  const closure = importClosure([LOAD]);

  assert.ok(closure.has(FAMILY_PROVIDERS), "load reaches the family provider factory");
  assert.ok(providerModules(closure).length > 1, "and the provider seam behind it");
});

test("only `load` imports the provider seam directly, in the whole family", () => {
  // Cheaper and stricter than reachability, and it catches the case reachability
  // cannot: a module that imports a provider for types alone still declares an
  // intent to reach one, and this family has exactly one leaf entitled to it.
  const importers = sourceFiles(BUILDER).filter((file) =>
    readFileSync(file, "utf8").includes('from "#providers/'),
  );

  assert.deepEqual(
    importers.map((file) => relative(BUILDER, file)),
    ["load.ts"],
  );
});
