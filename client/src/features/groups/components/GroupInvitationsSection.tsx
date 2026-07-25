import type { GroupInvitation } from '@/features/feed/types';
import { formatNameList } from '@/shared/lib/formatNameList';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

interface GroupInvitationsSectionProps {
  invitations: GroupInvitation[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onAccept: (invitationId: number) => void;
  onReject: (invitationId: number) => void;
  isAccepting: boolean;
  isRejecting: boolean;
}

/**
 * GRP-7 part 2 — the invitee-facing "Invitations" section on
 * `GroupDiscoveryPanel`'s All-groups landing state, sitting above the
 * joined-groups grid. Per spec, this is **hidden entirely** once loaded with
 * zero rows (not a "Nothing here yet." message like `GroupMembersTab`'s
 * sections) — an empty inbox shouldn't take up space on a page the user
 * lands on by default. Still renders normally through loading/error states,
 * since there's no way to know ahead of the fetch whether it'll end up
 * empty. Sorted newest-first by the caller (`useGroupInvitationsData`) — a
 * personal inbox reads better with the newest arrival on top, unlike the
 * Members tab's oldest-first approval queue.
 *
 * GRP-8 part 2: renders every co-inviter (B14's `inviterFullNames`) via
 * `formatNameList`, not just the original inviter. `onReject` no longer
 * fires the mutation directly — the parent (`GroupsPage`) opens
 * `RejectInvitationConfirmDialog` instead, which collects an optional reason
 * before actually calling `useRejectInvitation`.
 */
export function GroupInvitationsSection({
  invitations,
  isLoading,
  isError,
  onRetry,
  onAccept,
  onReject,
  isAccepting,
  isRejecting,
}: GroupInvitationsSectionProps) {
  if (!isLoading && !isError && invitations.length === 0) return null;

  return (
    <section aria-label="Invitations" className="flex flex-col gap-2.5">
      <h2 className="text-2sm font-semibold text-text-primary">Invitations</h2>

      {isLoading && (
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-2sm text-text-danger">
            Couldn't load your invitations.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer rounded-lg border-hairline border-border px-2.5 py-1 text-2xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="flex flex-col gap-2">
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="border-hairline flex items-center justify-between gap-3 rounded-lg border-border p-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-2sm font-medium text-text-primary">
                  {invitation.groupName}
                </div>
                <div className="text-2xs text-text-muted">
                  Group invitation from {formatNameList(invitation.inviterFullNames)}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRejecting}
                  onClick={() => onReject(invitation.id)}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isAccepting}
                  onClick={() => onAccept(invitation.id)}
                >
                  Accept
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
