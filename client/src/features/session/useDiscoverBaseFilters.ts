import { useMemo, useState } from 'react';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useFavoriteLocations } from '@/features/location/hooks/useFavoriteLocations';
import { useLocationSearch } from '@/features/location/hooks/useLocationSearch';
import type { Location } from '@/shared/types/location';
import type { StartTimeFilter } from '@/shared/types/session';
import { getViewerZoneId, type DiscoverFilters } from './discoverParams';
import type { SessionSearchMode } from './types';

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
  const [selectedLocations, setSelectedLocations] = useState<Map<number, Location>>(() => new Map());
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

  const [locationSearchText, setLocationSearchText] = useState('');
  const debouncedLocationSearchText = useDebouncedValue(locationSearchText, LOCATION_SEARCH_DEBOUNCE_MS);
  const isLocationFilterAvailable = sportId !== undefined;
  const favoritesQuery = useFavoriteLocations(sportId, enabled && isLocationFilterAvailable);
  const trimmedLocationSearch = debouncedLocationSearchText.trim();
  const locationSearchQuery = useLocationSearch(
    sportId ?? -1,
    trimmedLocationSearch,
    enabled && isLocationFilterAvailable && trimmedLocationSearch.length >= LOCATION_SEARCH_MIN_LENGTH,
  );

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
    feeType: undefined,
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
    favoriteLocations: favoritesQuery.data?.content ?? [],
    isFavoriteLocationsLoading: favoritesQuery.isLoading,
    locationSearchText,
    setLocationSearchText,
    locationSearchResults: locationSearchQuery.data?.content ?? [],
    isLocationSearchLoading: locationSearchQuery.isLoading,

    startTimeFilter,
    setStartTimeFilter,
    startTime,
    setStartTime,
    clearTimeFilter,
  };
}
