import { describe, expect, it } from 'vitest';

/*
 * The owner's rule (2026-11-13): an empty-state hint is always centered, app-wide. `EmptyHint` is the one
 * way to render it. This guard fails when a component renders an "empty / no results / no matches" copy key
 * in a bare muted `<p>` or `<div>` again, which is how a left-aligned one would sneak back in.
 */
const sources = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

const BARE_EMPTY_HINT =
  /className="[^"]*text-text-muted[^"]*">\s*\{t\('[^']*(?:empty|Empty|noResults|noMatches)[^']*'[^)]*\)\}/;

describe('empty-state hints use EmptyHint', () => {
  it('no component renders an empty / noResults / noMatches key in a bare muted element', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !/\.(stories|test)\.tsx$/.test(path) && !path.endsWith('/EmptyHint.tsx'))
      .filter(([, source]) => BARE_EMPTY_HINT.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
