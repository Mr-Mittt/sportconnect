import { useNavigate } from 'react-router-dom';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import { LocationPicker } from '@/features/location/components/LocationPicker';
import { AddSportFields, type AddSportProfileSubmission } from '@/shared/components/AddSportFields';
import type { ResumablePrevious } from '@/shared/hooks/useResumableSports';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { FeeType, SessionStatus, StartTimeFilter } from '@/shared/types/session';
import type { Location } from '@/shared/types/location';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import type { SessionListItem } from '../types';
import { DiscoverModalSportSearchBox } from './DiscoverModalSportSearchBox';
import { DiscoverFeeFilter } from './DiscoverFeeFilter';
import { DiscoverLocationFilter } from './DiscoverLocationFilter';
import { DiscoverOpenSlotsFilter } from './DiscoverOpenSlotsFilter';
import { DiscoverStatusFilter } from './DiscoverStatusFilter';
import { DiscoverTimeFilter } from './DiscoverTimeFilter';
import { DiscoverResultsList } from './DiscoverResultsList';

const NO_SPORTS_PROMPT =
  "Hey champ, add a sport first — can't join a match you don't even play! 🎯";

interface SessionDiscoverModalProps {
  isOpen: boolean;
  onClose: () => void;

  /** CLIENT-SESSION-29 revision (2026-09-23) — the modal's own sport dropdown, replacing the old
   * search-scope `<select>`. See `DiscoverModalSportSearchBox`'s own doc comment. */
  sportId: number | undefined;
  onSportIdChange: (sportId: number) => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;

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

  selectedStatuses: SessionStatus[];
  onToggleStatus: (status: SessionStatus) => void;

  minOpenSlotsText: string;
  onMinOpenSlotsTextChange: (value: string) => void;
  onClearOpenSlotsFilter: () => void;

  feeType: FeeType | undefined;
  onToggleFeeType: (feeType: FeeType) => void;
  maxFeeAmountVndText: string;
  onMaxFeeAmountVndChange: (value: string) => void;
  onClearFeeFilter: () => void;

  startTimeFilter: StartTimeFilter | undefined;
  onStartTimeFilterChange: (filter: StartTimeFilter) => void;
  startTime: string | undefined;
  onStartTimeChange: (time: string) => void;
  onClearTimeFilter: () => void;

  /** Today's sessions only, flat — no date picker/sections here (CLIENT-SESSION-22 delta,
   * 2026-09-22, see this component's own doc comment). */
  sessions: SessionListItem[];
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;

  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  /** CLIENT-SESSION-9: threaded straight through to each `SessionCard`. */
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;

  /** CLIENT-SESSION-7 follow-up: when the caller has zero sport profiles (`sportsByKey` empty),
   * the Discover panel is replaced by an inline "add a sport first" prompt (`AddSportFields`) —
   * same reasoning and same shared fields component as `CreateSessionModal`'s own gate. */
  availableSports: SportKey[];
  /** SPORT-10: forwarded to the inline `AddSportFields` so re-adding a soft-deleted sport from
   * this gate offers the read-only reactivate variant, same as the standalone `AddSportModal`. */
  resumableProfiles?: Map<SportKey, ResumablePrevious>;
  onAddSport: (payload: AddSportProfileSubmission) => void;
  isAddingSport: boolean;
  isAddSportError: boolean;
}

/**
 * CLIENT-SESSION-7's rail-triggered entry point into Discover — the `UpcomingMatches` empty
 * state's "Join a match" CTA opens this instead of navigating to `/matches`, so a caller on Home
 * Feed/Groups/Friends can browse and join a session inline. `onViewDetails` closes this dialog
 * (see `useDiscoverModalData`) before the host page opens `SessionDetailModal` — two sequential
 * top-level Dialogs, not one nested inside the other.
 *
 * **CLIENT-SESSION-22 delta (2026-09-22):** no longer wraps the shared `SessionDiscoverPanel` —
 * this modal is deliberately scoped down to *today's* sessions only (titled "Discover today
 * session"), with Location/Time filters but no Date pill/counts/sections; a "Find session for
 * another date? Discover more" footer link (bottom-right) sends anyone who wants more than today
 * to the full `/matches` page instead, which keeps the real multi-date browsing experience
 * (`useDiscoverFilters`). Still shares `DiscoverLocationFilter`/`DiscoverTimeFilter`/
 * `DiscoverResultsList` with that page so the two don't drift on anything they still have in
 * common — the search-scope row itself diverged CLIENT-SESSION-29 (2026-09-23): this modal uses
 * its own `DiscoverModalSportSearchBox` (a sport dropdown), the page keeps `DiscoverSearchBox`.
 */
export function SessionDiscoverModal({
  isOpen,
  onClose,
  sportId,
  onSportIdChange,
  searchText,
  onSearchTextChange,
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
  sessions,
  isLoading,
  isError,
  hasMore,
  isFetchingMore,
  onLoadMore,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
  availableSports,
  resumableProfiles,
  onAddSport,
  isAddingSport,
  isAddSportError,
}: SessionDiscoverModalProps) {
  const hasNoSportProfiles = Object.keys(sportsByKey).length === 0;
  const navigate = useNavigate();
  const discoverMore = () => {
    onClose();
    navigate('/matches');
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        {/* The gated "add a sport first" view (see hasNoSportProfiles below) is a compact 3-field
          form — sized like the standalone AddSportModal (max-w-md, shrink-to-fit) instead of
          this panel's own wide/fixed-height treatment, so its "Add sport" button sits right at
          the bottom of the modal instead of floating above dead space. */}
        <DialogContent
          fixedHeight={!hasNoSportProfiles}
          className={hasNoSportProfiles ? 'max-w-md' : 'max-w-2xl'}
        >
          <DialogHeader
            title="Discover today session"
            className="border-hairline-b border-border px-4 py-3"
          />
          {hasNoSportProfiles ? (
            <AddSportFields
              availableSports={availableSports}
              resumableProfiles={resumableProfiles}
              onSubmit={onAddSport}
              isSubmitting={isAddingSport}
              isError={isAddSportError}
              promptMessage={NO_SPORTS_PROMPT}
            />
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
                <DiscoverModalSportSearchBox
                  sportId={sportId}
                  onSportIdChange={onSportIdChange}
                  sportsByKey={sportsByKey}
                  searchText={searchText}
                  onSearchTextChange={onSearchTextChange}
                />
                <div className="flex flex-wrap gap-2">
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
                  <DiscoverOpenSlotsFilter
                    value={minOpenSlotsText}
                    onChange={onMinOpenSlotsTextChange}
                    onClear={onClearOpenSlotsFilter}
                  />
                </div>
                <DiscoverResultsList
                  sessions={sessions}
                  isLoading={isLoading}
                  isError={isError}
                  hasMore={hasMore}
                  isFetchingMore={isFetchingMore}
                  onLoadMore={onLoadMore}
                  emptyMessage="No sessions to discover today."
                  errorMessage="Couldn't load today's sessions."
                  sportsByKey={sportsByKey}
                  currentUserId={currentUserId}
                  onViewDetails={onViewDetails}
                  onParticipationAction={onParticipationAction}
                  isParticipationActionPending={isParticipationActionPending}
                  gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"
                />
              </div>
              <div className="border-hairline-t flex items-center justify-end gap-2 border-border px-4 py-3">
                <p className="text-2xs text-text-muted">Find session for another date?</p>
                <Button variant="outline" size="sm" onClick={discoverMore}>
                  Discover more
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <LocationPicker {...locationPicker} />
    </>
  );
}
