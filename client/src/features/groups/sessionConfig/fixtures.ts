import type { Location } from '@/shared/types/location';
import type { GroupSessionsConfigData } from './useGroupSessionsConfigData';
import type { GroupSessionRecurrence, GroupSessionSettings } from './types';

/** Builders for the stories and tests of the group settings' Sessions section (CLIENT-GROUP-SESSION-4). */

export function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 9,
    sportId: 5,
    sportName: 'Badminton',
    name: 'Riverside Courts',
    address: '12 Riverside Road',
    latitude: null,
    longitude: null,
    timezone: 'Asia/Ho_Chi_Minh',
    sourceMapsUrl: null,
    claimedByVendorId: null,
    createdBy: 'user-1',
    createdAt: '2026-07-15T00:00:00',
    updatedAt: '2026-07-15T00:00:00',
    ...overrides,
  };
}

/** A complete weekly configuration on Tuesday (`dayKey` 2) at 18:00 for 90 minutes. */
export function makeRecurrence(overrides: Partial<GroupSessionRecurrence> = {}): GroupSessionRecurrence {
  return {
    id: 1,
    groupId: 1,
    mode: 'WEEKLY',
    dayKey: 2,
    startTime: '18:00:00',
    durationMinutes: 90,
    locationId: 9,
    location: makeLocation(),
    locationNote: null,
    audience: 'ALL_MEMBERS',
    audienceUserIds: [],
    feeType: 'FREE',
    feeAmountVnd: null,
    feeNote: null,
    gameMood: 5,
    attributes: null,
    draft: false,
    missing: [],
    createdAt: '2026-11-01T00:00:00',
    updatedAt: '2026-11-01T00:00:00',
    ...overrides,
  };
}

export function makeSettings(overrides: Partial<GroupSessionSettings> = {}): GroupSessionSettings {
  return { groupId: 1, enabled: true, mode: 'WEEKLY', cancelledSessions: 0, ...overrides };
}

/** The section's data with every action a no-op; override what a story or a test cares about. */
export function makeSessionsConfigData(overrides: Partial<GroupSessionsConfigData> = {}): GroupSessionsConfigData {
  return {
    settings: makeSettings(),
    isSettingsLoading: false,
    isSettingsError: false,
    recurrences: [],
    isRecurrencesLoading: false,
    isRecurrencesError: false,
    onSetEnabled: () => {},
    onSetMode: () => {},
    onDelete: () => {},
    isUpdateError: false,
    isDeleteError: false,
    isBusy: false,
    ...overrides,
  };
}
