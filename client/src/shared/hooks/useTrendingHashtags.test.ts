import { describe, expect, it } from 'vitest';
import { useTrendingHashtags } from './useTrendingHashtags';

describe('useTrendingHashtags (mock-backed until FEED-6)', () => {
  it('returns the convention shape, already resolved', () => {
    const { isLoading, isError } = useTrendingHashtags();

    expect(isLoading).toBe(false);
    expect(isError).toBe(false);
  });

  it('has at least 4 trending hashtags', () => {
    expect(useTrendingHashtags().data.length).toBeGreaterThanOrEqual(4);
  });
});
