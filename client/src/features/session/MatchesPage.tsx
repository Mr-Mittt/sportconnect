import { IconChevronsLeft, IconChevronsRight, IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { NoSportsToAddDialog } from '@/shared/components/NoSportsToAddDialog';
import { useAddSportLauncher } from '@/shared/hooks/useAddSportLauncher';
import { useResumableSports } from '@/shared/hooks/useResumableSports';
import { useInactiveSportPillSelect } from '@/shared/hooks/useInactiveSportPillSelect';
import { ReactivateSportNudgeDialog } from '@/shared/components/ReactivateSportNudgeDialog';
import { useAddSportProfile } from '@/shared/hooks/useAddSportProfile';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import { PAGE_ACCESS_NO_SPORTS_PROMPT } from '@/shared/lib/noSportsPrompt';
import { AddSportModal } from '@/shared/components/AddSportModal';
import { SportSwitcher } from '@/shared/components/SportSwitcher';
import { CreateSessionModal } from './components/CreateSessionModal';
import { HistoryDateSessions } from './components/HistoryDateSessions';
import { HistorySection } from './components/HistorySection';
import { SessionDetailModal } from './components/SessionDetailModal';
import { SessionDiscoverPanel } from './components/SessionDiscoverPanel';
import { UpcomingSessionsSection } from './components/UpcomingSessionsSection';
import { useMatchesPageData } from './useMatchesPageData';

/**
 * CLIENT-SESSION-6's Matches page (`/matches`) — redesigned from CLIENT-SESSION-1's single
 * merged list into two panels: a **Discover** grid (joinable sessions from other users, via
 * `GET /sessions/discover`) and a collapsible **My sessions** panel, which CLIENT-SESSION-23 split
 * into two independent sections: **Upcoming sessions** (`GET /sessions/upcoming`, day-grouped) and
 * **History** (`GET /sessions/history`, one collapsed row per date). Both are scoped to the active
 * sport pill. Assembles
 * `useMatchesPageData()`; owns only the one piece of page-level state that other pages'
 * `UpcomingMatches` rail card needs to reach into (`?session={id}` deep link, read once via
 * `useSearchParams` and handed to the data hook as its initial value — same
 * `useParams`-seeds-page-state precedent FEED-12 used for `/posts/:postId`).
 */
export function MatchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSessionId = useMemo(() => {
    const raw = searchParams.get('session');
    return raw !== null ? Number(raw) : null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- read once, on mount only; not resynced if the URL param changes later

  const data = useMatchesPageData(initialSessionId);
  const user = useAuthStore((state) => state.user)!;

  const [isAddSportOpen, setIsAddSportOpen] = useState(false);
  const addSportMutation = useAddSportProfile(data.currentUserId);
  const { resumableProfiles, inactiveSports } = useResumableSports();
  const inactiveSportPill = useInactiveSportPillSelect({
    userId: data.currentUserId ?? undefined,
    onSelectSport: data.setActiveSport,
  });
  // SPORT-5: re-read the catalogue before opening anything — see useAddSportLauncher.
  const addSportLauncher = useAddSportLauncher({
    heldSportKeys: Object.values(data.sportsByKey).map((sport) => sport.key),
    onOpenPicker: () => {
      setAddSportPromptMessage(undefined);
      setIsAddSportOpen(true);
    },
  });

  // CLIENT-MODAL-1: both modals embed the zero-sport-profile gate, which renders
  // `addSportMutation.isError` — so their close has to clear it too, not just
  // AddSportModal's. Each hook's own close already resets the mutation it owns.
  const closeCreateSessionModal = () => {
    addSportMutation.reset();
    data.closeCreateModal();
  };
  const sportCatalog = useSportCatalog();
  const availableSports = useMemo(
    () =>
      sportCatalog.data
        .map((sport) => sport.key)
        .filter((key) => !Object.keys(data.sportsByKey).includes(key)),
    [sportCatalog.data, data.sportsByKey],
  );

  // Zero-sport-profile gate on page access (not just on create/join a match — see
  // CreateSessionModal/SessionDiscoverPanel's own inline gate for that): a caller who lands
  // here with no sport profile at all gets the same AddSportModal the SportSwitcher's own "+"
  // pill opens, prompted automatically once (not on every render/refetch, and not re-shown just
  // because they close it — `hasAutoPromptedAddSportRef` latches after the first prompt) — with
  // the same funny copy the create/join gates use, via `addSportPromptMessage` (cleared when the
  // "+" pill opens the modal manually instead, so that open stays plain).
  // `useSportProfiles()` here is a second subscription to the same query `data.sportsByKey`
  // already comes from (deduped by TanStack Query, not a second request) — needed for its own
  // `isLoading`, which `useMatchesPageData` doesn't expose separately.
  const sportProfilesQuery = useSportProfiles();
  const hasAutoPromptedAddSportRef = useRef(false);
  const [addSportPromptMessage, setAddSportPromptMessage] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (
      hasAutoPromptedAddSportRef.current ||
      sportProfilesQuery.isLoading ||
      sportProfilesQuery.data.length > 0
    ) {
      return;
    }
    hasAutoPromptedAddSportRef.current = true;
    setAddSportPromptMessage(PAGE_ACCESS_NO_SPORTS_PROMPT);
    setIsAddSportOpen(true);
  }, [sportProfilesQuery.isLoading, sportProfilesQuery.data.length]);

  const closeDetail = () => {
    data.closeDetail();
    setSearchParams(
      (params) => {
        params.delete('session');
        return params;
      },
      { replace: true },
    );
  };

  const discoverGridClassName = data.isMySessionsPanelCollapsed
    ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid grid-cols-1 gap-3 sm:grid-cols-2';

  return (
    <main className="py-4">
      <h1 className="sr-only">Play</h1>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <SportSwitcher
          sports={Object.values(data.sportsByKey)}
          active={data.activeSport ?? 'all'}
          onChange={(key) => {
            // 'all' can never actually be clicked (showAllPill={false} drops that pill), but
            // SportSwitcher's onChange type still allows it — same guard /profile's own
            // ProfilePage.tsx uses for its identical no-'all' SportSwitcher.
            if (key !== 'all') data.setActiveSport(key);
          }}
          maxSports={sportCatalog.data.length || undefined}
          isCheckingCatalog={addSportLauncher.isCheckingCatalog}
          onAddSport={addSportLauncher.launch}
          showAllPill={false}
          inactiveSports={inactiveSports}
          onInactiveSelect={inactiveSportPill.onInactiveSelect}
        />
        {inactiveSportPill.nudge && <ReactivateSportNudgeDialog {...inactiveSportPill.nudge} />}
        <button
          type="button"
          onClick={data.openCreateModal}
          className="border-hairline flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-dashed border-border-strong bg-surface-2 px-3 py-1.75 text-2sm text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          <IconPlus className="size-4" aria-hidden="true" />
          Create session
        </button>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
        <SessionDiscoverPanel
          searchMode={data.searchMode}
          onSearchModeChange={data.setSearchMode}
          searchText={data.searchText}
          onSearchTextChange={data.setSearchText}
          quickDates={data.quickDates}
          selectedDates={data.selectedDates}
          onToggleDate={data.toggleDate}
          dateOptionLabel={data.dateOptionLabel}
          dateLabel={data.dateLabel}
          isDateSelectionAtMax={data.isDateSelectionAtMax}
          isDateFilterActive={data.isDateFilterActive}
          resetDateSelection={data.resetDateSelection}
          isLocationFilterAvailable={data.isLocationFilterAvailable}
          selectedLocations={data.selectedLocations}
          onToggleLocation={data.toggleLocation}
          onClearLocationFilter={data.clearLocationFilter}
          favoriteLocations={data.favoriteLocations}
          isFavoriteLocationsLoading={data.isFavoriteLocationsLoading}
          locationSearchText={data.locationSearchText}
          onLocationSearchTextChange={data.setLocationSearchText}
          locationSearchResults={data.locationSearchResults}
          isLocationSearchLoading={data.isLocationSearchLoading}
          onOpenLocationPicker={data.onOpenLocationPicker}
          locationPicker={data.locationPicker}
          selectedStatuses={data.selectedStatuses}
          onToggleStatus={data.toggleStatus}
          minOpenSlotsText={data.minOpenSlotsText}
          onMinOpenSlotsTextChange={data.setMinOpenSlotsText}
          onClearOpenSlotsFilter={data.clearOpenSlotsFilter}
          feeType={data.feeType}
          onToggleFeeType={data.toggleFeeType}
          maxFeeAmountVndText={data.maxFeeAmountVndText}
          onMaxFeeAmountVndChange={data.setMaxFeeAmountVndText}
          onClearFeeFilter={data.clearFeeFilter}
          startTimeFilter={data.startTimeFilter}
          onStartTimeFilterChange={data.setStartTimeFilter}
          startTime={data.startTime}
          onStartTimeChange={data.setStartTime}
          onClearTimeFilter={data.clearTimeFilter}
          requestedSessions={data.requestedSessions}
          isRequestedSessionsLoading={data.isRequestedSessionsLoading}
          isRequestedSessionsError={data.isRequestedSessionsError}
          hasMoreRequestedSessions={data.hasMoreRequestedSessions}
          isFetchingMoreRequestedSessions={data.isFetchingMoreRequestedSessions}
          onLoadMoreRequestedSessions={data.onLoadMoreRequestedSessions}
          dateSections={data.dateSections}
          onToggleExpanded={data.toggleExpanded}
          onLoadMoreSection={data.loadMoreSection}
          isCountsLoading={data.isCountsLoading}
          isCountsError={data.isCountsError}
          sportsByKey={data.sportsByKey}
          currentUserId={data.currentUserId ?? ''}
          onViewDetails={data.onViewDetails}
          onParticipationAction={data.onParticipationAction}
          isParticipationActionPending={data.isParticipationActionPending}
          gridClassName={discoverGridClassName}
        />

        <div className="relative hidden shrink-0 md:block md:w-px md:self-stretch md:bg-border">
          <button
            type="button"
            title={data.isMySessionsPanelCollapsed ? 'Show my sessions' : 'Hide my sessions'}
            aria-label={data.isMySessionsPanelCollapsed ? 'Show my sessions' : 'Hide my sessions'}
            aria-expanded={!data.isMySessionsPanelCollapsed}
            onClick={data.toggleMySessionsPanelCollapsed}
            className="border-hairline absolute top-14 left-1/2 flex size-7.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-border-strong bg-surface-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            {data.isMySessionsPanelCollapsed ? (
              <IconChevronsLeft className="size-3.5 text-text-secondary" aria-hidden="true" />
            ) : (
              <IconChevronsRight className="size-3.5 text-text-secondary" aria-hidden="true" />
            )}
          </button>
        </div>

        {!data.isMySessionsPanelCollapsed && (
          <section
            aria-label="My sessions"
            className="flex flex-col gap-6 md:w-[calc(33.333%-2rem)] md:shrink-0"
          >
            <UpcomingSessionsSection
              groups={data.upcomingDateGroups}
              isLoading={data.isUpcomingLoading}
              isError={data.isUpcomingError}
              hasMore={data.hasMoreUpcoming}
              isFetchingMore={data.isFetchingMoreUpcoming}
              onLoadMore={data.onLoadMoreUpcoming}
              collapsedDateKeys={data.collapsedDateKeys}
              onToggleDateGroupCollapsed={data.toggleDateGroupCollapsed}
              sportsByKey={data.sportsByKey}
              currentUserId={data.currentUserId ?? ''}
              onViewDetails={data.onViewDetails}
              onParticipationAction={data.onParticipationAction}
              isParticipationActionPending={data.isParticipationActionPending}
            />

            <HistorySection
              dates={data.historyDates}
              today={data.today}
              expandedDates={data.expandedHistoryDates}
              onToggleDate={data.toggleHistoryDate}
              isLoading={data.isHistoryLoading}
              isError={data.isHistoryError}
              hasMore={data.hasMoreHistoryDates}
              isFetchingMore={data.isFetchingMoreHistoryDates}
              onLoadMore={data.onLoadMoreHistoryDates}
              renderDateSessions={(date, dateLabel) =>
                data.activeSportId !== undefined && (
                  <HistoryDateSessions
                    date={date}
                    dateLabel={dateLabel}
                    sportId={data.activeSportId}
                    sportsByKey={data.sportsByKey}
                    currentUserId={data.currentUserId ?? ''}
                    onViewDetails={data.onViewDetails}
                    onParticipationAction={data.onParticipationAction}
                    isParticipationActionPending={data.isParticipationActionPending}
                  />
                )
              }
            />
          </section>
        )}
      </div>

      <CreateSessionModal
        key={data.isCreateModalOpen ? 'open' : 'closed'}
        isOpen={data.isCreateModalOpen}
        onClose={closeCreateSessionModal}
        sportsByKey={data.sportsByKey}
        activeSport={data.activeSport}
        selectedLocation={data.selectedLocationForCreate}
        onOpenLocationPicker={data.onOpenLocationPickerForCreate}
        locationPicker={data.locationPickerForCreate}
        friends={data.friends}
        isFriendsLoading={data.isFriendsLoading}
        onEffectiveSportChange={data.onEffectiveSportChangeForCreate}
        favoriteLocations={data.favoriteLocationsForCreate}
        isFavoriteLocationsLoading={data.isFavoriteLocationsLoading}
        onSelectLocation={data.onSelectLocationForCreate}
        onSubmit={data.submitCreate}
        isSubmitting={data.isCreating}
        isError={data.isCreateError}
        sessionAttributeSchema={data.sessionAttributeSchema}
        sessionAttributeValues={data.sessionAttributeValues}
        onSessionAttributeChange={data.onSessionAttributeChange}
        refChoiceSource={data.refChoiceSource}
        refDraftOptions={data.refDraftOptions}
        onAddRefDraftOption={data.onAddRefDraftOption}
        refBaseSchema={data.refBaseSchema}
        availableSports={availableSports}
        resumableProfiles={resumableProfiles}
        onAddSport={addSportMutation.mutate}
        isAddingSport={addSportMutation.isPending}
        isAddSportError={addSportMutation.isError}
      />

      <SessionDetailModal
        isOpen={data.selectedSessionId !== null}
        onClose={closeDetail}
        session={data.selectedSession}
        sportsByKey={data.sportsByKey}
        sessionAttributeSchema={data.detailSessionAttributeSchema}
        refBaseSchema={data.detailRefBaseSchema}
        isLoading={data.isSessionLoading}
        isError={data.isSessionError}
        participants={data.participants}
        isParticipantsLoading={data.isParticipantsLoading}
        isParticipantsError={data.isParticipantsError}
        currentUserId={data.currentUserId ?? ''}
        canManage={data.canManage}
        selectedCompletionLocation={data.selectedCompletionLocation}
        onOpenCompletionLocationPicker={data.onOpenCompletionLocationPicker}
        completionLocationPicker={data.completionLocationPicker}
        completionFavorites={data.completionFavorites}
        onCompleteSession={data.onCompleteSession}
        isCompletingSession={data.isCompletingSession}
        isCompleteSessionError={data.isCompleteSessionError}
        onJoin={data.onJoin}
        isJoining={data.isJoining}
        isJoinError={data.isJoinError}
        onLeave={data.onLeave}
        isLeaving={data.isLeaving}
        isLeaveError={data.isLeaveError}
        onConfirmCancel={data.onConfirmCancel}
        isCancelling={data.isCancelling}
        isCancelError={data.isCancelError}
        requestedParticipants={data.requestedParticipants}
        isRequestedParticipantsLoading={data.isRequestedParticipantsLoading}
        isRequestedParticipantsError={data.isRequestedParticipantsError}
        onApproveParticipant={data.onApproveParticipant}
        isApprovingParticipant={data.isApprovingParticipant}
        onRejectParticipant={data.onRejectParticipant}
        isRejectingParticipant={data.isRejectingParticipant}
        onToggleLike={data.onToggleLike}
        isTogglingLike={data.isTogglingLike}
        currentUser={{ fullName: `${user.firstName} ${user.lastName}`, avatarUrl: user.avatarUrl }}
        comments={data.comments}
        isCommentsLoading={data.isCommentsLoading}
        isCommentsError={data.isCommentsError}
        isCommentsForbidden={data.isCommentsForbidden}
        hasMoreComments={data.hasMoreComments}
        isFetchingMoreComments={data.isFetchingMoreComments}
        onFetchMoreComments={data.onFetchMoreComments}
        onAddComment={data.onAddComment}
        onAddCommentReply={data.onAddCommentReply}
        isPostingComment={data.isPostingComment}
        onDeleteComment={data.onDeleteComment}
        onToggleCommentLike={data.onToggleCommentLike}
      />

      <NoSportsToAddDialog
        isOpen={addSportLauncher.isDialogOpen}
        onClose={addSportLauncher.closeDialog}
        isCatalogUnavailable={addSportLauncher.isCatalogUnavailable}
        onRetry={addSportLauncher.retry}
        isRetrying={addSportLauncher.isCheckingCatalog}
      />
      <AddSportModal
        isOpen={isAddSportOpen}
        onClose={() => {
          addSportMutation.reset();
          setIsAddSportOpen(false);
        }}
        availableSports={availableSports}
        resumableProfiles={resumableProfiles}
        isSubmitting={addSportMutation.isPending}
        isError={addSportMutation.isError}
        onSubmit={(payload) =>
          addSportMutation.mutate(payload, { onSuccess: () => setIsAddSportOpen(false) })
        }
        promptMessage={addSportPromptMessage}
      />
    </main>
  );
}
