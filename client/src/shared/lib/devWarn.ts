const seen = new Set<string>();

/**
 * SPORT-13: dev-only `console.warn`, deduped by `key`, no-op in production builds.
 *
 * Used by the attribute-layout renderers on their degrade paths — an unrecognised `layout.id`, a
 * `layout` that isn't a valid object, an inapplicable layout (a `slider` with no bounds), or an
 * unparseable `format` pattern. Those all fall back to the default rendering rather than throwing,
 * so the warning is the only signal a schema author gets that their hint did nothing.
 *
 * Deduped so a warning on a node that renders inside a `DEFINITION_LIST` (once per row) or in a
 * re-rendering form doesn't flood the console — the first occurrence per `key` is enough.
 */
export function devWarn(key: string, message: string): void {
  if (!import.meta.env.DEV) return;
  if (seen.has(key)) return;
  seen.add(key);
  console.warn(`[attribute-layout] ${message}`);
}

/** Test-only: clear the dedupe set so each test starts from a clean slate. */
export function resetDevWarnCache(): void {
  seen.clear();
}
