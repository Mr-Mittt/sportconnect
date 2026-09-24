import { useMemo, useState } from 'react';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useFavoriteLocation } from '@/features/location/hooks/useFavoriteLocation';
import { useFavoriteLocations } from '@/features/location/hooks/useFavoriteLocations';
import { useLocationSearch } from '@/features/location/hooks/useLocationSearch';
import { useUnfavoriteLocation } from '@/features/location/hooks/useUnfavoriteLocation';
import { useLocationPickerData } from '@/features/location/useLocationPickerData';
import type { Location } from '@/shared/types/location';
import type { FeeType, SessionStatus, StartTimeFilter } from '@/shared/types/session';
import { getViewerZoneId, type DiscoverFilters } from './discoverParams';
import type { SessionSearchMode } from './types';

/** `/discover`'s own status filter only ever accepts these two meaningfully — see
 * `discoverParams.ts`'s `DiscoverFilters.status` doc comment for why `ONGOING` isn't offered. */
export const DISCOVERABLE_STATUSES: SessionStatus[] = ['PREPARING', 'SCHEDULED'];

const LOCATION_SEARCH_MIN_LENGTH = 3; // same convention as CreateSessionModal's InviteFriendField.
const TITLE_DEBOUNCE_MS = 400;
const LOCATION_SEARCH_DEBOUNCE_MS = 400;

/**
 * CLIENT-SESSION-22 — the filter state every `/discover`-family surface shares regardless of how
 * it handles `date`: the search box (server-side `title`), the Location pill, and the Time pill.
 * Split out of `useDiscoverFilters` once the rail's `SessionDiscoverModal` needed a *different*
 * date story (today-only, no picker, no counts — see that hook's own doc comment) but the exact
 * same search/location/time behavior, so the two don't duplicate this state and drift.
 *
 * `sportId` is the hosting page's active sport pill (`undefined` = every active sport). The
 * Location filter is unavailable whenever `sportId` is `undefined`: both `GET /locations/favorites`
 * and `GET /locations/search` require a single sport (LOC-1: `Location` is always sport-specific).
 */
export function useDiscoverBaseFilters(sportId: number | undefined, enabled: boolean) {
  const viewerZoneId = useMemo(() => getViewerZoneId(), []);

  // --- search box (title) ---
  const [searchText, setSearchText] = useState('');
  const [searchMode, setSearchMode] = useState<SessionSearchMode>('sessions');
  const debouncedSearchText = useDebouncedValue(searchText, TITLE_DEBOUNCE_MS);
  const title = searchMode === 'sessions' ? debouncedSearchText.trim() : '';

  // --- Location filter (unavailable for sportId === undefined, see doc comment above) ---
  const [selectedLocations, setSelectedLocations] = useState<Map<number, Location>>(
    () => new Map(),
  );
  // Sport-scoped selections stop meaning anything once the active sport pill changes — reset them
  // ("adjust state during render" per React's own guidance, https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes;
  // state not a ref — this codebase's `react-hooks/refs` lint rule rejects reading/writing
  // `ref.current` during render) rather than silently sending stale locationIds for a different sport.
  const [prevSportId, setPrevSportId] = useState(sportId);
  if (prevSportId !== sportId) {
    setPrevSportId(sportId);
    if (selectedLocations.size > 0) setSelectedLocations(new Map());
  }
  const selectedLocationIds = useMemo(() => [...selectedLocations.keys()], [selectedLocations]);
  const toggleLocation = (location: Location) => {
    setSelectedLocations((current) => {
      const next = new Map(current);
      if (next.has(location.id)) {
        next.delete(location.id);
      } else {
        next.set(location.id, location);
      }
      return next;
    });
  };
  // CLIENT-SESSION-29 — "Choose a location" always adds/re-selects, never removes: picking a
  // location that's already checked (e.g. already favorited) just leaves it checked, rather than
  // toggleLocation's flip-off behavior, which would silently uncheck a favorite the caller only
  // meant to confirm. Deduping is free — Map.set on an existing key is a no-op replace.
  const selectLocation = (location: Location) => {
    setSelectedLocations((current) => {
      const next = new Map(current);
      next.set(location.id, location);
      return next;
    });
  };
  // 2026-09-23 revision — the Location pill's own reset ("x"): clears every selection at once,
  // unlike toggleLocation's one-at-a-time flip.
  const clearLocationFilter = () => setSelectedLocations(new Map());

  const [locationSearchText, setLocationSearchText] = useState('');
  const debouncedLocationSearchText = useDebouncedValue(
    locationSearchText,
    LOCATION_SEARCH_DEBOUNCE_MS,
  );
  const isLocationFilterAvailable = sportId !== undefined;
  const favoritesQuery = useFavoriteLocations(sportId, enabled && isLocationFilterAvailable);
  const trimmedLocationSearch = debouncedLocationSearchText.trim();
  const locationSearchQuery = useLocationSearch(
    sportId ?? -1,
    trimmedLocationSearch,
    enabled &&
      isLocationFilterAvailable &&
      trimmedLocationSearch.length >= LOCATION_SEARCH_MIN_LENGTH,
  );
  const favoriteLocationIds = useMemo(
    () => new Set((favoritesQuery.data?.content ?? []).map((location) => location.id)),
    [favoritesQuery.data],
  );
  const favoriteLocationMutation = useFavoriteLocation();
  const unfavoriteLocationMutation = useUnfavoriteLocation();
  const toggleFavoriteLocation = (location: Location) => {
    if (sportId === undefined) return;
    const payload = { locationId: location.id, sportId };
    if (favoriteLocationIds.has(location.id)) {
      unfavoriteLocationMutation.mutate(payload);
    } else {
      favoriteLocationMutation.mutate(payload);
    }
  };

  // --- "Choose a location" (CLIENT-SESSION-29) — reuses CreateSessionModal's LocationPicker
  // Dialog/useLocationPickerData wholesale, same as that modal's own LocationFavoritesDropdown
  // precedent. sportId is never undefined while this can actually be opened (isLocationFilterAvailable
  // gates the trigger), so `?? 0` here only matters for the one render before that gate closes it.
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const openLocationPicker = () => setIsLocationPickerOpen(true);
  const closeLocationPicker = () => setIsLocationPickerOpen(false);
  const locationPickerData = useLocationPickerData(
    sportId ?? 0,
    isLocationPickerOpen,
    (location) => selectLocation(location),
    closeLocationPicker,
  );
  const locationPicker = {
    isOpen: isLocationPickerOpen,
    onClose: closeLocationPicker,
    ...locationPickerData,
    favoriteLocationIds,
    onToggleFavorite: toggleFavoriteLocation,
    isTogglingFavorite: favoriteLocationMutation.isPending || unfavoriteLocationMutation.isPending,
  };

  // --- Status filter (CLIENT-SESSION-29; single-select revision 2026-09-23) — Preparing and
  // Scheduled mean the same thing to the server default (both included when unset), so offering
  // them as independent checkboxes just let a caller reconstruct that same default by checking
  // both. Mutually exclusive now, same click-to-clear toggle precedent as `feeType` below:
  // picking one clears the other; picking the already-selected one clears back to "both" (unset).
  const [selectedStatus, setSelectedStatus] = useState<SessionStatus | undefined>(undefined);
  const toggleStatus = (status: SessionStatus) =>
    setSelectedStatus((current) => (current === status ? undefined : status));

  // --- Open-slot count filter (CLIENT-SESSION-29) — floor of 1, not 0: "at least 0 open slots"
  // is a no-op filter, so 0 is never a meaningful value here (2026-09-23 revision).
  const [minOpenSlotsText, setMinOpenSlotsText] = useState('');
  // Clamped `1..999` (revised same day from an initial `1..998`, per direct clarification) — the
  // component itself (`DiscoverOpenSlotsFilter`) also sanitizes to digits-only on every keystroke
  // and re-clamps the displayed text on blur; this derived value is the defense-in-depth second
  // clamp actually sent to the server.
  const minOpenSlots =
    minOpenSlotsText.trim() === ''
      ? undefined
      : Math.min(999, Math.max(1, Number.parseInt(minOpenSlotsText, 10) || 1));
  const clearOpenSlotsFilter = () => setMinOpenSlotsText('');

  // --- Fee filter (CLIENT-SESSION-29) — feeType is a toggle (mutually exclusive, click-to-clear),
  // same UX precedent DiscoverTimeFilter's Before/After already established; maxFeeAmountVnd is
  // independent (see DiscoverFilters' own doc comment on why it isn't feeType-gated).
  const [feeType, setFeeTypeState] = useState<FeeType | undefined>(undefined);
  const toggleFeeType = (next: FeeType) =>
    setFeeTypeState((current) => (current === next ? undefined : next));
  const [maxFeeAmountVndText, setMaxFeeAmountVndText] = useState('');
  const maxFeeAmountVnd =
    maxFeeAmountVndText.trim() === ''
      ? undefined
      : Math.max(0, Number.parseInt(maxFeeAmountVndText, 10) || 0);
  const clearFeeFilter = () => {
    setFeeTypeState(undefined);
    setMaxFeeAmountVndText('');
  };

  // --- Time filter ---
  const [startTimeFilter, setStartTimeFilter] = useState<StartTimeFilter | undefined>(undefined);
  const [startTime, setStartTime] = useState<string | undefined>(undefined);
  const clearTimeFilter = () => {
    setStartTimeFilter(undefined);
    setStartTime(undefined);
  };

  const filters: Omit<DiscoverFilters, 'sportId'> = {
    title,
    locationIds: selectedLocationIds,
    status: selectedStatus ? [selectedStatus] : [],
    minOpenSlots,
    feeType,
    maxFeeAmountVnd,
    startTimeFilter,
    startTime,
    viewerZoneId,
  };

  return {
    filters,

    searchText,
    setSearchText,
    searchMode,
    setSearchMode,

    isLocationFilterAvailable,
    selectedLocations: [...selectedLocations.values()],
    toggleLocation,
    clearLocationFilter,
    favoriteLocations: favoritesQuery.data?.content ?? [],
    isFavoriteLocationsLoading: favoritesQuery.isLoading,
    locationSearchText,
    setLocationSearchText,
    locationSearchResults: locationSearchQuery.data?.content ?? [],
    isLocationSearchLoading: locationSearchQuery.isLoading,
    onOpenLocationPicker: openLocationPicker,
    locationPicker,

    selectedStatuses: selectedStatus ? [selectedStatus] : [],
    toggleStatus,

    minOpenSlotsText,
    setMinOpenSlotsText,
    clearOpenSlotsFilter,

    feeType,
    toggleFeeType,
    maxFeeAmountVndText,
    setMaxFeeAmountVndText,
    clearFeeFilter,

    startTimeFilter,
    setStartTimeFilter,
    startTime,
    setStartTime,
    clearTimeFilter,
  };
}
