import type { GroupBroadcast, TrendingHashtag, UpcomingMatch } from './types';

/*
 * Mock data ported from the approved mockup (design-reference/design-reference-home-feed.html).
 * Temporary stand-in: hashtags and broadcasts get swapped for real API data in
 * the integration phase (FEED-6, FEED-7); matches stay mock until a matches
 * backend exists. Components must never import these arrays directly — access
 * goes through the useHomeFeedData() hook (HF-7). Sport profiles moved to
 * `@/shared/hooks/useSportProfiles` (FEED-4) — the Groups page needs them too.
 */

// The mockup shows relative times ('2h ago', 'Tomorrow'). Timestamps are computed
// from load time so the UI renders the same relative labels on any day.
const HOUR_MS = 60 * 60 * 1000;

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString();
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * HOUR_MS).toISOString();
}

// mockPosts (FEED-1) removed — Feed is real now, backed by usePersonalFeed().
// See e2e/mocks/handlers/feed.ts for the MSW fixture that mirrors this same
// 4-post set (same authors/counts/hashtags/sport split) in the real shape.

export const mockUpcomingMatches: UpcomingMatch[] = [
  {
    id: 'match-1',
    sport: 'football',
    title: 'FC Weekend Warriors vs Riverside FC',
    startsAt: hoursFromNow(24), // mockup: "Tomorrow, 7:00 PM"
    location: 'Central Turf Park',
    spotsLeft: 2,
  },
  {
    id: 'match-2',
    sport: 'basketball',
    title: 'Sunday pickup run',
    startsAt: hoursFromNow(72), // mockup: "Sun, 9:00 AM"
    location: 'Riverside Courts',
    spotsLeft: 4,
  },
  {
    id: 'match-3',
    sport: 'tennis',
    title: 'Singles ladder match vs D. Alvarez',
    startsAt: hoursFromNow(96), // mockup: "Wed, 6:30 PM"
    location: 'Greenwood Club',
    spotsLeft: 0, // full — CTA reads "Full, view details" (HF-4)
  },
];

export const mockTrendingHashtags: TrendingHashtag[] = [
  { tag: '#fridayrun', postCount: 128 },
  { tag: '#tournament', postCount: 94 },
  { tag: '#pickup', postCount: 61 },
  { tag: '#tennislife', postCount: 47 },
];

export const mockGroupBroadcasts: GroupBroadcast[] = [
  {
    id: 'broadcast-1',
    groupId: 'group-1',
    groupName: 'Riverside Ballers',
    groupInitials: 'RB',
    colorRamp: 'coral',
    text: 'Court booking confirmed for Sunday 9am, see you there.',
    createdAt: hoursAgo(1),
  },
  {
    id: 'broadcast-2',
    groupId: 'group-2',
    groupName: 'FC Weekend Warriors',
    groupInitials: 'FW',
    colorRamp: 'teal',
    text: 'Tournament bracket is posted, check the schedule tab.',
    createdAt: hoursAgo(5),
  },
];
