import type { Location } from '@/shared/types/location';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { GroupSessionsConfigData } from './useGroupSessionsConfigData';
import type { RecurrenceFormData } from './useRecurrenceFormData';
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
    audienceMembers: [],
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

/** A location picker that is closed and does nothing. */
export const idleLocationPicker: LocationPickerProps = {
  isOpen: false,
  onClose: () => {},
  mode: 'search',
  onSwitchToCreate: () => {},
  onSwitchToSearch: () => {},
  inputValue: '',
  onInputChange: () => {},
  onSearch: () => {},
  results: [],
  isSearching: false,
  isSearchError: false,
  onSelectResult: () => {},
  favoriteLocationIds: new Set<number>(),
  onToggleFavorite: () => {},
  isTogglingFavorite: false,
  onOpenGoogleMaps: () => {},
  mapsUrlInput: '',
  onMapsUrlChange: () => {},
  onResolveUrl: () => {},
  isResolving: false,
  isResolveError: false,
  resolvedNoCoordinates: false,
  coordinates: null,
  mapSeed: 0,
  onMovePin: () => {},
  name: '',
  onNameChange: () => {},
  address: '',
  onAddressChange: () => {},
  canSave: false,
  onSave: () => {},
  isSaving: false,
  isSaveError: false,
};

/** The recurrence form's data, closed, with every action a no-op; override what a story or a test cares about (CLIENT-GROUP-SESSION-5). */
export function makeRecurrenceFormData(overrides: Partial<RecurrenceFormData> = {}): RecurrenceFormData {
  return {
    isOpen: false,
    editing: null,
    formKey: 1,
    openAdd: () => {},
    openEdit: () => {},
    close: () => {},
    selectedLocation: null,
    onOpenLocationPicker: () => {},
    locationPicker: idleLocationPicker,
    favoriteLocations: [],
    isFavoriteLocationsLoading: false,
    onSelectLocation: () => {},
    audienceSearch: { query: '', onQueryChange: () => {}, results: [], isSearching: false, isSearchError: false },
    sessionAttributeSchema: null,
    sessionAttributeValues: {},
    onSessionAttributeChange: () => {},
    refChoiceSource: null,
    refDraftOptions: {},
    onAddRefDraftOption: () => {},
    refBaseSchema: null,
    save: () => {},
    isSaving: false,
    isSaveError: false,
    isSaved: false,
    isSavedDraft: false,
    onCreateMore: () => {},
    ...overrides,
  };
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
    onCountScheduled: (_scope, _recurrenceId, onCount) => onCount(0),
    isCounting: false,
    isCountError: false,
    onResetCount: () => {},
    isUpdateError: false,
    isDeleteError: false,
    isBusy: false,
    recurrenceForm: makeRecurrenceFormData(),
    ...overrides,
  };
}
