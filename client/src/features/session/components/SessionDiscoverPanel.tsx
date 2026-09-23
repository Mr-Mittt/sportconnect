import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { StartTimeFilter } from '@/shared/types/session';
import type { Location } from '@/shared/types/location';
import type { DiscoverDateSection as DiscoverDateSectionData, SessionSearchMode } from '../types';
import { DiscoverDatePicker } from './DiscoverDatePicker';
import { DiscoverLocationFilter } from './DiscoverLocationFilter';
import { DiscoverTimeFilter } from './DiscoverTimeFilter';
import { DiscoverDateSection } from './DiscoverDateSection';
import { DiscoverSearchBox } from './DiscoverSearchBox';

const DEFAULT_GRID_CLASS_NAME = 'grid grid-cols-1 gap-3 sm:grid-cols-2';

interface SessionDiscoverPanelProps {
  searchMode: SessionSearchMode;
  onSearchModeChange: (mode: SessionSearchMode) => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;

  // Date filter
  quickDates: string[];
  selectedDates: string[];
  onToggleDate: (date: string) => void;
  dateOptionLabel: (date: string) => string;
  isDateSelectionAtMax: boolean;

  // Location filter
  isLocationFilterAvailable: boolean;
  selectedLocations: Location[];
  onToggleLocation: (location: Location) => void;
  favoriteLocations: Location[];
  isFavoriteLocationsLoading: boolean;
  locationSearchText: string;
  onLocationSearchTextChange: (text: string) => void;
  locationSearchResults: Location[];
  isLocationSearchLoading: boolean;

  // Time filter
  startTimeFilter: StartTimeFilter | undefined;
  onStartTimeFilterChange: (filter: StartTimeFilter) => void;
  startTime: string | undefined;
  onStartTimeChange: (time: string) => void;
  onClearTimeFilter: () => void;

  // Results — one collapsible section per checked date (CLIENT-SESSION-22), replacing the old
  // flat `sessions: SessionListItem[]` grid.
  dateSections: DiscoverDateSectionData[];
  onToggleExpanded: (date: string) => void;
  onLoadMoreSection: (date: string) => void;
  isCountsLoading: boolean;
  isCountsError: boolean;

  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  /** CLIENT-SESSION-9: threaded straight through to each `SessionCard`. */
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;

  /** Defaults to a fixed 2-column grid. `MatchesPage` overrides this to flip to 3 columns when
   * its "My sessions" panel is collapsed — `SessionDiscoverModal` uses the default. */
  gridClassName?: string;
}

/**
 * CLIENT-SESSION-6's Discover UI, wired to real Date/Location/Time filters as of CLIENT-SESSION-22
 * (were inert placeholder pills before). Extracted in CLIENT-SESSION-7 so it can render both inline
 * on `MatchesPage` and inside `SessionDiscoverModal` (the rail's "Join a match" entry point) without
 * the two drifting apart. Presentational — all state lives in `useDiscoverFilters`, shared by both
 * callers' data hooks.
 */
export function SessionDiscoverPanel({
  searchMode,
  onSearchModeChange,
  searchText,
  onSearchTextChange,
  quickDates,
  selectedDates,
  onToggleDate,
  dateOptionLabel,
  isDateSelectionAtMax,
  isLocationFilterAvailable,
  selectedLocations,
  onToggleLocation,
  favoriteLocations,
  isFavoriteLocationsLoading,
  locationSearchText,
  onLocationSearchTextChange,
  locationSearchResults,
  isLocationSearchLoading,
  startTimeFilter,
  onStartTimeFilterChange,
  startTime,
  onStartTimeChange,
  onClearTimeFilter,
  dateSections,
  onToggleExpanded,
  onLoadMoreSection,
  isCountsLoading,
  isCountsError,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
  gridClassName = DEFAULT_GRID_CLASS_NAME,
}: SessionDiscoverPanelProps) {
  return (
    <section aria-label="Discover sessions" className="min-w-0 flex-1">
      <h2 className="sr-only">Discover</h2>
      <div className="mb-3.5 flex flex-col gap-2.5">
        <DiscoverSearchBox
          searchMode={searchMode}
          onSearchModeChange={onSearchModeChange}
          searchText={searchText}
          onSearchTextChange={onSearchTextChange}
        />
        <div className="flex flex-wrap gap-2">
          <DiscoverDatePicker
            quickDates={quickDates}
            selectedDates={selectedDates}
            onToggleDate={onToggleDate}
            dateOptionLabel={dateOptionLabel}
            isAtMax={isDateSelectionAtMax}
          />
          <DiscoverTimeFilter
            startTimeFilter={startTimeFilter}
            onStartTimeFilterChange={onStartTimeFilterChange}
            startTime={startTime}
            onStartTimeChange={onStartTimeChange}
            onClear={onClearTimeFilter}
          />
          <DiscoverLocationFilter
            isAvailable={isLocationFilterAvailable}
            selectedLocations={selectedLocations}
            onToggleLocation={onToggleLocation}
            favoriteLocations={favoriteLocations}
            isFavoriteLocationsLoading={isFavoriteLocationsLoading}
            searchText={locationSearchText}
            onSearchTextChange={onLocationSearchTextChange}
            searchResults={locationSearchResults}
            isSearchLoading={isLocationSearchLoading}
          />
        </div>
      </div>

      {isCountsLoading && (
        <p className="mb-2 text-2sm text-text-muted">Loading session counts…</p>
      )}
      {isCountsError && (
        <p role="alert" className="mb-2 text-2sm text-text-danger">
          Couldn't load session counts for these dates.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {dateSections.map((section) => (
          <DiscoverDateSection
            key={section.date}
            section={section}
            onToggleExpanded={onToggleExpanded}
            onLoadMore={onLoadMoreSection}
            sportsByKey={sportsByKey}
            currentUserId={currentUserId}
            onViewDetails={onViewDetails}
            onParticipationAction={onParticipationAction}
            isParticipationActionPending={isParticipationActionPending}
            gridClassName={gridClassName}
          />
        ))}
      </div>
    </section>
  );
}
