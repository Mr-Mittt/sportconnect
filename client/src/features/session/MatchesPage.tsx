import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAddSportProfile } from '@/shared/hooks/useAddSportProfile';
import { ALL_SPORT_KEYS } from '@/shared/lib/sportProfileConfig';
import { AddSportModal } from '@/shared/components/AddSportModal';
import { SportSwitcher } from '@/shared/components/SportSwitcher';
import { CreateSessionModal } from './components/CreateSessionModal';
import { SessionDetailModal } from './components/SessionDetailModal';
import { SessionListCard } from './components/SessionListCard';
import { useMatchesPageData } from './useMatchesPageData';

/**
 * CLIENT-SESSION-1's Matches page (`/matches`, replacing `ComingSoonPage`) — sport-filterable
 * list of the caller's group and standalone sessions, a "Create session" entry, and the detail
 * dialog for join/leave/cancel. Assembles `useMatchesPageData()`; owns only the one piece of
 * page-level state that other pages' `UpcomingMatches` rail card needs to reach into
 * (`?session={id}` deep link, read once via `useSearchParams` and handed to the data hook as
 * its initial value — same `useParams`-seeds-page-state precedent FEED-12 used for
 * `/posts/:postId`).
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

      {data.isLoading && <p className="text-2sm text-text-muted">Loading…</p>}
      {data.isError && (
        <p role="alert" className="text-2sm text-text-danger">
          Couldn't load your sessions.
        </p>
      )}
      {!data.isLoading && !data.isError && data.sessions.length === 0 && (
        <p className="text-2sm text-text-muted">No sessions for this sport yet.</p>
      )}
      {!data.isLoading && !data.isError && data.sessions.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.sessions.map((session) => (
            <SessionListCard
              key={session.id}
              session={session}
              sportsByKey={data.sportsByKey}
              onViewDetails={data.onViewDetails}
            />
          ))}
        </div>
      )}

      <CreateSessionModal
        key={data.isCreateModalOpen ? 'open' : 'closed'}
        isOpen={data.isCreateModalOpen}
        onClose={data.closeCreateModal}
        sportsByKey={data.sportsByKey}
        activeSport={data.activeSport}
        selectedLocation={data.selectedLocationForCreate}
        onOpenLocationPicker={data.onOpenLocationPickerForCreate}
        locationPicker={data.locationPickerForCreate}
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
