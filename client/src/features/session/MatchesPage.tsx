import { IconChevronsLeft, IconChevronsRight, IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { NoSportsToAddDialog } from '@/shared/components/NoSportsToAddDialog';
import { useAddSportLauncher } from '@/shared/hooks/useAddSportLauncher';
import { useAddSportProfile } from '@/shared/hooks/useAddSportProfile';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import { PAGE_ACCESS_NO_SPORTS_PROMPT } from '@/shared/lib/noSportsPrompt';
import { AddSportModal } from '@/shared/components/AddSportModal';
import { SportSwitcher } from '@/shared/components/SportSwitcher';
import { CreateSessionModal } from './components/CreateSessionModal';
import { SessionDateGroup } from './components/SessionDateGroup';
import { SessionDetailModal } from './components/SessionDetailModal';
import { SessionDiscoverPanel } from './components/SessionDiscoverPanel';
import { useMatchesPageData } from './useMatchesPageData';

/**
 * CLIENT-SESSION-6's Matches page (`/matches`) — redesigned from CLIENT-SESSION-1's single
 * merged list into two panels: a **Discover** grid (joinable sessions from other users, via
 * `GET /sessions/discover`) and a collapsible **My sessions** panel (everything the caller
 * created/manages/joined, any status, grouped by calendar day). Assembles
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
    setSearchParams((params) => {
      params.delete('session');
      return params;
    }, { replace: true });
  };

  const discoverGridClassName = data.isHistoryPanelCollapsed
    ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid grid-cols-1 gap-3 sm:grid-cols-2';

  return (
    <main className="py-4">
      <h1 className="sr-only">Matches</h1>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <SportSwitcher
          sports={Object.values(data.sportsByKey)}
          active={data.activeSport}
          onChange={data.setActiveSport}
          maxSports={sportCatalog.data.length || undefined}
          isCheckingCatalog={addSportLauncher.isCheckingCatalog}
          onAddSport={addSportLauncher.launch}
        />
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
          sessions={data.discoverSessions}
          isLoading={data.isDiscoverLoading}
          isError={data.isDiscoverError}
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
            title={data.isHistoryPanelCollapsed ? 'Show my sessions' : 'Hide my sessions'}
            aria-label={data.isHistoryPanelCollapsed ? 'Show my sessions' : 'Hide my sessions'}
            aria-expanded={!data.isHistoryPanelCollapsed}
            onClick={data.toggleHistoryPanelCollapsed}
            className="border-hairline absolute top-14 left-1/2 flex size-7.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-border-strong bg-surface-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            {data.isHistoryPanelCollapsed ? (
              <IconChevronsLeft className="size-3.5 text-text-secondary" aria-hidden="true" />
            ) : (
              <IconChevronsRight className="size-3.5 text-text-secondary" aria-hidden="true" />
            )}
          </button>
        </div>

        {!data.isHistoryPanelCollapsed && (
          <section aria-label="My sessions" className="flex flex-col gap-3 md:w-[calc(33.333%-2rem)] md:shrink-0">
            <h2 className="text-2sm font-medium text-text-primary">My sessions</h2>

            {data.isMySessionsLoading && <p className="text-2sm text-text-muted">Loading…</p>}
            {data.isMySessionsError && (
              <p role="alert" className="text-2sm text-text-danger">
                Couldn't load your sessions.
              </p>
            )}
            {!data.isMySessionsLoading && !data.isMySessionsError && data.mySessionDateGroups.length === 0 && (
              <p className="text-2sm text-text-muted">You haven't created or joined any sessions yet.</p>
            )}
            {!data.isMySessionsLoading && !data.isMySessionsError && data.mySessionDateGroups.length > 0 && (
              <div className="flex flex-col gap-4">
                {data.mySessionDateGroups.map((group) => (
                  <SessionDateGroup
                    key={group.dateKey}
                    dateKey={group.dateKey}
                    dateLabel={group.dateLabel}
                    sessions={group.sessions}
                    sportsByKey={data.sportsByKey}
                    currentUserId={data.currentUserId ?? ''}
                    isCollapsed={data.collapsedDateKeys.has(group.dateKey)}
                    onToggleCollapsed={data.toggleDateGroupCollapsed}
                    onViewDetails={data.onViewDetails}
                    onParticipationAction={data.onParticipationAction}
                    isParticipationActionPending={data.isParticipationActionPending}
                  />
                ))}
              </div>
            )}
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
        availableSports={availableSports}
        onAddSport={addSportMutation.mutate}
        isAddingSport={addSportMutation.isPending}
        isAddSportError={addSportMutation.isError}
      />

      <SessionDetailModal
        isOpen={data.selectedSessionId !== null}
        onClose={closeDetail}
        session={data.selectedSession}
        sportsByKey={data.sportsByKey}
        isLoading={data.isSessionLoading}
        isError={data.isSessionError}
        participants={data.participants}
        isParticipantsLoading={data.isParticipantsLoading}
        isParticipantsError={data.isParticipantsError}
        currentUserId={data.currentUserId ?? ''}
        canManage={data.canManage}
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
