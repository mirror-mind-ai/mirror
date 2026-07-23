// Port of src/memory/utils.py (strip_accents, kebab_slug). Registered in
// ts/parity/oracle-baseline.json.
//
// kebab_slug is the canonical filesystem-safe slug for roadmap folders,
// journey slugs, and exploration folders across the Python codebase (builder
// story paths, explorer handoff ids, JourneyService.draft_journey). Ported
// here as ONE shared function for both writer and locator call sites, per the
// DS7.US1 rider: the original Python bug this guards against was
// writer/locator drift from two independently-hand-rolled slugifiers.

/**
 * Port of `strip_accents`: NFD-decompose, then drop every Unicode
 * Nonspacing_Mark codepoint (Python's `unicodedata.category(c) == "Mn"`) --
 * e.g. "episódio" -> "episodio". Both runtimes resolve category membership
 * against the same kind of Unicode Character Database assignment (ICU-backed
 * in Python's `unicodedata` and in V8's Unicode property escapes), verified
 * against the live oracle for a broad accent/script sample rather than
 * assumed equivalent.
 */
export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{Mn}/gu, "");
}

/**
 * Port of `kebab_slug`: lowercase, strip accents, collapse every run of
 * non-`[a-z0-9]` characters to a single hyphen, trim edge hyphens, then
 * hard-cap at `maxLength` characters (re-trimming any edge hyphen the cap
 * itself exposes) so a single directory component can never exceed the
 * filesystem NAME_MAX limit (255 bytes). Truncation is safe as plain UTF-16
 * slicing because by this point the string contains only ASCII
 * `[a-z0-9-]` characters -- the accent-stripping and character-class
 * collapse already happened, so there is no multi-code-unit codepoint for a
 * slice boundary to split.
 *
 * Returns "" when no alphanumeric content remains; callers decide how to
 * handle that (bare code prefix, fallback token, or a validation error) --
 * this function never substitutes a default itself.
 */
export function kebabSlug(text: string, maxLength = 80): string {
  const normalized = stripAccents(text).toLowerCase();
  let slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length > maxLength) {
    slug = slug.slice(0, maxLength).replace(/^-+|-+$/g, "");
  }
  return slug;
}
