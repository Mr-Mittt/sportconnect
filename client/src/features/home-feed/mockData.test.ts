import { describe, expect, it } from 'vitest';
import { mockGroupBroadcasts, mockTrendingHashtags, mockUpcomingMatches } from './mockData';

// Encodes HF-0's acceptance criteria so backlog coverage guarantees can't
// silently regress when mock data is edited by later tickets. Posts coverage
// moved out (FEED-1) — mockPosts is gone, Feed is real now. Sport profiles
// coverage moved to shared/hooks/useSportProfiles.test.ts (FEED-4).
describe('mockData coverage (HF-0 acceptance criteria)', () => {
  it('has at least 1 full and 1 open upcoming match', () => {
    expect(mockUpcomingMatches.some((m) => m.spotsLeft === 0)).toBe(true);
    expect(mockUpcomingMatches.some((m) => m.spotsLeft > 0)).toBe(true);
  });

  it('has at least 4 trending hashtags and 2 broadcasts', () => {
    expect(mockTrendingHashtags.length).toBeGreaterThanOrEqual(4);
    expect(mockGroupBroadcasts.length).toBeGreaterThanOrEqual(2);
  });

  it('uses valid ISO timestamps (matches in the future, broadcasts in the past)', () => {
    const now = Date.now();
    for (const match of mockUpcomingMatches) {
      expect(new Date(match.startsAt).getTime()).toBeGreaterThan(now);
    }
    for (const broadcast of mockGroupBroadcasts) {
      expect(new Date(broadcast.createdAt).getTime()).toBeLessThan(now);
    }
  });
});
