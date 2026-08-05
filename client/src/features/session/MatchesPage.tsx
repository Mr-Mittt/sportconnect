import { IconChevronsLeft, IconChevronsRight, IconPlus, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAddSportProfile } from '@/shared/hooks/useAddSportProfile';
import { ALL_SPORT_KEYS } from '@/shared/lib/sportProfileConfig';
import { AddSportModal } from '@/shared/components/AddSportModal';
import { SportSwitcher } from '@/shared/components/SportSwitcher';
import { CreateSessionModal } from './components/CreateSessionModal';
import { SessionDateGroup } from './components/SessionDateGroup';
import { SessionDetailModal } from './components/SessionDetailModal';
import { SessionListCard } from './components/SessionListCard';
import { useMatchesPageData } from './useMatchesPageData';
import type { SessionSearchMode } from './types';

/** Discover panel search-scope options — only 'sessions' filters for real (see
 * useMatchesPageData's discoverSessions memo); the other two render disabled since this app
 * has no location/gear search or gear/equipment domain yet. */
const SEARCH_MODE_OPTIONS: { value: SessionSearchMode; label: string; disabled?: boolean }[] = [
  { value: 'sessions', label: 'Sessions' },
  { value: 'location', label: 'Location', disabled: true },
  { value: 'gear', label: 'Gear', disabled: true },
];

/** Rendered inert (aria-disabled, no handler) — CLIENT-SESSION-6 ships the visual affordance
 * only, real filtering behavior is a follow-up once there's a design for what each one opens. */
const FILTER_PILL_LABELS = ['Date', 'Time', 'Location'];

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

  const [isAddSportOpen, setIsAddSportOpen] = useState(false);
  const addSportMutation = useAddSportProfile(data.currentUserId);
  const availableSports = useMemo(
    () => ALL_SPORT_KEYS.filter((key) => !Object.keys(data.sportsByKey).includes(key)),
    [data.sportsByKey],
  );

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
          onAddSport={() => setIsAddSportOpen(true)}
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
        <section aria-label="Discover sessions" className="min-w-0 flex-1">
          <h2 className="sr-only">Discover</h2>
          <div className="mb-3.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <select
                value={data.searchMode}
                onChange={(event) => data.setSearchMode(event.target.value as SessionSearchMode)}
                aria-label="Search scope"
                className="border-hairline cursor-pointer rounded-lg border-border bg-surface-2 px-2.5 py-2 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
              >
                {SEARCH_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="relative min-w-0 flex-1">
                <IconSearch
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={data.searchText}
                  onChange={(event) => data.setSearchText(event.target.value)}
                  placeholder="Search"
                  aria-label="Search sessions"
                  className="border-hairline w-full rounded-lg border-border bg-surface-2 py-2 pr-2.5 pl-8 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTER_PILL_LABELS.map((label) => (
                <button
                  key={label}
                  type="button"
                  aria-disabled="true"
                  title="Filtering by this isn't available yet"
                  className="border-hairline cursor-not-allowed rounded-full border-border bg-surface-1 px-3 py-1.5 text-xs text-text-secondary"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {data.isDiscoverLoading && <p className="text-2sm text-text-muted">Loading…</p>}
          {data.isDiscoverError && (
            <p role="alert" className="text-2sm text-text-danger">
              Couldn't load sessions to discover.
            </p>
          )}
          {!data.isDiscoverLoading && !data.isDiscoverError && data.discoverSessions.length === 0 && (
            <p className="text-2sm text-text-muted">
              {data.searchText.trim() === ''
                ? 'No sessions to discover for this sport yet.'
                : 'No sessions match your search.'}
            </p>
          )}
          {!data.isDiscoverLoading && !data.isDiscoverError && data.discoverSessions.length > 0 && (
            <div className={discoverGridClassName}>
              {data.discoverSessions.map((session) => (
                <SessionListCard
                  key={session.id}
                  session={session}
                  sportsByKey={data.sportsByKey}
                  onViewDetails={data.onViewDetails}
                />
              ))}
            </div>
          )}
        </section>

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
                    isCollapsed={data.collapsedDateKeys.has(group.dateKey)}
                    onToggleCollapsed={data.toggleDateGroupCollapsed}
                    onViewDetails={data.onViewDetails}
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
        onClose={data.closeCreateModal}
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
      />

      <SessionDetailModal
        isOpen={data.selectedSessionId !== null}
        onClose={closeDetail}
        session={data.selectedSession}
        isLoading={data.isSessionLoading}
        isError={data.isSessionError}
        participants={data.participants}
        isParticipantsLoading={data.isParticipantsLoading}
        isParticipantsError={data.isParticipantsError}
        currentUserId={data.currentUserId ?? ''}
        canManage={data.canManageSelected}
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
      />

      <AddSportModal
        isOpen={isAddSportOpen}
        onClose={() => setIsAddSportOpen(false)}
        availableSports={availableSports}
        isSubmitting={addSportMutation.isPending}
        isError={addSportMutation.isError}
        onSubmit={(payload) =>
          addSportMutation.mutate(payload, { onSuccess: () => setIsAddSportOpen(false) })
        }
      />
    </main>
  );
}
