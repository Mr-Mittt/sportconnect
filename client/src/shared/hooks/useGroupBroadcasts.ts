import { hoursAgo } from '@/shared/lib/mockClock';
import type { GroupBroadcast } from '@/shared/types/rail';

/*
 * Mock-backed until FEED-7 swaps this to a real TanStack Query hook against
 * GET /api/posts/broadcast. Moved from home-feed/mockData.ts (FEED-5) so the
 * Groups page's right rail can reuse it too. Same { data, isLoading,
 * isError } shape either way.
 */
const mockGroupBroadcasts: GroupBroadcast[] = [
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

export function useGroupBroadcasts(): {
  data: GroupBroadcast[];
  isLoading: boolean;
  isError: boolean;
} {
  return { data: mockGroupBroadcasts, isLoading: false, isError: false };
}
