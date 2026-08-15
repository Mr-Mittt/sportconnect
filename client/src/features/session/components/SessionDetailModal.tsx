import {
  IconChevronDown,
  IconCheck,
  IconClock,
  IconCoin,
  IconHeart,
  IconHeartFilled,
  IconLoader2,
  IconLogout,
  IconMapPin,
  IconUserPlus,
  IconUsers,
  IconX,
  type Icon,
} from '@tabler/icons-react';
import { useState } from 'react';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import type { Comment } from '@/features/feed/types';
import { SportIcon } from '@/shared/components/SportIcon';
import { formatFeeDisplay } from '@/shared/lib/feeType';
import { directionsUrl } from '@/shared/lib/mapsLinks';
import { getRampBadgeClasses, getRampFillClass } from '@/shared/lib/rampStyles';
import { UNCAPPED_CAPACITY } from '@/shared/lib/sessionCapacity';
import { getParticipationAction, type ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import { SESSION_STATUS_CLASSES, SESSION_STATUS_LABEL } from '@/shared/lib/sessionStatus';
import { formatSessionHeaderDateTime, formatStartTime } from '@/shared/lib/startTime';
import { cn } from '@/shared/lib/utils';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import type { Session, SessionParticipant } from '../types';
import { SessionCommentComposer } from './SessionCommentComposer';
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

  /** CLIENT-SESSION-10: the header's sport chip — same shape/lookup `SessionCard` already
   * uses (`sportKeyForId(session.sportId)` → `sportsByKey[key]`). Every page rendering this modal
   * already computes this for its own cards, so it's a prop, not a query owned here. Absent entry
   * (the viewer has no profile for that sport, or the catalog hasn't resolved it) hides the chip
   * — same "sport !== undefined &&" precedent SessionCard already established, not a new one. */
  sportsByKey: Record<SportKey, SportProfile>;

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

/** `(host)` / `(you)` / `(host, you)` — muted qualifier next to a roster chip's name, kept as a
 * separate text node from the name itself (not concatenated in the same string) so the name
 * alone stays queryable by exact text. */
function rosterQualifier(isHost: boolean, isYou: boolean): string | null {
  if (isHost && isYou) return '(host, you)';
  if (isHost) return '(host)';
  if (isYou) return '(you)';
  return null;
}

const PARTICIPATION_ACTION_ICON: Record<ParticipationActionKind, Icon> = {
  JOIN: IconUserPlus,
  ACCEPT: IconCheck,
  CANCEL: IconX,
  LEAVE: IconLogout,
};

const PARTICIPATION_PENDING_LABEL: Record<ParticipationActionKind, string> = {
  JOIN: 'Joining…',
  ACCEPT: 'Accepting…',
  CANCEL: 'Cancelling…',
  LEAVE: 'Leaving…',
};

/** CLIENT-SESSION-10: a participation action button's contents — an idle icon + label, swapped
 * for a spinner + the kind's pending label while its mutation is in flight. The button's own
 * accessible name is the visible text alone (the icon/spinner are `aria-hidden`), so it stays
 * "Join"/"Accept"/etc. at rest — pending state only changes what's rendered, tests that assert by
 * idle name are unaffected. `motion-reduce:animate-none` respects the a11y baseline. */
function ActionButtonContent({
  Icon: ActionIcon,
  isPending,
  pendingLabel,
  idleLabel,
}: {
  Icon: Icon;
  isPending: boolean;
  pendingLabel: string;
  idleLabel: string;
}) {
  if (isPending) {
    return (
      <>
        <IconLoader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {pendingLabel}
      </>
    );
  }
  return (
    <>
      <ActionIcon className="size-4" aria-hidden="true" />
      {idleLabel}
    </>
  );
}

/**
 * CLIENT-SESSION-1's session detail — full info, participants, and the real actions the list
 * card doesn't have room for: join/accept/decline/cancel/leave. Presentational and controlled:
 * the parent (`useMatchesPageData`) owns every query/mutation and passes state + callbacks down.
 * (Cancelling the session itself — `canManage`/`onConfirmCancel` — was a modal action here through
 * CLIENT-SESSION-10; its button was removed post-ship, user decision, this modal no longer renders
 * it. `canManage`/`onConfirmCancel`/`isCancelling`/`isCancelError` stay in the prop contract
 * unused, rather than rippling the removal through `useSessionDetailModalData` and all 4 render
 * sites, since only the button's presence in this modal was asked to go, not the capability.)
 *
 * CLIENT-SESSION-9 replaced the old "isJoined" derivation (`participants.some(...JOINED)` — a
 * false negative for anyone INVITED/REQUESTED, since `participants` only ever holds JOINED rows
 * for a non-manager caller) with `session.callerParticipation`, driving a 4-state action area:
 * null/LEFT -> Join, INVITED -> Accept + Decline, REQUESTED -> Cancel, JOINED -> Leave. Accept
 * reuses the existing `onJoin`/`isJoining` props (an invitee's own join call always resolves
 * straight to JOINED); Decline/Cancel reuse the existing `onLeave`/`isLeaving` props (SESSION-9
 * widened `leaveSession` to accept INVITED/REQUESTED rows too) — no prop-signature change from
 * CLIENT-SESSION-1.
 *
 * CLIENT-SESSION-4 adds a "Waiting for approval" section between Players and the participation
 * action row, mirroring `GroupMembersTab`'s empty-hides pattern: it only renders when
 * `requestedParticipants` is non-empty AND `canJoinOrLeave` (SCHEDULED/ONGOING) — the backend
 * rejects approve/reject once a session is CANCELLED (same reason cancelling a session is blocked
 * on COMPLETED/CANCELLED), so this doesn't show buttons that would only ever 400. The parent also
 * gates the underlying query on `canManage`, so a non-manager caller never even fetches it — same
 * reasoning as the group module's own approval-queue gating. Reject reveals an inline
 * optional-reason box per row, not a second nested Dialog/Popover — see `CreateSessionModal`'s
 * notes on why that pattern breaks here. Approve is immediate.
 *
 * CLIENT-SESSION-8 adds a "Discussion" section (`SessionCommentSection`) — an inline block, not a
 * second nested Dialog (same nesting constraint noted above), unlike Post's own `CommentSection`.
 * Visibility stayed `isCommentsForbidden`-gated rather than switched to `callerParticipation` once
 * CLIENT-SESSION-9 shipped it — a 403 from the backend on the comments fetch remains the real gate
 * (e.g. a REQUESTED caller isn't a participant yet and still shouldn't see the thread), and
 * `SessionCommentSection` renders nothing when it's true.
 *
 * CLIENT-SESSION-10 (design-reference-session-modal.html) is a UX/UI pass on top of all the above,
 * not a behavior change to any of it: custom header (sport chip + truncating title, replacing the
 * generic centered `DialogHeader` — same "build a custom header" precedent `CommentSection`'s own
 * dialog already set for a header shape that doesn't fit a single centered title), a capacity
 * meter, Players/Waiting-for-approval sections made collapsible (page-local `useState`, per
 * `client/CLAUDE.md`), the approval queue wrapped in an amber card (the first real use of the
 * amber token CLAUDE.md already reserves app-wide for warning semantics), icons + a loading
 * spinner on the participation action buttons, and the comment composer relocated out of
 * `SessionCommentSection` (now `SessionCommentComposer`, its own component) into a non-scrolling,
 * centered footer — mirroring `CommentSection`'s own precedent for a composer row pinned outside
 * the `overflow-y-auto` body. The "Participants" section is renamed "Players" — a deliberate copy
 * change from the design reference, not a mechanical rename; its `aria-label` follows suit.
 * Approve/Reject deliberately keep their existing plain-text treatment — this pass's icon scope
 * was Join/Accept/Decline/Cancel/Leave only. A JOINED session creator never sees Leave (they'd
 * have managed via Cancel session; now that's gone, they simply have no participation action —
 * post-ship refinement, same day).
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
  sportsByKey,
  onJoin,
  isJoining,
  isJoinError,
  onLeave,
  isLeaving,
  isLeaveError,
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
  /** Which requested-participant row currently has its reject-reason box open — only one at a
   * time, same "no native confirm dialog, inline reveal" idiom this modal already used for the
   * (now-removed) cancel-session reason reveal. */
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isPlayersCollapsed, setIsPlayersCollapsed] = useState(false);
  const [isApprovalCollapsed, setIsApprovalCollapsed] = useState(false);

  // SESSION-9/CLIENT-SESSION-9: derived from `session.callerParticipation`, not a lookup into
  // `participants` (which only ever holds JOINED rows for a non-manager — see the Players
  // section below).
  const participationAction = session !== undefined ? getParticipationAction(session) : null;
  const canJoinOrLeave = session !== undefined && (session.status === 'SCHEDULED' || session.status === 'ONGOING');

  const title = session === undefined ? 'Session' : (session.title ?? `${session.sportName} session`);
  const sportKey = session !== undefined ? sportKeyForId(session.sportId) : undefined;
  const sport = sportKey !== undefined ? sportsByKey[sportKey] : undefined;

  const isAcceptOrJoin = participationAction?.kind === 'JOIN' || participationAction?.kind === 'ACCEPT';
  // A JOINED creator (the normal case: creating a session also joins it) doesn't get the plain
  // participant Leave action — walking away from a session that still lists them as its creator
  // via the same "Leave" a regular participant uses isn't the intended flow (user decision).
  const isLeaveHiddenForCreator =
    participationAction?.kind === 'LEAVE' && session !== undefined && session.createdBy === currentUserId;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setRejectingUserId(null);
          setRejectReason('');
          onClose();
        }
      }}
    >
      <DialogContent fixedHeight fixedHeightVh={72} className="max-w-[35rem]">
        <div className="border-hairline-b flex flex-col gap-[9px] border-border px-4 py-3">
          <div className="grid w-full grid-cols-[1fr_minmax(0,auto)_1fr] items-start gap-2">
            <span aria-hidden="true" />
            <div className="flex min-w-0 items-center justify-center gap-1.5">
              {sport !== undefined && (
                <span
                  role="img"
                  aria-label={sport.label}
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full',
                    getRampBadgeClasses(sport.colorRamp),
                  )}
                >
                  <SportIcon iconUrl={sport.iconUrl} className="size-3" />
                </span>
              )}
              <DialogTitle className="min-w-0 truncate text-sm font-semibold text-text-primary">
                {title}
              </DialogTitle>
            </div>
            <DialogClose aria-label="Close" className="justify-self-end" />
          </div>
          {session !== undefined && (
            <div className="flex items-center gap-1.5 text-2sm">
              <span
                className={cn('size-1.5 shrink-0 rounded-full bg-current', SESSION_STATUS_CLASSES[session.status])}
                aria-hidden="true"
              />
              <span className={cn('font-medium', SESSION_STATUS_CLASSES[session.status])}>
                {SESSION_STATUS_LABEL[session.status]}
              </span>
              <span className="text-text-muted"> · {formatSessionHeaderDateTime(session.scheduledStart)}</span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3.5">
          {isLoading && <p className="text-2sm text-text-muted">Loading…</p>}
          {isError && <p role="alert" className="text-2sm text-text-danger">Couldn't load this session.</p>}

          {session !== undefined && (
            <>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <IconMapPin className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
                  <span className="text-2sm text-text-primary">{session.location.name}</span>
                  {session.location.latitude !== null && session.location.longitude !== null && (
                    <a
                      href={directionsUrl(session.location.latitude, session.location.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-2sm font-medium text-text-accent hover:underline"
                    >
                      Get Directions
                    </a>
                  )}
                </div>
                {session.location.address !== null && (
                  <div className="pl-6 text-2xs text-text-muted">{session.location.address}</div>
                )}
                {session.locationNote !== null && (
                  <div className="pl-6 text-2xs text-text-muted">{session.locationNote}</div>
                )}
              </div>

              {session.description !== null && (
                <p className="text-2sm text-text-secondary">{session.description}</p>
              )}

              <div className="flex items-center gap-1.5 text-2sm text-text-primary">
                <IconCoin className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
                {formatFeeDisplay(session.feeType, session.feeAmountVnd)}
              </div>

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

              <section aria-label="Players" className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlayersCollapsed((collapsed) => !collapsed)}
                  aria-expanded={!isPlayersCollapsed}
                  className="flex w-full cursor-pointer items-center gap-1.5 rounded text-2sm font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                >
                  <IconUsers className="size-4 shrink-0" aria-hidden="true" />
                  Players (
                  {session.capacity === UNCAPPED_CAPACITY
                    ? session.participantCount
                    : `${session.participantCount}/${session.capacity}`}
                  )
                  <IconChevronDown
                    className={cn(
                      'ml-auto size-4 shrink-0 text-text-muted transition-transform',
                      !isPlayersCollapsed && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                </button>

                {session.capacity !== UNCAPPED_CAPACITY && (
                  <div className="h-1.25 overflow-hidden rounded-full bg-surface-1">
                    <div
                      className={cn('h-full rounded-full', getRampFillClass(sport?.colorRamp))}
                      style={{
                        width: `${Math.min(100, (session.participantCount / session.capacity) * 100)}%`,
                      }}
                    />
                  </div>
                )}

                {isParticipantsLoading && <p className="text-2xs text-text-muted">Loading…</p>}
                {isParticipantsError && (
                  <p role="alert" className="text-2xs text-text-danger">
                    Couldn't load participants.
                  </p>
                )}

                {!isParticipantsLoading && !isParticipantsError && isPlayersCollapsed && (
                  <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
                    {participants.map((participant) => (
                      <Avatar
                        key={participant.id}
                        className="border-hairline size-7 shrink-0 border-border"
                        title={participant.userFullName}
                      >
                        {participant.userAvatarUrl !== null && (
                          <AvatarImage src={participant.userAvatarUrl} alt="" />
                        )}
                        <AvatarFallback className="text-2xs">
                          {initialsFor(participant.userFullName)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                )}

                {!isParticipantsLoading && !isParticipantsError && !isPlayersCollapsed && (
                  <div className="flex flex-wrap gap-1.5">
                    {participants.map((participant) => {
                      const qualifier = rosterQualifier(
                        participant.userId === session.createdBy,
                        participant.userId === currentUserId,
                      );
                      return (
                        <div
                          key={participant.id}
                          className="border-hairline flex items-center gap-1.5 rounded-full border-border bg-surface-2 py-1 pr-2.5 pl-1"
                        >
                          <Avatar className="size-5.5 shrink-0">
                            {participant.userAvatarUrl !== null && (
                              <AvatarImage src={participant.userAvatarUrl} alt="" />
                            )}
                            <AvatarFallback className="text-2xs">
                              {initialsFor(participant.userFullName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-2xs whitespace-nowrap text-text-primary">
                            {participant.userFullName}
                          </span>
                          {qualifier !== null && (
                            <span className="text-2xs whitespace-nowrap text-text-muted">{qualifier}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* canJoinOrLeave also gates approve/reject, not just non-empty — the backend
                  rejects both once the session is CANCELLED (same reason cancelSession itself
                  is blocked on COMPLETED/CANCELLED), so this stays hidden rather than showing
                  buttons that would only ever 400. */}
              {canJoinOrLeave && requestedParticipants.length > 0 && (
                <section aria-label="Waiting for approval" className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setIsApprovalCollapsed((collapsed) => !collapsed)}
                    aria-expanded={!isApprovalCollapsed}
                    className="flex w-full cursor-pointer items-center gap-1.5 rounded text-2sm font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                  >
                    <IconClock className="size-4 shrink-0" aria-hidden="true" />
                    Waiting for approval ({requestedParticipants.length})
                    <IconChevronDown
                      className={cn(
                        'ml-auto size-4 shrink-0 text-text-muted transition-transform',
                        !isApprovalCollapsed && 'rotate-180',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  {isRequestedParticipantsLoading && (
                    <p className="text-2xs text-text-muted">Loading…</p>
                  )}
                  {isRequestedParticipantsError && (
                    <p role="alert" className="text-2xs text-text-danger">
                      Couldn't load requests.
                    </p>
                  )}
                  {!isApprovalCollapsed && !isRequestedParticipantsLoading && !isRequestedParticipantsError && (
                    <div className="border-amber-800/30 bg-amber-50 divide-amber-800/20 flex flex-col gap-2.5 divide-y rounded-xl border-hairline p-2.5">
                      {requestedParticipants.map((participant) => (
                        <div key={participant.id} className="flex flex-col gap-1.5 pt-2.5 first:pt-0">
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
                            <div className="border-hairline flex flex-col gap-2 rounded-lg border-border bg-surface-2 p-2.5">
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

              <div className="flex items-center gap-2 self-end">
                <span className="text-2xs text-text-muted">Created by {session.createdByFullName}</span>
                {!isCommentsForbidden && (
                  <button
                    type="button"
                    aria-pressed={session.isLikedByCurrentUser}
                    aria-label={session.isLikedByCurrentUser ? 'Unlike' : 'Like'}
                    onClick={onToggleLike}
                    disabled={isTogglingLike}
                    className={cn(
                      'flex w-fit cursor-pointer items-center gap-1 rounded p-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default',
                      session.isLikedByCurrentUser ? 'text-text-danger' : 'text-text-secondary',
                    )}
                  >
                    {session.isLikedByCurrentUser ? (
                      <IconHeartFilled className="size-4" aria-hidden="true" />
                    ) : (
                      <IconHeart className="size-4" aria-hidden="true" />
                    )}
                    {session.likeCount}
                  </button>
                )}
              </div>

              <SessionCommentSection
                currentUserId={currentUserId}
                comments={comments}
                isLoading={isCommentsLoading}
                isError={isCommentsError}
                isForbidden={isCommentsForbidden}
                hasMore={hasMoreComments}
                isFetchingMore={isFetchingMoreComments}
                onFetchMore={onFetchMoreComments}
                onAddReply={onAddCommentReply}
                isPosting={isPostingComment}
                onDeleteComment={onDeleteComment}
                onToggleCommentLike={onToggleCommentLike}
              />
            </>
          )}
        </div>

        {session !== undefined && (
          <div className="border-hairline-t flex flex-col gap-2.5 border-border px-4 py-3">
            {!isCommentsForbidden && (
              <SessionCommentComposer
                currentUser={currentUser}
                onAddComment={onAddComment}
                isPosting={isPostingComment}
              />
            )}

            {isJoinError && (
              <p role="alert" className="text-2sm text-text-danger">
                Couldn't complete that action. Try again.
              </p>
            )}
            {isLeaveError && (
              <p role="alert" className="text-2sm text-text-danger">
                Couldn't complete that action. Try again.
              </p>
            )}

            {participationAction !== null && !isLeaveHiddenForCreator && (
              <div className="flex justify-center gap-2">
                {participationAction.kind === 'ACCEPT' && (
                  <Button variant="outline" disabled={isJoining || isLeaving} onClick={onLeave}>
                    <ActionButtonContent
                      Icon={IconX}
                      isPending={isLeaving}
                      pendingLabel="Declining…"
                      idleLabel="Decline"
                    />
                  </Button>
                )}
                <Button
                  variant={isAcceptOrJoin ? 'primary' : 'outline'}
                  disabled={isJoining || isLeaving}
                  onClick={isAcceptOrJoin ? onJoin : onLeave}
                >
                  <ActionButtonContent
                    Icon={PARTICIPATION_ACTION_ICON[participationAction.kind]}
                    isPending={isAcceptOrJoin ? isJoining : isLeaving}
                    pendingLabel={PARTICIPATION_PENDING_LABEL[participationAction.kind]}
                    idleLabel={participationAction.label}
                  />
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
