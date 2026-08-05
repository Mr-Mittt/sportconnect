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

  it('labels the current calendar day as "Today"', () => {
    const groups = groupSessionsByDate([makeSession({ id: 1, scheduledStart: '2026-08-05T09:00:00' })], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].dateLabel).toBe('Today');
    expect(groups[0].dateKey).toBe('2026-08-05');
  });

  it('labels any other day as "MMM d, yyyy"', () => {
    const groups = groupSessionsByDate([makeSession({ id: 1, scheduledStart: '2026-08-08T09:00:00' })], now);
    expect(groups[0].dateLabel).toBe('Aug 8, 2026');
  });

  it('groups same-day sessions together, sorted ascending within the group', () => {
    const groups = groupSessionsByDate(
      [
        makeSession({ id: 1, scheduledStart: '2026-08-05T18:00:00' }),
        makeSession({ id: 2, scheduledStart: '2026-08-05T09:00:00' }),
      ],
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions.map((s) => s.id)).toEqual([2, 1]);
  });

  it('sorts groups descending by date — a further-future day sorts above a nearer one', () => {
    const groups = groupSessionsByDate(
      [
        makeSession({ id: 1, scheduledStart: '2026-08-06T10:00:00' }),
        makeSession({ id: 2, scheduledStart: '2026-08-08T10:00:00' }),
        makeSession({ id: 3, scheduledStart: '2026-07-31T10:00:00' }),
      ],
      now,
    );
    expect(groups.map((g) => g.dateKey)).toEqual(['2026-08-08', '2026-08-06', '2026-07-31']);
  });

  it('returns an empty array for an empty input', () => {
    expect(groupSessionsByDate([], now)).toEqual([]);
  });
});
