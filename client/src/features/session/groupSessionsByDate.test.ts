import { describe, expect, it } from 'vitest';
import { formatSessionDayLabel, groupSessionsByDate } from './groupSessionsByDate';
import type { Session } from '@/shared/types/session';

function makeSession(overrides: Partial<Session> & Pick<Session, 'id' | 'scheduledStart'>): Session {
  return {
    groupId: null,
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

describe('formatSessionDayLabel', () => {
  it('says "Today" for the current day and "MMM d, yyyy" otherwise', () => {
    expect(formatSessionDayLabel('2026-09-24', '2026-09-24')).toBe('Today');
    expect(formatSessionDayLabel('2026-09-14', '2026-09-24')).toBe('Sep 14, 2026');
  });

  it('never shifts the day (parses local midnight, not UTC midnight)', () => {
    // new Date('2026-01-01') is UTC midnight and reads as Dec 31 in any zone west of UTC.
    expect(formatSessionDayLabel('2026-01-01', '2026-06-01')).toBe('Jan 1, 2026');
  });
});

describe('groupSessionsByDate', () => {
  const now = new Date(2026, 7, 5, 12, 0, 0); // 2026-08-05 12:00 local

  it('returns no groups for no sessions', () => {
    expect(groupSessionsByDate([], now)).toEqual([]);
  });

  it('groups by local calendar day and labels the current day "Today", others "MMM d, yyyy"', () => {
    const groups = groupSessionsByDate(
      [
        makeSession({ id: 1, scheduledStart: '2026-08-05T09:00:00' }),
        makeSession({ id: 2, scheduledStart: '2026-08-05T18:00:00' }),
        makeSession({ id: 3, scheduledStart: '2026-08-07T10:00:00' }),
      ],
      now,
    );

    expect(groups.map((g) => [g.dateKey, g.dateLabel, g.sessions.map((s) => s.id)])).toEqual([
      ['2026-08-05', 'Today', [1, 2]],
      ['2026-08-07', 'Aug 7, 2026', [3]],
    ]);
  });

  it('preserves the server order — never re-sorts (the endpoint is already soonest-first, with its own PREPARING→SCHEDULED→ONGOING tiebreak)', () => {
    // Two sessions sharing an exact start: the server put the PREPARING one first, and a naive
    // client-side sort by scheduledStart would be free to swap them.
    const groups = groupSessionsByDate(
      [
        makeSession({ id: 10, scheduledStart: '2026-08-06T10:00:00', status: 'PREPARING' }),
        makeSession({ id: 11, scheduledStart: '2026-08-06T10:00:00', status: 'SCHEDULED' }),
        makeSession({ id: 12, scheduledStart: '2026-08-06T10:00:00', status: 'ONGOING' }),
      ],
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions.map((s) => s.id)).toEqual([10, 11, 12]);
  });

  it('keeps a day that straddles a page boundary as one group once both pages are flattened', () => {
    const page1 = [
      makeSession({ id: 1, scheduledStart: '2026-08-06T08:00:00' }),
      makeSession({ id: 2, scheduledStart: '2026-08-06T09:00:00' }),
    ];
    const page2 = [
      makeSession({ id: 3, scheduledStart: '2026-08-06T20:00:00' }),
      makeSession({ id: 4, scheduledStart: '2026-08-08T08:00:00' }),
    ];
    const groups = groupSessionsByDate([...page1, ...page2], now);
    expect(groups.map((g) => [g.dateKey, g.sessions.map((s) => s.id)])).toEqual([
      ['2026-08-06', [1, 2, 3]],
      ['2026-08-08', [4]],
    ]);
  });

  it('puts a PREPARING session in its day group like any other upcoming session', () => {
    const groups = groupSessionsByDate(
      [makeSession({ id: 5, scheduledStart: '2026-08-05T20:00:00', status: 'PREPARING' })],
      now,
    );
    expect(groups[0].sessions.map((s) => s.status)).toEqual(['PREPARING']);
  });
});
