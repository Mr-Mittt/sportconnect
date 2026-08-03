import { IconCoin, IconMapPin, IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import { formatFeeDisplay } from '@/shared/lib/feeType';
import { directionsUrl } from '@/shared/lib/mapsLinks';
import { UNCAPPED_CAPACITY } from '@/shared/lib/sessionCapacity';
import { SESSION_STATUS_CLASSES, SESSION_STATUS_LABEL } from '@/shared/lib/sessionStatus';
import { formatStartTime } from '@/shared/lib/startTime';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import type { Session, SessionParticipant } from '../types';

interface SessionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;

  session: Session | undefined;
  isLoading: boolean;
  isError: boolean;

  participants: SessionParticipant[];
  isParticipantsLoading: boolean;
  isParticipantsError: boolean;

  currentUserId: string;
  /** Creator (standalone) or owner/admin (group-linked) — resolved by the caller, same
   * canManageMembers-derived gate the create flow uses. */
  canManage: boolean;

  onJoin: () => void;
  isJoining: boolean;
  isJoinError: boolean;

  onLeave: () => void;
  isLeaving: boolean;
  isLeaveError: boolean;

  onConfirmCancel: (reason: string) => void;
  isCancelling: boolean;
  isCancelError: boolean;
}

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * CLIENT-SESSION-1's session detail — full info, participants, and the real actions the list
 * card doesn't have room for: join/leave (derived from whether `currentUserId` appears
 * `JOINED` in `participants` — no separate "am I joined" field exists on `SessionResponse`) and
 * cancel (creator/owner/admin only, `canManage`). Cancelling reveals an inline optional-reason
 * field + Confirm/Never mind, not `window.confirm` — matches this codebase's existing
 * no-native-confirm-dialogs convention. Presentational and controlled: the parent
 * (`useMatchesPageData`) owns every query/mutation and passes state + callbacks down.
 */
export function SessionDetailModal({
  isOpen,
  onClose,
  session,
  isLoading,
  isError,
  participants,
  isParticipantsLoading,
  isParticipantsError,
  currentUserId,
  canManage,
  onJoin,
  isJoining,
  isJoinError,
  onLeave,
  isLeaving,
  isLeaveError,
  onConfirmCancel,
  isCancelling,
  isCancelError,
}: SessionDetailModalProps) {
  const [isCancelFormOpen, setIsCancelFormOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const isJoined = participants.some(
    (participant) => participant.userId === currentUserId && participant.status === 'JOINED',
  );
  const canJoinOrLeave = session !== undefined && (session.status === 'SCHEDULED' || session.status === 'ONGOING');

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setIsCancelFormOpen(false);
          setCancelReason('');
          onClose();
        }
      }}
    >
      <DialogContent fixedHeight>
        <DialogHeader
          title={session === undefined ? 'Session' : (session.title ?? `${session.sportName} session`)}
          className="border-hairline-b border-border px-4 py-3"
        />
        <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3.5">
          {isLoading && <p className="text-2sm text-text-muted">Loading…</p>}
          {isError && <p role="alert" className="text-2sm text-text-danger">Couldn't load this session.</p>}

          {session !== undefined && (
            <>
              <div className="flex items-center justify-between">
                <span className={cn('text-2sm font-medium', SESSION_STATUS_CLASSES[session.status])}>
                  {SESSION_STATUS_LABEL[session.status]}
                </span>
                <span className="text-2xs text-text-muted">
                  {session.groupId === null ? 'Standalone' : `Group session`}
                </span>
              </div>

              <div className="text-2sm text-text-secondary">{formatStartTime(session.scheduledStart)}</div>

              <div className="flex flex-col gap-1">
                <div className="text-2sm text-text-primary">{session.location.name}</div>
                {session.location.address !== null && (
                  <div className="text-2xs text-text-muted">{session.location.address}</div>
                )}
                {session.locationNote !== null && (
                  <div className="text-2xs text-text-muted">{session.locationNote}</div>
                )}
                {session.location.latitude !== null && session.location.longitude !== null && (
                  <a
                    href={directionsUrl(session.location.latitude, session.location.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-fit items-center gap-1 text-2sm text-text-accent hover:underline"
                  >
                    <IconMapPin className="size-4" aria-hidden="true" />
                    Get Directions
                  </a>
                )}
              </div>

              {session.description !== null && (
                <p className="text-2sm text-text-secondary">{session.description}</p>
              )}

              <div className="flex items-center gap-1.5 text-2sm text-text-secondary">
                <IconCoin className="size-4 shrink-0" aria-hidden="true" />
                {formatFeeDisplay(session.feeType, session.feeAmountVnd)}
              </div>

              <div className="text-2xs text-text-muted">Created by {session.createdByFullName}</div>

              {session.status === 'CANCELLED' && (
                <div className="border-hairline rounded-lg border-border bg-surface-1 p-2.5 text-2sm text-text-secondary">
                  <div>
                    Cancelled by {session.cancelledByFullName ?? 'unknown'}
                    {session.cancelledAt !== null ? ` on ${formatStartTime(session.cancelledAt)}` : ''}
                  </div>
                  {session.cancelReason !== null && session.cancelReason !== '' && (
                    <div className="mt-1 text-2xs text-text-muted">Reason: {session.cancelReason}</div>
                  )}
                </div>
              )}

              <section aria-label="Participants" className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-2sm font-medium text-text-primary">
                  <IconUsers className="size-4" aria-hidden="true" />
                  Participants (
                  {session.capacity === UNCAPPED_CAPACITY
                    ? session.participantCount
                    : `${session.participantCount}/${session.capacity}`}
                  )
                </div>
                {isParticipantsLoading && <p className="text-2xs text-text-muted">Loading…</p>}
                {isParticipantsError && (
                  <p role="alert" className="text-2xs text-text-danger">
                    Couldn't load participants.
                  </p>
                )}
                {!isParticipantsLoading && !isParticipantsError && (
                  <div className="flex flex-col gap-1.5">
                    {participants.map((participant) => (
                      <div key={participant.id} className="flex items-center gap-2">
                        <Avatar className="size-6 shrink-0">
                          {participant.userAvatarUrl !== null && (
                            <AvatarImage src={participant.userAvatarUrl} alt="" />
                          )}
                          <AvatarFallback className="text-2xs">
                            {initialsFor(participant.userFullName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-2sm text-text-primary">{participant.userFullName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {isJoinError && (
                <p role="alert" className="text-2sm text-text-danger">
                  Couldn't join this session. Try again.
                </p>
              )}
              {isLeaveError && (
                <p role="alert" className="text-2sm text-text-danger">
                  Couldn't leave this session. Try again.
                </p>
              )}

              {canJoinOrLeave && (
                <Button
                  variant={isJoined ? 'outline' : 'primary'}
                  disabled={isJoining || isLeaving}
                  onClick={isJoined ? onLeave : onJoin}
                >
                  {isJoined ? (isLeaving ? 'Leaving…' : 'Leave') : isJoining ? 'Joining…' : 'Join'}
                </Button>
              )}

              {canManage && canJoinOrLeave && !isCancelFormOpen && (
                <Button variant="outline" onClick={() => setIsCancelFormOpen(true)}>
                  Cancel session
                </Button>
              )}

              {isCancelFormOpen && (
                <div className="border-hairline flex flex-col gap-2 rounded-lg border-border p-2.5">
                  <Input
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    placeholder="Reason (optional)"
                    aria-label="Cancellation reason"
                  />
                  {isCancelError && (
                    <p role="alert" className="text-2xs text-text-danger">
                      Couldn't cancel this session. Try again.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isCancelling}
                      onClick={() => onConfirmCancel(cancelReason.trim())}
                    >
                      {isCancelling ? 'Cancelling…' : 'Confirm cancel'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isCancelling}
                      onClick={() => setIsCancelFormOpen(false)}
                    >
                      Never mind
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
