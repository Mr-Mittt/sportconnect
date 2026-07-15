import { describe, expect, it } from 'vitest';
import { useUpcomingMatches } from './useUpcomingMatches';

describe('useUpcomingMatches (mock-backed for this whole MVP)', () => {
  it('returns the convention shape, already resolved', () => {
    const { data, isLoading, isError } = useUpcomingMatches();

    expect(isLoading).toBe(false);
    expect(isError).toBe(false);
    expect(data.length).toBeGreaterThan(0);
  });

  it('has at least 1 full and 1 open upcoming match', () => {
    const { data } = useUpcomingMatches();

    expect(data.some((m) => m.spotsLeft === 0)).toBe(true);
    expect(data.some((m) => m.spotsLeft > 0)).toBe(true);
  });

  it('every match starts in the future', () => {
    const now = Date.now();

    for (const match of useUpcomingMatches().data) {
      expect(new Date(match.startsAt).getTime()).toBeGreaterThan(now);
    }
  });
});
