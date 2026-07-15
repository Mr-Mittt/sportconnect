import { hoursFromNow } from '@/shared/lib/mockClock';
import type { UpcomingMatch } from '@/shared/types/rail';

/*
 * Mock-backed for the whole MVP — no matches backend exists (see
 * client/docs/BACKLOG_MVP.md's Reality check). Moved from
 * home-feed/mockData.ts (FEED-5) so the Groups page's right rail can reuse
 * it too. Same { data, isLoading, isError } shape as every other data hook
 * per client/CLAUDE.md's data layer convention.
 */
const mockUpcomingMatches: UpcomingMatch[] = [
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

export function useUpcomingMatches(): {
  data: UpcomingMatch[];
  isLoading: boolean;
  isError: boolean;
} {
  return { data: mockUpcomingMatches, isLoading: false, isError: false };
}
