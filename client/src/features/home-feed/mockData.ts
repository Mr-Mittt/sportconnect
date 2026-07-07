import type {
  GroupBroadcast,
  Post,
  SportProfile,
  TrendingHashtag,
  UpcomingMatch,
} from './types';

/*
 * Mock data ported from the approved mockup (design-reference/design-reference-home-feed.html).
 * Temporary stand-in: sport profiles, hashtags, and broadcasts get swapped for real
 * API data in the integration phase (SPORT-1, FEED-6, FEED-7); matches stay mock
 * until a matches backend exists. Components must never import these arrays
 * directly — access goes through the useHomeFeedData() hook (HF-7).
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

export const mockSportProfiles: SportProfile[] = [
  // No synthetic 'All' entry here — SportSwitcher (HF-2) adds it itself.
  { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
];

export const mockPosts: Post[] = [
  {
    id: 'post-1',
    sport: 'football',
    authorName: 'Marcus Lee',
    authorInitials: 'ML',
    createdAt: hoursAgo(2),
    text: 'Great 5-a-side session tonight, 3 wins in a row for the squad.',
    hashtags: ['#5aside', '#fridayrun'],
    likeCount: 14,
    commentCount: 3,
    likedByMe: false,
  },
  {
    id: 'post-2',
    sport: 'basketball',
    authorName: 'Priya Shah',
    authorInitials: 'PS',
    createdAt: hoursAgo(4),
    text: 'Looking for 2 more players for Sunday pickup at Riverside courts.',
    hashtags: ['#pickup', '#riverside'],
    likeCount: 9,
    commentCount: 6,
    likedByMe: false,
  },
  {
    id: 'post-3',
    sport: 'tennis',
    authorName: 'Diego Alvarez',
    authorInitials: 'DA',
    createdAt: hoursAgo(6),
    text: 'New PB on serve speed this week. Coach says footwork is finally clicking.',
    hashtags: ['#tennislife'],
    likeCount: 21,
    commentCount: 2,
    likedByMe: false,
  },
  {
    id: 'post-4',
    sport: 'football',
    authorName: 'Hana Kim',
    authorInitials: 'HK',
    createdAt: hoursAgo(24),
    text: 'Our clan is hosting a mini tournament next Saturday, open to all levels.',
    hashtags: ['#tournament', '#openclan'],
    likeCount: 32,
    commentCount: 11,
    likedByMe: false,
  },
];

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
