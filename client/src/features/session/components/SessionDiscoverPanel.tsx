import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import { LocationPicker } from '@/features/location/components/LocationPicker';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { FeeType, SessionStatus, StartTimeFilter } from '@/shared/types/session';
import type { Location } from '@/shared/types/location';
import type {
  DiscoverDateSection as DiscoverDateSectionData,
  SessionListItem,
  SessionSearchMode,
} from '../types';
import { DiscoverDatePicker } from './DiscoverDatePicker';
import { DiscoverFeeFilter } from './DiscoverFeeFilter';
import { DiscoverLocationFilter } from './DiscoverLocationFilter';
import { DiscoverOpenSlotsFilter } from './DiscoverOpenSlotsFilter';
import { DiscoverStatusFilter } from './DiscoverStatusFilter';
import { DiscoverTimeFilter } from './DiscoverTimeFilter';
import { DiscoverDateSection } from './DiscoverDateSection';
import { DiscoverSearchBox } from './DiscoverSearchBox';
import { RequestedSessionsSection } from './RequestedSessionsSection';

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
  dateLabel: (date: string) => string;
  isDateSelectionAtMax: boolean;
  isDateFilterActive: boolean;
  resetDateSelection: () => void;

  // Location filter
  isLocationFilterAvailable: boolean;
  selectedLocations: Location[];
  onToggleLocation: (location: Location) => void;
  onClearLocationFilter: () => void;
  favoriteLocations: Location[];
  isFavoriteLocationsLoading: boolean;
  locationSearchText: string;
  onLocationSearchTextChange: (text: string) => void;
  locationSearchResults: Location[];
  isLocationSearchLoading: boolean;
  onOpenLocationPicker: () => void;
  locationPicker: LocationPickerProps;

  // Status filter
  selectedStatuses: SessionStatus[];
  onToggleStatus: (status: SessionStatus) => void;

  // Open-slot count filter
  minOpenSlotsText: string;
  onMinOpenSlotsTextChange: (value: string) => void;
  onClearOpenSlotsFilter: () => void;

  // Fee filter
  feeType: FeeType | undefined;
  onToggleFeeType: (feeType: FeeType) => void;
  maxFeeAmountVndText: string;
  onMaxFeeAmountVndChange: (value: string) => void;
  onClearFeeFilter: () => void;

  // Time filter
  startTimeFilter: StartTimeFilter | undefined;
  onStartTimeFilterChange: (filter: StartTimeFilter) => void;
  startTime: string | undefined;
  onStartTimeChange: (time: string) => void;
  onClearTimeFilter: () => void;

  // Requested sessions (CLIENT-SESSION-29) — below the filter row, above the results below.
  requestedSessions: SessionListItem[];
  isRequestedSessionsLoading: boolean;
  isRequestedSessionsError: boolean;
  hasMoreRequestedSessions: boolean;
  isFetchingMoreRequestedSessions: boolean;
  onLoadMoreRequestedSessions: () => void;

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
  dateLabel,
  isDateSelectionAtMax,
  isDateFilterActive,
  resetDateSelection,
  isLocationFilterAvailable,
  selectedLocations,
  onToggleLocation,
  onClearLocationFilter,
  favoriteLocations,
  isFavoriteLocationsLoading,
  locationSearchText,
  onLocationSearchTextChange,
  locationSearchResults,
  isLocationSearchLoading,
  onOpenLocationPicker,
  locationPicker,
  selectedStatuses,
  onToggleStatus,
  minOpenSlotsText,
  onMinOpenSlotsTextChange,
  onClearOpenSlotsFilter,
  feeType,
  onToggleFeeType,
  maxFeeAmountVndText,
  onMaxFeeAmountVndChange,
  onClearFeeFilter,
  startTimeFilter,
  onStartTimeFilterChange,
  startTime,
  onStartTimeChange,
  onClearTimeFilter,
  requestedSessions,
  isRequestedSessionsLoading,
  isRequestedSessionsError,
  hasMoreRequestedSessions,
  isFetchingMoreRequestedSessions,
  onLoadMoreRequestedSessions,
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
            dateLabel={dateLabel}
            isAtMax={isDateSelectionAtMax}
            isActive={isDateFilterActive}
            onReset={resetDateSelection}
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
            onClearLocationFilter={onClearLocationFilter}
            favoriteLocations={favoriteLocations}
            isFavoriteLocationsLoading={isFavoriteLocationsLoading}
            searchText={locationSearchText}
            onSearchTextChange={onLocationSearchTextChange}
            searchResults={locationSearchResults}
            isSearchLoading={isLocationSearchLoading}
            onOpenLocationPicker={onOpenLocationPicker}
          />
          <DiscoverStatusFilter
            selectedStatuses={selectedStatuses}
            onToggleStatus={onToggleStatus}
          />
          <DiscoverFeeFilter
            feeType={feeType}
            onToggleFeeType={onToggleFeeType}
            maxFeeAmountVndText={maxFeeAmountVndText}
            onMaxFeeAmountVndChange={onMaxFeeAmountVndChange}
            onClear={onClearFeeFilter}
          />
          {/* Last in the row (2026-09-23 revision) — the only direct-input (non-Popover) filter,
            so it reads better trailing the button-triggered ones instead of sitting mid-row. */}
          <DiscoverOpenSlotsFilter
            value={minOpenSlotsText}
            onChange={onMinOpenSlotsTextChange}
            onClear={onClearOpenSlotsFilter}
          />
        </div>
      </div>
      <LocationPicker {...locationPicker} />

      <RequestedSessionsSection
        sessions={requestedSessions}
        isLoading={isRequestedSessionsLoading}
        isError={isRequestedSessionsError}
        hasMore={hasMoreRequestedSessions}
        isFetchingMore={isFetchingMoreRequestedSessions}
        onLoadMore={onLoadMoreRequestedSessions}
        sportsByKey={sportsByKey}
        currentUserId={currentUserId}
        onViewDetails={onViewDetails}
        onParticipationAction={onParticipationAction}
        isParticipationActionPending={isParticipationActionPending}
        gridClassName={gridClassName}
      />

      {isCountsLoading && <p className="mb-2 text-2sm text-text-muted">Loading session counts…</p>}
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
