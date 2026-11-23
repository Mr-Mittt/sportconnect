import { useGroupSessionsTabData } from '@/features/session/useGroupSessionsTabData';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { GroupHistoryDateSessions } from './GroupHistoryDateSessions';
import { GroupSessionsTabView } from './GroupSessionsTabView';

interface GroupSessionsTabProps {
  groupId: number;
  /** The group's `createdAt`: the History's month filter does not go back past its month. */
  groupCreatedAt?: string;
  onCreate: () => void;
  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;
}

/**
 * CLIENT-GROUP-SESSION-2: a group's Sessions tab, connected. Mounted per group (`key={groupId}` in `GroupsPage`, like the
 * chat tab) so the section state and the expanded dates start fresh for every group; only mounted while the tab is the active
 * one, so nothing is fetched for a tab nobody opened. `GroupSessionsTabView` is the presentational body.
 */
export function GroupSessionsTab({
  groupId,
  groupCreatedAt,
  onCreate,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
}: GroupSessionsTabProps) {
  const data = useGroupSessionsTabData(groupId, true, groupCreatedAt);
  return (
    <GroupSessionsTabView
      statuses={data.statuses}
      onStatusesChange={data.setSectionStatuses}
      today={data.today}
      others={data.others}
      history={data.history}
      todayKey={data.todayKey}
      onCreate={onCreate}
      renderDateSessions={(date, dateLabel) => (
        <GroupHistoryDateSessions
          groupId={groupId}
          date={date}
          dateLabel={dateLabel}
          statuses={data.statuses.history}
          sportsByKey={sportsByKey}
          currentUserId={currentUserId}
          onViewDetails={onViewDetails}
          onParticipationAction={onParticipationAction}
          isParticipationActionPending={isParticipationActionPending}
        />
      )}
      sportsByKey={sportsByKey}
      currentUserId={currentUserId}
      onViewDetails={onViewDetails}
      onParticipationAction={onParticipationAction}
      isParticipationActionPending={isParticipationActionPending}
    />
  );
}
