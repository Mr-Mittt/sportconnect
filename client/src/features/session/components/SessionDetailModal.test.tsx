import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment } from '@/features/feed/types';
import type { Location } from '@/shared/types/location';
import type { Session, SessionParticipant } from '@/shared/types/session';
import { SessionDetailModal } from './SessionDetailModal';

const location: Location = {
  id: 1,
  sportId: 6,
  sportName: 'Basketball',
  name: 'Riverside Courts',
  address: '12 River Rd',
  latitude: 21.0285,
  longitude: 105.8542,
  sourceMapsUrl: null,
  claimedByVendorId: null,
  createdBy: 'user-1',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
};

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 1,
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Sunday pickup run',
    description: 'Casual 5v5, all levels welcome.',
    location,
    locationNote: null,
    scheduledStart: '2026-08-01T19:00:00',
    scheduledEndAt: null,
    status: 'SCHEDULED',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 1,
    // 9999 = the backend's "uncapped" sentinel — keeps "Participants (1)" the default text below;
    // individual tests override it to exercise the "Participants (N/capacity)" display.
    capacity: 9999,
    feeType: 'FREE',
    feeAmountVnd: null,
    initialSlot: 0,
    autoApprove: false,
    likeCount: 0,
    isLikedByCurrentUser: false,
    callerParticipation: null,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    ...overrides,
  };
}

function makeCallerParticipation(status: SessionParticipant['status']): SessionParticipant {
  return {
    id: 99,
    sessionId: 1,
    userId: 'user-2',
    userFullName: '',
    userAvatarUrl: null,
    status,
    rejectReason: null,
    createdAt: '2026-07-01T10:00:00',
  };
}

const participants: SessionParticipant[] = [
  {
    id: 1,
    sessionId: 1,
    userId: 'user-1',
    userFullName: 'Jordan Lee',
    userAvatarUrl: null,
    status: 'JOINED',
    rejectReason: null,
    createdAt: '2026-07-01T10:00:00',
  },
];

const requestedParticipants: SessionParticipant[] = [
  {
    id: 2,
    sessionId: 1,
    userId: 'user-3',
    userFullName: 'Alex Chen',
    userAvatarUrl: null,
    status: 'REQUESTED',
    rejectReason: null,
    createdAt: '2026-07-02T10:00:00',
  },
];

const baseProps = {
  isOpen: true,
  onClose: () => {},
  session: makeSession(),
  isLoading: false,
  isError: false,
  participants,
  isParticipantsLoading: false,
  isParticipantsError: false,
  currentUserId: 'user-2',
  canManage: false,
  onJoin: () => {},
  isJoining: false,
  isJoinError: false,
  onLeave: () => {},
  isLeaving: false,
  isLeaveError: false,
  onConfirmCancel: () => {},
  isCancelling: false,
  isCancelError: false,
  requestedParticipants: [] as SessionParticipant[],
  isRequestedParticipantsLoading: false,
  isRequestedParticipantsError: false,
  onApproveParticipant: () => {},
  isApprovingParticipant: false,
  onRejectParticipant: () => {},
  isRejectingParticipant: false,
  onToggleLike: () => {},
  isTogglingLike: false,
  currentUser: { fullName: 'Jordan Lee', avatarUrl: null },
  comments: [] as Comment[],
  isCommentsLoading: false,
  isCommentsError: false,
  isCommentsForbidden: false,
  hasMoreComments: false,
  isFetchingMoreComments: false,
  onFetchMoreComments: () => {},
  onAddComment: () => {},
  onAddCommentReply: () => {},
  isPostingComment: false,
  onDeleteComment: () => {},
  onToggleCommentLike: () => {},
};

describe('SessionDetailModal', () => {
  it('shows a loading message while the session is loading', () => {
    render(<SessionDetailModal {...baseProps} session={undefined} isLoading participants={[]} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error message on load failure', () => {
    render(<SessionDetailModal {...baseProps} session={undefined} isError participants={[]} />);
    expect(screen.getByText("Couldn't load this session.")).toBeInTheDocument();
  });

  it('renders status, location, description, and creator', () => {
    render(<SessionDetailModal {...baseProps} />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Riverside Courts')).toBeInTheDocument();
    expect(screen.getByText('12 River Rd')).toBeInTheDocument();
    expect(screen.getByText('Casual 5v5, all levels welcome.')).toBeInTheDocument();
    expect(screen.getByText('Created by Jordan Lee')).toBeInTheDocument();
  });

  it('shows a Get Directions link with the right href when coordinates exist', () => {
    render(<SessionDetailModal {...baseProps} />);
    expect(screen.getByRole('link', { name: /Get Directions/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=21.0285,105.8542',
    );
  });

  it('omits Get Directions when the location has no coordinates', () => {
    render(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ location: { ...location, latitude: null, longitude: null } })}
      />,
    );
    expect(screen.queryByRole('link', { name: /Get Directions/ })).not.toBeInTheDocument();
  });

  it('renders the participants list', () => {
    render(<SessionDetailModal {...baseProps} />);
    expect(screen.getByText('Participants (1)')).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
  });

  it('shows "Participants (N/capacity)" once a real capacity was chosen', () => {
    render(<SessionDetailModal {...baseProps} session={makeSession({ capacity: 10 })} />);
    expect(screen.getByText('Participants (1/10)')).toBeInTheDocument();
  });

  it('shows the fee — Free, Split cost, or a formatted VND amount', () => {
    const { rerender } = render(<SessionDetailModal {...baseProps} />);
    expect(screen.getByText('Free')).toBeInTheDocument();

    rerender(<SessionDetailModal {...baseProps} session={makeSession({ feeType: 'SPLIT' })} />);
    expect(screen.getByText('Split cost')).toBeInTheDocument();

    rerender(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ feeType: 'FIXED', feeAmountVnd: 50000 })}
      />,
    );
    expect(screen.getByText('50 000 ₫')).toBeInTheDocument();
  });

  it('shows only Join when the caller has no participation row', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(<SessionDetailModal {...baseProps} onJoin={onJoin} />);
    const joinButton = screen.getByRole('button', { name: 'Join' });
    await user.click(joinButton);
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('shows only Join when the caller previously LEFT', () => {
    render(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ callerParticipation: makeCallerParticipation('LEFT') })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
  });

  it('shows only Leave when the caller is JOINED', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ callerParticipation: makeCallerParticipation('JOINED') })}
        onLeave={onLeave}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
  });

  it('shows Accept and Decline when the caller is INVITED — Accept calls onJoin, Decline calls onLeave', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    const onLeave = vi.fn();
    render(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ callerParticipation: makeCallerParticipation('INVITED') })}
        onJoin={onJoin}
        onLeave={onLeave}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('shows only Cancel when the caller is REQUESTED — calls onLeave', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ callerParticipation: makeCallerParticipation('REQUESTED') })}
        onLeave={onLeave}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('hides the participation action for a COMPLETED or CANCELLED session regardless of caller status', () => {
    const { rerender } = render(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ status: 'COMPLETED', callerParticipation: makeCallerParticipation('JOINED') })}
      />,
    );
    expect(screen.queryByRole('button', { name: /Join|Leave|Accept|Decline|Cancel/ })).not.toBeInTheDocument();

    rerender(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ status: 'CANCELLED', callerParticipation: makeCallerParticipation('JOINED') })}
      />,
    );
    expect(screen.queryByRole('button', { name: /Join|Leave|Accept|Decline|Cancel/ })).not.toBeInTheDocument();
  });

  it('shows the cancelled info block with reason', () => {
    render(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({
          status: 'CANCELLED',
          cancelledByFullName: 'Jordan Lee',
          cancelledAt: '2026-07-15T09:00:00',
          cancelReason: 'Court unavailable.',
        })}
      />,
    );
    expect(screen.getByText(/Cancelled by Jordan Lee/)).toBeInTheDocument();
    expect(screen.getByText('Reason: Court unavailable.')).toBeInTheDocument();
  });

  it('hides the Cancel session button when canManage is false', () => {
    render(<SessionDetailModal {...baseProps} canManage={false} />);
    expect(screen.queryByRole('button', { name: 'Cancel session' })).not.toBeInTheDocument();
  });

  it('cancel flow: reveals a reason field, confirms with the trimmed reason, or dismisses', async () => {
    const user = userEvent.setup();
    const onConfirmCancel = vi.fn();
    render(<SessionDetailModal {...baseProps} canManage onConfirmCancel={onConfirmCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel session' }));
    expect(screen.queryByRole('button', { name: 'Cancel session' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Cancellation reason'), '  Rained out  ');
    await user.click(screen.getByRole('button', { name: 'Confirm cancel' }));
    expect(onConfirmCancel).toHaveBeenCalledWith('Rained out');
  });

  it('cancel flow: "Never mind" dismisses the reason field without calling onConfirmCancel', async () => {
    const user = userEvent.setup();
    const onConfirmCancel = vi.fn();
    render(<SessionDetailModal {...baseProps} canManage onConfirmCancel={onConfirmCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel session' }));
    await user.click(screen.getByRole('button', { name: 'Never mind' }));
    expect(onConfirmCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel session' })).toBeInTheDocument();
  });

  it('falls back to "{sportName} session" for a null title', () => {
    render(<SessionDetailModal {...baseProps} session={makeSession({ title: null })} />);
    expect(screen.getByText('Basketball session')).toBeInTheDocument();
  });

  it('hides "Waiting for approval" when there are no requested participants', () => {
    render(<SessionDetailModal {...baseProps} canManage requestedParticipants={[]} />);
    expect(screen.queryByText(/Waiting for approval/)).not.toBeInTheDocument();
  });

  it('shows "Waiting for approval" with Approve/Reject once there is a requested participant', () => {
    render(
      <SessionDetailModal {...baseProps} canManage requestedParticipants={requestedParticipants} />,
    );
    expect(screen.getByText('Waiting for approval (1)')).toBeInTheDocument();
    expect(screen.getByText('Alex Chen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('Approve calls onApproveParticipant with the userId', async () => {
    const user = userEvent.setup();
    const onApproveParticipant = vi.fn();
    render(
      <SessionDetailModal
        {...baseProps}
        canManage
        requestedParticipants={requestedParticipants}
        onApproveParticipant={onApproveParticipant}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApproveParticipant).toHaveBeenCalledWith('user-3');
  });

  it('Reject reveals an inline optional-reason box; Confirm reject calls onRejectParticipant, Never mind dismisses it', async () => {
    const user = userEvent.setup();
    const onRejectParticipant = vi.fn();
    render(
      <SessionDetailModal
        {...baseProps}
        canManage
        requestedParticipants={requestedParticipants}
        onRejectParticipant={onRejectParticipant}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    const reasonInput = screen.getByLabelText('Reject reason for Alex Chen');
    await user.type(reasonInput, '  Not a group member  ');
    await user.click(screen.getByRole('button', { name: 'Confirm reject' }));
    expect(onRejectParticipant).toHaveBeenCalledWith('user-3', 'Not a group member');

    // reopen and dismiss without confirming
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: 'Never mind' }));
    expect(screen.queryByLabelText('Reject reason for Alex Chen')).not.toBeInTheDocument();
    expect(onRejectParticipant).toHaveBeenCalledTimes(1);
  });

  it('renders the Discussion section, including comments and the composer', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    const comment: Comment = {
      id: 1,
      postId: 1,
      userId: 'user-1',
      userFullName: 'Priya Shah',
      userAvatarUrl: null,
      content: 'What time are we meeting?',
      parentCommentId: null,
      likeCount: 0,
      replyCount: 0,
      isLikedByCurrentUser: false,
      replies: [],
      createdAt: '2026-07-03T10:00:00',
      updatedAt: '2026-07-03T10:00:00',
    };
    render(<SessionDetailModal {...baseProps} comments={[comment]} onAddComment={onAddComment} />);
    expect(screen.getByRole('region', { name: 'Discussion' })).toBeInTheDocument();
    expect(screen.getByText('What time are we meeting?')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'Nice one!');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(onAddComment).toHaveBeenCalledWith('Nice one!');
  });

  it('hides the Discussion section entirely when isCommentsForbidden', () => {
    render(<SessionDetailModal {...baseProps} isCommentsForbidden />);
    expect(screen.queryByRole('region', { name: 'Discussion' })).not.toBeInTheDocument();
  });

  it('renders a heart button reflecting like state and calling onToggleLike on click', async () => {
    const user = userEvent.setup();
    const onToggleLike = vi.fn();
    const { rerender } = render(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ likeCount: 2, isLikedByCurrentUser: false })}
        onToggleLike={onToggleLike}
      />,
    );

    const likeButton = screen.getByRole('button', { name: 'Like' });
    expect(likeButton).toHaveTextContent('2');
    await user.click(likeButton);
    expect(onToggleLike).toHaveBeenCalledTimes(1);

    // Controlled: rendering follows props, same convention as PostCard/CommentSection.
    rerender(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ likeCount: 3, isLikedByCurrentUser: true })}
        onToggleLike={onToggleLike}
      />,
    );
    const unlikeButton = screen.getByRole('button', { name: 'Unlike' });
    expect(unlikeButton).toHaveAttribute('aria-pressed', 'true');
    expect(unlikeButton).toHaveTextContent('3');
  });

  it('disables the heart button while isTogglingLike', () => {
    render(<SessionDetailModal {...baseProps} isTogglingLike />);
    expect(screen.getByRole('button', { name: 'Like' })).toBeDisabled();
  });
});
