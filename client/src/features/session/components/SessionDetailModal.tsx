import { IconCoin, IconMapPin, IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import type { Comment } from '@/features/feed/types';
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
import { SessionCommentSection } from './SessionCommentSection';

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

  /** CLIENT-SESSION-4: REQUESTED participants awaiting approval — parent gates the underlying
   * query on `canManage` too, so this stays empty (and the section stays hidden) for anyone else. */
  requestedParticipants: SessionParticipant[];
  isRequestedParticipantsLoading: boolean;
  isRequestedParticipantsError: boolean;
  onApproveParticipant: (userId: string) => void;
  isApprovingParticipant: boolean;
  onRejectParticipant: (userId: string, reason: string) => void;
  isRejectingParticipant: boolean;

  /** Likes/unlikes the session's own SESSION_POST anchor — reads state from
   * `session.likeCount`/`session.isLikedByCurrentUser` (SESSION-10 "post-ship addition"). */
  onToggleLike: () => void;
  isTogglingLike: boolean;

  /** CLIENT-SESSION-8: the caller's own identity for the comment composer avatar — same
   * `{ fullName, avatarUrl }` shape `CreatePostForm` already takes, sourced from the page's own
   * `useAuthStore` read rather than threaded through the page-data hook. */
  currentUser: { fullName: string; avatarUrl: string | null } | undefined;
  comments: Comment[];
  isCommentsLoading: boolean;
  isCommentsError: boolean;
  isCommentsForbidden: boolean;
  hasMoreComments: boolean;
  isFetchingMoreComments: boolean;
  onFetchMoreComments: () => void;
  onAddComment: (content: string) => void;
  onAddCommentReply: (parentCommentId: number, content: string) => void;
  isPostingComment: boolean;
  onDeleteComment: (comment: Comment) => void;
  onToggleCommentLike: (comment: Comment) => void;
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
 *
 * CLIENT-SESSION-4 adds a "Waiting for approval" section between Participants and the Join/Leave
 * button, mirroring `GroupMembersTab`'s empty-hides pattern: it only renders when
 * `requestedParticipants` is non-empty AND `canJoinOrLeave` (SCHEDULED/ONGOING) — the backend
 * rejects approve/reject once a session is CANCELLED, same reason `cancelSession` itself is
 * blocked on COMPLETED/CANCELLED, so this doesn't show buttons that would only ever 400. The
 * parent also gates the underlying query on `canManage`, so a non-manager caller never even
 * fetches it — same reasoning as the group module's own approval-queue gating. Reject reveals an
 * inline optional-reason box per row (same idiom as the cancel-reason reveal above, not a second
 * nested Dialog/Popover — see `CreateSessionModal`'s notes on why that pattern breaks here),
 * Approve is immediate.
 *
 * CLIENT-SESSION-8 adds a "Discussion" section (`SessionCommentSection`) rendered inline after
 * the Participants/Waiting-for-approval sections — an inline block, not a second nested Dialog
 * (same nesting constraint noted above), unlike Post's own `CommentSection`. Visibility is
 * `isCommentsForbidden`-gated rather than computed here: the client has no reliable
 * client-side signal for whether the caller is a participant (that's CLIENT-SESSION-9's
 * `callerParticipation`, not yet built) — a 403 from the backend on the comments fetch is the
 * real gate, and `SessionCommentSection` renders nothing when it's true.
 *
 * The heart button (like/unlike the session's own SESSION_POST anchor) renders inside
 * `SessionCommentSection`, directly above the comment thread — same placement Post's own
 * `CommentSection` uses for its like button (right under the repeated content, before the
 * comments), not up in this modal's own status/detail area. Controlled entirely by
 * `session.likeCount`/`session.isLikedByCurrentUser` (backend-resolved, no client-side
 * optimistic state).
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
  requestedParticipants,
  isRequestedParticipantsLoading,
  isRequestedParticipantsError,
  onApproveParticipant,
  isApprovingParticipant,
  onRejectParticipant,
  isRejectingParticipant,
  onToggleLike,
  isTogglingLike,
  currentUser,
  comments,
  isCommentsLoading,
  isCommentsError,
  isCommentsForbidden,
  hasMoreComments,
  isFetchingMoreComments,
  onFetchMoreComments,
  onAddComment,
  onAddCommentReply,
  isPostingComment,
  onDeleteComment,
  onToggleCommentLike,
}: SessionDetailModalProps) {
  const [isCancelFormOpen, setIsCancelFormOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  /** Which requested-participant row currently has its reject-reason box open — only one at a
   * time, same "no native confirm dialog, inline reveal" idiom as `isCancelFormOpen` above. */
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

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
          setRejectingUserId(null);
          setRejectReason('');
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

              {/* canJoinOrLeave also gates approve/reject, not just non-empty — the backend
                  rejects both once the session is CANCELLED (same reason cancelSession itself
                  is blocked on COMPLETED/CANCELLED), so this stays hidden rather than showing
                  buttons that would only ever 400. */}
              {canJoinOrLeave && requestedParticipants.length > 0 && (
                <section aria-label="Waiting for approval" className="flex flex-col gap-2">
                  <div className="text-2sm font-medium text-text-primary">
                    Waiting for approval ({requestedParticipants.length})
                  </div>
                  {isRequestedParticipantsLoading && (
                    <p className="text-2xs text-text-muted">Loading…</p>
                  )}
                  {isRequestedParticipantsError && (
                    <p role="alert" className="text-2xs text-text-danger">
                      Couldn't load requests.
                    </p>
                  )}
                  {!isRequestedParticipantsLoading && !isRequestedParticipantsError && (
                    <div className="flex flex-col gap-1.5">
                      {requestedParticipants.map((participant) => (
                        <div key={participant.id} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <Avatar className="size-6 shrink-0">
                                {participant.userAvatarUrl !== null && (
                                  <AvatarImage src={participant.userAvatarUrl} alt="" />
                                )}
                                <AvatarFallback className="text-2xs">
                                  {initialsFor(participant.userFullName)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate text-2sm text-text-primary">
                                {participant.userFullName}
                              </span>
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isRejectingParticipant}
                                onClick={() => {
                                  setRejectingUserId(participant.userId);
                                  setRejectReason('');
                                }}
                              >
                                Reject
                              </Button>
                              <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={isApprovingParticipant}
                                onClick={() => onApproveParticipant(participant.userId)}
                              >
                                Approve
                              </Button>
                            </div>
                          </div>
                          {rejectingUserId === participant.userId && (
                            <div className="border-hairline flex flex-col gap-2 rounded-lg border-border p-2.5">
                              <Input
                                value={rejectReason}
                                onChange={(event) => setRejectReason(event.target.value)}
                                placeholder="Reason (optional)"
                                aria-label={`Reject reason for ${participant.userFullName}`}
                              />
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  disabled={isRejectingParticipant}
                                  onClick={() => {
                                    onRejectParticipant(participant.userId, rejectReason.trim());
                                    setRejectingUserId(null);
                                  }}
                                >
                                  {isRejectingParticipant ? 'Rejecting…' : 'Confirm reject'}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={isRejectingParticipant}
                                  onClick={() => setRejectingUserId(null)}
                                >
                                  Never mind
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <SessionCommentSection
                currentUserId={currentUserId}
                currentUser={currentUser}
                likeCount={session.likeCount}
                isLikedByCurrentUser={session.isLikedByCurrentUser}
                onToggleLike={onToggleLike}
                isTogglingLike={isTogglingLike}
                comments={comments}
                isLoading={isCommentsLoading}
                isError={isCommentsError}
                isForbidden={isCommentsForbidden}
                hasMore={hasMoreComments}
                isFetchingMore={isFetchingMoreComments}
                onFetchMore={onFetchMoreComments}
                onAddComment={onAddComment}
                onAddReply={onAddCommentReply}
                isPosting={isPostingComment}
                onDeleteComment={onDeleteComment}
                onToggleCommentLike={onToggleCommentLike}
              />

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
