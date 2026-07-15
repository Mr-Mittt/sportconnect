import type { SportProfile } from '@/shared/types/sport';

/*
 * Mock-backed until SPORT-1 swaps this to a real TanStack Query hook against
 * GET /api/sports/profiles/user/{userId} (SportController already exists —
 * see client/docs/BACKLOG_MVP.md's Reality check). Same { data, isLoading,
 * isError } shape either way per client/CLAUDE.md's data layer convention,
 * so Home Feed and the Groups page (both consumers, FEED-4) don't change
 * when it lands. No synthetic 'All' entry — SportSwitcher (HF-2) adds it
 * itself.
 */
const mockSportProfiles: SportProfile[] = [
  { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
];

export function useSportProfiles(): {
  data: SportProfile[];
  isLoading: boolean;
  isError: boolean;
} {
  return { data: mockSportProfiles, isLoading: false, isError: false };
}
