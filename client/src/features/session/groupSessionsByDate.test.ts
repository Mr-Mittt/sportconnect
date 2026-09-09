import { describe, expect, it } from 'vitest';
import { dedupeSessionsById, groupSessionsByDate } from './groupSessionsByDate';
import type { SessionListItem } from './types';

function makeSession(overrides: Partial<SessionListItem> & Pick<SessionListItem, 'id' | 'scheduledStart'>): SessionListItem {
  return {
    groupId: null,
    groupName: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Pickup run',
    description: null,
    location: {
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
    },
    locationNote: null,
    scheduledEndAt: null,
    status: 'SCHEDULED',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 1,
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

describe('dedupeSessionsById', () => {
  it('keeps the first occurrence of a repeated id', () => {
    const first = makeSession({ id: 1, scheduledStart: '2026-08-01T10:00:00', title: 'first' });
    const dupe = makeSession({ id: 1, scheduledStart: '2026-08-01T10:00:00', title: 'dupe' });
    const other = makeSession({ id: 2, scheduledStart: '2026-08-02T10:00:00' });

    const result = dedupeSessionsById([first, dupe, other]);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('first');
    expect(result.map((s) => s.id)).toEqual([1, 2]);
  });
});

describe('groupSessionsByDate', () => {
  const now = new Date(2026, 7, 5, 12, 0); // Aug 5 2026, noon

  it('routes SCHEDULED / ONGOING to the active zone and COMPLETED / CANCELLED to history', () => {
    const groups = groupSessionsByDate(
      [
        makeSession({ id: 1, scheduledStart: '2026-08-05T09:00:00', status: 'SCHEDULED' }),
        makeSession({ id: 2, scheduledStart: '2026-08-05T09:00:00', status: 'ONGOING' }),
        makeSession({ id: 3, scheduledStart: '2026-08-05T09:00:00', status: 'COMPLETED' }),
        makeSession({ id: 4, scheduledStart: '2026-08-05T09:00:00', status: 'CANCELLED' }),
      ],
      now,
    );
    const zoneOf = (id: number) => groups.find((g) => g.sessions.some((s) => s.id === id))?.zone;
    expect(zoneOf(1)).toBe('active');
    expect(zoneOf(2)).toBe('active');
    expect(zoneOf(3)).toBe('history');
    expect(zoneOf(4)).toBe('history');
  });

  it('labels the current calendar day "Today" and zone-qualifies the dateKey', () => {
    const groups = groupSessionsByDate(
      [makeSession({ id: 1, scheduledStart: '2026-08-05T09:00:00', status: 'SCHEDULED' })],
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].dateLabel).toBe('Today');
    expect(groups[0].dateKey).toBe('active:2026-08-05');
    expect(groups[0].zone).toBe('active');
  });

  it('labels any other day as "MMM d, yyyy"', () => {
    const groups = groupSessionsByDate(
      [makeSession({ id: 1, scheduledStart: '2026-08-08T09:00:00', status: 'SCHEDULED' })],
      now,
    );
    expect(groups[0].dateLabel).toBe('Aug 8, 2026');
    expect(groups[0].dateKey).toBe('active:2026-08-08');
  });

  it('active zone: date groups ascending, and each day ascending by start time', () => {
    const groups = groupSessionsByDate(
      [
        makeSession({ id: 1, scheduledStart: '2026-08-08T10:00:00', status: 'SCHEDULED' }),
        makeSession({ id: 2, scheduledStart: '2026-08-05T18:00:00', status: 'ONGOING' }), // today, later
        makeSession({ id: 3, scheduledStart: '2026-08-05T09:00:00', status: 'SCHEDULED' }), // today, earlier
        makeSession({ id: 4, scheduledStart: '2026-08-06T10:00:00', status: 'SCHEDULED' }),
      ],
      now,
    );
    expect(groups.map((g) => g.dateKey)).toEqual([
      'active:2026-08-05',
      'active:2026-08-06',
      'active:2026-08-08',
    ]);
    expect(groups[0].sessions.map((s) => s.id)).toEqual([3, 2]); // within today: 09:00 then 18:00
  });

  it('history zone: date groups descending, and each day descending by start time', () => {
    const groups = groupSessionsByDate(
      [
        makeSession({ id: 1, scheduledStart: '2026-07-20T10:00:00', status: 'COMPLETED' }),
        makeSession({ id: 2, scheduledStart: '2026-08-04T09:00:00', status: 'COMPLETED' }), // most recent day, earlier
        makeSession({ id: 3, scheduledStart: '2026-08-04T20:00:00', status: 'CANCELLED' }), // most recent day, later
        makeSession({ id: 4, scheduledStart: '2026-07-31T10:00:00', status: 'COMPLETED' }),
      ],
      now,
    );
    expect(groups.map((g) => g.dateKey)).toEqual([
      'history:2026-08-04',
      'history:2026-07-31',
      'history:2026-07-20',
    ]);
    expect(groups[0].sessions.map((s) => s.id)).toEqual([3, 2]); // within Aug 4: 20:00 then 09:00
  });

  it('the whole active zone renders above the whole history zone', () => {
    const groups = groupSessionsByDate(
      [
        makeSession({ id: 1, scheduledStart: '2026-07-20T10:00:00', status: 'COMPLETED' }), // history, oldest
        makeSession({ id: 2, scheduledStart: '2026-08-08T10:00:00', status: 'SCHEDULED' }), // active, furthest
        makeSession({ id: 3, scheduledStart: '2026-08-05T10:00:00', status: 'ONGOING' }), // active, today
        makeSession({ id: 4, scheduledStart: '2026-08-04T10:00:00', status: 'CANCELLED' }), // history, most recent
        makeSession({ id: 5, scheduledStart: '2026-08-06T10:00:00', status: 'SCHEDULED' }), // active, soonest
      ],
      now,
    );
    expect(groups.map((g) => g.dateKey)).toEqual([
      'active:2026-08-05',
      'active:2026-08-06',
      'active:2026-08-08',
      'history:2026-08-04',
      'history:2026-07-20',
    ]);
  });

  it('the same calendar day appears in both zones when it has both active and terminal sessions', () => {
    const groups = groupSessionsByDate(
      [
        makeSession({ id: 1, scheduledStart: '2026-08-05T10:00:00', status: 'COMPLETED' }), // today, done
        makeSession({ id: 2, scheduledStart: '2026-08-05T11:00:00', status: 'ONGOING' }), // today, live
        makeSession({ id: 3, scheduledStart: '2026-08-05T15:00:00', status: 'SCHEDULED' }), // today, upcoming
      ],
      now,
    );
    expect(groups.map((g) => ({ key: g.dateKey, label: g.dateLabel, ids: g.sessions.map((s) => s.id) }))).toEqual([
      { key: 'active:2026-08-05', label: 'Today', ids: [2, 3] },
      { key: 'history:2026-08-05', label: 'Today', ids: [1] },
    ]);
  });

  it('returns an empty array for an empty input', () => {
    expect(groupSessionsByDate([], now)).toEqual([]);
  });
});
