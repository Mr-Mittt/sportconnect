import { describe, expect, it } from 'vitest';
import { useGroupBroadcasts } from './useGroupBroadcasts';

describe('useGroupBroadcasts (mock-backed until FEED-7)', () => {
  it('returns the convention shape, already resolved', () => {
    const { isLoading, isError } = useGroupBroadcasts();

    expect(isLoading).toBe(false);
    expect(isError).toBe(false);
  });

  it('has at least 2 broadcasts, all created in the past', () => {
    const { data } = useGroupBroadcasts();
    const now = Date.now();

    expect(data.length).toBeGreaterThanOrEqual(2);
    for (const broadcast of data) {
      expect(new Date(broadcast.createdAt).getTime()).toBeLessThan(now);
    }
  });
});
