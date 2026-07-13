import { describe, expect, it } from 'vitest';
import { getNextPageParam } from './pagination';
import type { PageResponse } from './types';

function page(overrides: Partial<PageResponse<unknown>>): PageResponse<unknown> {
  return {
    content: [],
    totalPages: 2,
    totalElements: 21,
    number: 0,
    size: 20,
    first: true,
    last: false,
    numberOfElements: 20,
    empty: false,
    ...overrides,
  };
}

describe('getNextPageParam', () => {
  it('returns the next page number when the current page is not last', () => {
    expect(getNextPageParam(page({ number: 0, last: false }))).toBe(1);
    expect(getNextPageParam(page({ number: 3, last: false }))).toBe(4);
  });

  it('returns undefined once the last page is reached, stopping further fetches', () => {
    expect(getNextPageParam(page({ number: 1, last: true }))).toBeUndefined();
  });

  it('returns undefined for a single-page (empty or one-page) result', () => {
    expect(getNextPageParam(page({ number: 0, last: true, empty: true, content: [] }))).toBeUndefined();
  });
});
