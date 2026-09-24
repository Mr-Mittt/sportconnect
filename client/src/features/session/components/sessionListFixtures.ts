import type { Location } from '@/shared/types/location';
import type { Session } from '@/shared/types/session';
import type { SportKey, SportProfile } from '@/shared/types/sport';

/**
 * CLIENT-SESSION-23 — shared fixtures for the Upcoming/History section tests and stories, so the
 * three new components (and their stories) don't each carry another copy of the ~45-line `Session`
 * literal every older `*.test.tsx` here duplicates. Test/story-only — nothing in the app imports it.
 */
export const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
};

export const fixtureLocation: Location = {
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

export function makeSession(overrides: Partial<Session> & Pick<Session, 'id'>): Session {
  return {
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Sunday pickup run',
    description: null,
    location: fixtureLocation,
    locationNote: null,
    scheduledStart: '2026-08-05T19:00:00',
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

/** A Spring `Page` envelope around `content` — `last: false` for a page with a next one. */
export function makePage<T>(content: T[], overrides: { number?: number; last?: boolean } = {}) {
  return {
    content,
    totalPages: 1,
    totalElements: content.length,
    number: overrides.number ?? 0,
    size: 20,
    first: (overrides.number ?? 0) === 0,
    last: overrides.last ?? true,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}
