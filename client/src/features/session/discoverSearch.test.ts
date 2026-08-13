import { describe, expect, it } from 'vitest';
import type { Session } from '@/shared/types/session';
import type { Location } from '@/shared/types/location';
import { filterDiscoverSessions } from './discoverSearch';

const location: Location = {
  id: 1,
  sportId: 6,
  sportName: 'Basketball',
  name: 'Riverside Courts',
  address: null,
  latitude: null,
  longitude: null,
  sourceMapsUrl: null,
  claimedByVendorId: null,
  createdBy: 'user-1',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
};

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 1,
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Weekend 5-a-side',
    description: null,
    location,
    locationNote: null,
    scheduledStart: '2026-08-01T19:00:00',
    scheduledEndAt: null,
    status: 'SCHEDULED',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 3,
    capacity: 10,
    feeType: 'FREE',
    feeAmountVnd: null,
    initialSlot: 0,
    autoApprove: false,
    likeCount: 0,
    isLikedByCurrentUser: false,
    callerParticipation: null,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    ...overrides,
  };
}

describe('filterDiscoverSessions', () => {
  it('maps every session to a SessionListItem with groupName: null', () => {
    const result = filterDiscoverSessions([makeSession()], 'sessions', '');
    expect(result).toEqual([{ ...makeSession(), groupName: null }]);
  });

  it('filters by title substring, case-insensitive', () => {
    const sessions = [makeSession({ id: 1, title: 'Weekend 5-a-side' }), makeSession({ id: 2, title: 'Sunday run' })];
    const result = filterDiscoverSessions(sessions, 'sessions', 'weekend');
    expect(result.map((s) => s.id)).toEqual([1]);
  });

  it('filters by location name substring', () => {
    const sessions = [
      makeSession({ id: 1, location: { ...location, name: 'Central Turf Park' } }),
      makeSession({ id: 2, location: { ...location, name: 'Riverside Courts' } }),
    ];
    const result = filterDiscoverSessions(sessions, 'sessions', 'riverside');
    expect(result.map((s) => s.id)).toEqual([2]);
  });

  it('falls back to "{sportName} session" when title is null for the search match', () => {
    const sessions = [makeSession({ id: 1, title: null, sportName: 'Basketball' })];
    expect(filterDiscoverSessions(sessions, 'sessions', 'basketball session')).toHaveLength(1);
  });

  it('ignores the query when searchMode is not "sessions"', () => {
    const sessions = [makeSession({ id: 1, title: 'Weekend 5-a-side' })];
    expect(filterDiscoverSessions(sessions, 'location', 'nonexistent')).toHaveLength(1);
    expect(filterDiscoverSessions(sessions, 'gear', 'nonexistent')).toHaveLength(1);
  });
});
