import { describe, expect, it } from 'vitest';
import {
  mockGroupBroadcasts,
  mockPosts,
  mockSportProfiles,
  mockTrendingHashtags,
  mockUpcomingMatches,
} from './mockData';
import type { SportKey } from './types';

// Encodes HF-0's acceptance criteria so backlog coverage guarantees can't
// silently regress when mock data is edited by later tickets.
describe('mockData coverage (HF-0 acceptance criteria)', () => {
  const allSports: SportKey[] = ['football', 'basketball', 'tennis'];

  it('has a sport profile for all 3 sports and no synthetic "All" entry', () => {
    expect(mockSportProfiles.map((s) => s.key).sort()).toEqual([...allSports].sort());
  });

  it('has posts covering all 3 sports', () => {
    const covered = new Set(mockPosts.map((p) => p.sport));
    for (const sport of allSports) {
      expect(covered).toContain(sport);
    }
  });

  it('has at least 1 full and 1 open upcoming match', () => {
    expect(mockUpcomingMatches.some((m) => m.spotsLeft === 0)).toBe(true);
    expect(mockUpcomingMatches.some((m) => m.spotsLeft > 0)).toBe(true);
  });

  it('has at least 4 trending hashtags and 2 broadcasts', () => {
    expect(mockTrendingHashtags.length).toBeGreaterThanOrEqual(4);
    expect(mockGroupBroadcasts.length).toBeGreaterThanOrEqual(2);
  });

  it('uses valid ISO timestamps (posts in the past, matches in the future)', () => {
    const now = Date.now();
    for (const post of mockPosts) {
      expect(new Date(post.createdAt).getTime()).toBeLessThan(now);
    }
    for (const match of mockUpcomingMatches) {
      expect(new Date(match.startsAt).getTime()).toBeGreaterThan(now);
    }
    for (const broadcast of mockGroupBroadcasts) {
      expect(new Date(broadcast.createdAt).getTime()).toBeLessThan(now);
    }
  });
});
