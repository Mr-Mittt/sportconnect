import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { addDays, format } from 'date-fns';
import { describe, expect, it, vi } from 'vitest';
import type { Comment } from '@/features/feed/types';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { Session, SessionParticipant } from '@/shared/types/session';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { SessionDetailModal } from './SessionDetailModal';

// Inert stub — this modal's tests only need it to render without crashing on a `PREPARING`
// fixture; `SessionPreparingCompletion.test.tsx` covers the real LocationPicker interaction.
const inertLocationPicker: LocationPickerProps = {
  isOpen: false,
  onClose: () => {},
  mode: 'search',
  onSwitchToCreate: () => {},
  onSwitchToSearch: () => {},
  inputValue: '',
  onInputChange: () => {},
  onSearch: () => {},
  results: [],
  isSearching: false,
  isSearchError: false,
  onSelectResult: () => {},
  favoriteLocationIds: new Set(),
  onToggleFavorite: () => {},
  isTogglingFavorite: false,
  onOpenGoogleMaps: () => {},
  mapsUrlInput: '',
  onMapsUrlChange: () => {},
  onResolveUrl: () => {},
  isResolving: false,
  isResolveError: false,
  resolvedNoCoordinates: false,
  coordinates: null,
  mapSeed: 0,
  onMovePin: () => {},
  name: '',
  onNameChange: () => {},
  address: '',
  onAddressChange: () => {},
  canSave: false,
  onSave: () => {},
  isSaving: false,
  isSaveError: false,
};

// src/test/setup.ts globally seeds sportCatalogStore with { id: 6, key: 'basketball', ... } —
// same pre-SPORT-3 fixture convention this file's sportId: 6 already relies on.
const sportsByKey: Record<SportKey, SportProfile> = {
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
};

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

/** CLIENT-GL-51: a start this far from now, for the countdown and the leave cutoff (the clock is real). */
const startIn = (ms: number) => new Date(Date.now() + ms).toISOString();
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

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
    maleSlots: null,
    femaleSlots: null,
    gameMood: 5,
    feeNote: null,
    autoApprove: false,
    isPublic: true,
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
  sportsByKey,
  isLoading: false,
  isError: false,
  participants,
  isParticipantsLoading: false,
  isParticipantsError: false,
  currentUserId: 'user-2',
  canManage: false,
  selectedCompletionLocation: null,
  onOpenCompletionLocationPicker: () => {},
  completionLocationPicker: inertLocationPicker,
  completionFavorites: { locations: [], isLoading: false, onSelect: () => {} },
  onClearCompletionLocation: () => {},
  refChoiceSource: null,
  onUpdateSession: () => {},
  isUpdatingSession: false,
  isUpdateSessionError: false,
  isScheduleConfirmOpen: false,
  onScheduleConfirmOpenChange: () => {},
  onSchedule: () => {},
  isScheduling: false,
  isScheduleError: false,
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
  it('puts the caret in the comment box when it opens, not on the first button (owner, 2026-11-16)', async () => {
    render(<SessionDetailModal {...baseProps} />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Add a comment' })).toHaveFocus());
  });

  it('opens with the usual focus when the discussion is hidden from the caller (no comment box)', async () => {
    render(<SessionDetailModal {...baseProps} isCommentsForbidden />);
    expect(screen.queryByRole('textbox', { name: 'Add a comment' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows a loading message while the session is loading', () => {
    render(<SessionDetailModal {...baseProps} session={undefined} isLoading participants={[]} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error message on load failure', () => {
    render(<SessionDetailModal {...baseProps} session={undefined} isError participants={[]} />);
    expect(screen.getByText("Couldn't load this session.")).toBeInTheDocument();
  });

  it.each([
    [404, 'SESSION_NOT_FOUND', 'No longer available'],
    [403, 'SESSION_FORBIDDEN', 'No access'],
  ])('a %i (%s) detail load shows the "%s" state with a Close button that closes the modal', async (status, code, title) => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
    error.response = { status, data: { success: false, message: 'prose', errorCode: code } } as AxiosResponse;
    render(
      <SessionDetailModal {...baseProps} onClose={onClose} session={undefined} isError loadError={error} participants={[]} />,
    );
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load this session.")).not.toBeInTheDocument();
    // The state's own action (the dialog header also has an icon Close, so take the one in the body).
    const buttons = screen.getAllByRole('button', { name: 'Close' });
    await user.click(buttons[buttons.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  it('a 500 detail load keeps the generic line', () => {
    const error = new AxiosError('failed', 'ERR_BAD_RESPONSE');
    error.response = { status: 500, data: { success: false, message: 'boom' } } as AxiosResponse;
    render(<SessionDetailModal {...baseProps} session={undefined} isError loadError={error} participants={[]} />);
    expect(screen.getByText("Couldn't load this session.")).toBeInTheDocument();
  });

  it('renders status, location and creator (the description is no longer shown, CLIENT-SESSION-34)', () => {
    render(<SessionDetailModal {...baseProps} />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    // CLIENT-SESSION-10: header status row always shows weekday + date + time (design reference),
    // distinct from formatStartTime's relative "Today"/"Tomorrow" shorthand used elsewhere.
    expect(screen.getByText(/Sat, Aug 1 · 19:00/)).toBeInTheDocument();
    // Collapsed Where summary: "Location: Riverside Courts".
    expect(screen.getByText('Riverside Courts')).toBeInTheDocument();
    expect(screen.queryByText('Casual 5v5, all levels welcome.')).not.toBeInTheDocument();
    // The creator line is just the creator; the approval mode is next to the Join button (see below).
    expect(screen.getByText('Created by Jordan Lee')).toBeInTheDocument();
  });

  it('shows how a join is decided next to the Join button, for someone who can join', () => {
    const { rerender } = render(<SessionDetailModal {...baseProps} session={makeSession({ autoApprove: true })} />);
    expect(screen.getByText('Auto approval')).toBeInTheDocument();
    expect(screen.queryByText(/Need host approval/)).not.toBeInTheDocument();
    rerender(<SessionDetailModal {...baseProps} session={makeSession({ autoApprove: false })} />);
    expect(screen.getByText('Need host approval')).toBeInTheDocument();
    expect(screen.queryByText('Auto approval')).not.toBeInTheDocument();
  });

  it('keeps the approval hint off the creator line', () => {
    render(<SessionDetailModal {...baseProps} session={makeSession({ autoApprove: true })} />);
    expect(screen.queryByText(/Auto approval\. Created by/)).not.toBeInTheDocument();
    expect(screen.queryByText(/approval\. Created by/)).not.toBeInTheDocument();
  });

  it.each(['JOINED', 'REQUESTED', 'INVITED'] as const)('shows no approval hint to someone who is %s: they cannot join', (status) => {
    render(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ autoApprove: true, callerParticipation: makeCallerParticipation(status) })}
      />,
    );
    expect(screen.queryByText('Auto approval')).not.toBeInTheDocument();
    expect(screen.queryByText('Need host approval')).not.toBeInTheDocument();
  });


  it('shows the end time in the header when the session has one (same day)', () => {
    render(<SessionDetailModal {...baseProps} session={makeSession({ scheduledEndAt: '2026-08-01T21:00:00' })} />);
    expect(screen.getByText(/Sat, Aug 1 · 19:00 – 21:00/)).toBeInTheDocument();
  });

  it('shows the end date too when the session runs past midnight', () => {
    render(<SessionDetailModal {...baseProps} session={makeSession({ scheduledEndAt: '2026-08-02T01:00:00' })} />);
    expect(screen.getByText(/Sat, Aug 1 · 19:00 – Sun, Aug 2 · 01:00/)).toBeInTheDocument();
  });

  async function openWhere() {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Where' }));
  }

  // Sections only expand for the host of a PREPARING session (everyone else gets static summaries).
  const hostPreparing = makeSession({ status: 'PREPARING' });

  it('shows the address and a Get Directions link with the right href once Where is expanded (host, Preparing)', async () => {
    render(<SessionDetailModal {...baseProps} canManage session={hostPreparing} />);
    await openWhere();
    expect(screen.getByText('12 River Rd')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get Directions/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=21.0285,105.8542',
    );
  });

  it('omits Get Directions when the location has no coordinates', async () => {
    render(
      <SessionDetailModal
        {...baseProps}
        canManage
        session={makeSession({ status: 'PREPARING', location: { ...location, latitude: null, longitude: null } })}
      />,
    );
    await openWhere();
    expect(screen.queryByRole('link', { name: /Get Directions/ })).not.toBeInTheDocument();
  });

  it('renders the participants list (read-only mode: Players is collapsed until opened)', () => {
    render(<SessionDetailModal {...baseProps} />);
    expect(screen.getByText('Players (1)')).toBeInTheDocument();
    expect(screen.queryByText('Jordan Lee')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Players \(1\)/ }));
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
  });

  it('shows "Players (N/capacity)" once a real capacity was chosen', () => {
    render(<SessionDetailModal {...baseProps} session={makeSession({ capacity: 10 })} />);
    expect(screen.getByText('Players (1/10)')).toBeInTheDocument();
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
        session={makeSession({ scheduledStart: startIn(DAY_MS), callerParticipation: makeCallerParticipation('JOINED') })}
        onLeave={onLeave}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    // CLIENT-GL-51: the click asks first; the question's own Leave sends it.
    expect(onLeave).not.toHaveBeenCalled();
    await user.click(within(await screen.findByRole('dialog', { name: 'Are you leaving?' })).getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
  });

  it('hides Leave for the session creator, even when JOINED', () => {
    render(
      <SessionDetailModal
        {...baseProps}
        currentUserId="user-1" // matches makeSession()'s default createdBy
        session={makeSession({ callerParticipation: makeCallerParticipation('JOINED') })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
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
    // CLIENT-SESSION-30: says why the only action is Cancel.
    expect(screen.getByText('Waiting for host approval.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    // CLIENT-GL-51: asks first.
    await user.click(within(await screen.findByRole('dialog', { name: 'Cancel your request?' })).getByRole('button', { name: 'Cancel' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('shows the "Waiting for host approval." hint only for a REQUESTED caller', () => {
    const { rerender } = render(<SessionDetailModal {...baseProps} />);
    expect(screen.queryByText('Waiting for host approval.')).not.toBeInTheDocument();
    rerender(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ callerParticipation: makeCallerParticipation('JOINED') })}
      />,
    );
    expect(screen.queryByText('Waiting for host approval.')).not.toBeInTheDocument();
    rerender(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ callerParticipation: makeCallerParticipation('INVITED') })}
      />,
    );
    expect(screen.queryByText('Waiting for host approval.')).not.toBeInTheDocument();
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
          cancelledBy: 'user-1',
          cancelledByFullName: 'Jordan Lee',
          cancelledAt: '2026-07-15T09:00:00',
          cancelReason: 'Court unavailable.',
        })}
      />,
    );
    expect(screen.getByText(/Cancelled by Jordan Lee/)).toBeInTheDocument();
    expect(screen.getByText('Reason: Court unavailable.')).toBeInTheDocument();
  });

  // CLIENT-SESSION-37: the system's cancel has no canceller.
  it('an auto-cancelled session reads "Auto-cancelled on <time>", with client copy for the reason, never "unknown"', () => {
    render(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({
          status: 'CANCELLED',
          cancelledBy: null,
          cancelledByFullName: null,
          cancelledAt: '2026-07-15T09:00:00',
          cancelReason: 'Auto-cancelled — session setup was not completed before it started.',
        })}
      />,
    );
    expect(screen.getByText(/^Auto-cancelled on /)).toBeInTheDocument();
    expect(screen.queryByText(/Cancelled by/)).not.toBeInTheDocument();
    expect(screen.queryByText(/unknown/)).not.toBeInTheDocument();
    expect(screen.getByText('Reason: the session setup was not completed in time.')).toBeInTheDocument();
    expect(screen.queryByText(/Auto-cancelled — session setup/)).not.toBeInTheDocument();
  });

  it('the session status is drawn in upper case (CSS, the text itself is unchanged)', () => {
    render(<SessionDetailModal {...baseProps} />);
    expect(screen.getByText('Scheduled')).toHaveClass('uppercase');
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
      commentType: 'USER',
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
    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(onAddComment).toHaveBeenCalledWith('Nice one!');
  });

  describe('closing over an unsent comment or reply (owner, 2026-11-16)', () => {
    const comment: Comment = {
      id: 1,
      postId: 1,
      commentType: 'USER',
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

    it('closes at once when nothing is typed', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<SessionDetailModal {...baseProps} onClose={onClose} />);
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Leave without posting?')).not.toBeInTheDocument();
    });

    it('asks first when a comment is typed; Keep editing stays, Leave closes', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<SessionDetailModal {...baseProps} onClose={onClose} />);
      await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'half');

      await user.keyboard('{Escape}');
      expect(await screen.findByText('Leave without posting?')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Keep editing' }));
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Add a comment' })).toHaveTextContent('half');

      await user.keyboard('{Escape}');
      await user.click(await screen.findByRole('button', { name: 'Leave' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('asks first when a reply is typed', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<SessionDetailModal {...baseProps} comments={[comment]} onClose={onClose} />);
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      await user.type(screen.getByRole('textbox', { name: /reply/i }), 'half');

      await user.keyboard('{Escape}');
      expect(await screen.findByText('Leave without posting?')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('a draft left behind by Leave does not make the next opening ask', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const { rerender } = render(<SessionDetailModal {...baseProps} onClose={onClose} />);
      await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'half');
      await user.keyboard('{Escape}');
      await user.click(await screen.findByRole('button', { name: 'Leave' }));
      expect(onClose).toHaveBeenCalledTimes(1);

      rerender(<SessionDetailModal {...baseProps} onClose={onClose} isOpen={false} />);
      rerender(<SessionDetailModal {...baseProps} onClose={onClose} />);
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Leave without posting?')).not.toBeInTheDocument();
    });

    it('"Keep editing" puts the caret on the unsent text: the first of them when there are several', async () => {
      const user = userEvent.setup();
      render(<SessionDetailModal {...baseProps} comments={[comment]} />);
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      await user.type(screen.getByRole('textbox', { name: /reply/i }), 'reply half');

      await user.keyboard('{Escape}');
      await user.click(await screen.findByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(screen.getByRole('textbox', { name: /reply/i })).toHaveFocus());

      await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'comment half');
      await user.keyboard('{Escape}');
      await user.click(await screen.findByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Add a comment' })).toHaveFocus());
    });

    it('does not ask after the comment was sent', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<SessionDetailModal {...baseProps} onClose={onClose} />);
      await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'Nice one!');
      await user.click(screen.getByRole('button', { name: 'Post comment' }));
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
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

  it('shows the sport chip (icon only, named for a11y) when sportsByKey resolves the session\'s sport, hides it otherwise', () => {
    const { rerender } = render(<SessionDetailModal {...baseProps} />);
    expect(screen.getByRole('img', { name: 'Basketball' })).toBeInTheDocument();

    rerender(<SessionDetailModal {...baseProps} sportsByKey={{}} />);
    expect(screen.queryByRole('img', { name: 'Basketball' })).not.toBeInTheDocument();
  });

  it('Players section (host edit mode): collapsing swaps the roster chips for a decorative avatar-stack preview, capacity meter always shows', () => {
    render(<SessionDetailModal {...baseProps} canManage session={makeSession({ capacity: 10, status: 'PREPARING' })} />);
    const toggle = screen.getByText('Players (1/10)');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Jordan Lee')).not.toBeInTheDocument();
    // Still visible: the toggle's own label and the capacity meter (queried via the track's class,
    // since it has no accessible text of its own).
    expect(screen.getByText('Players (1/10)')).toBeInTheDocument();
  });

  it('shows a spinner + pending label on the participation action button while its mutation is in flight', () => {
    render(<SessionDetailModal {...baseProps} isJoining />);
    expect(screen.getByRole('button', { name: 'Joining…' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
  });

  // CLIENT-SESSION-16: read-only session attribute summary.
  const attributeSchema = {
    groups: [
      {
        key: 'match',
        label: 'Match details',
        isAvailable: true,
        attributes: [{ key: 'format', label: 'Format', type: 'STRING' as const, isAvailable: true }],
      },
    ],
  };

  it('shows the session attributes as a collapsed "field: value" row, and in full once expanded (host, Preparing)', async () => {
    const user = userEvent.setup();
    render(
      <SessionDetailModal
        {...baseProps}
        canManage
        session={makeSession({ status: 'PREPARING', attributes: { 'match/format': 'Doubles' } })}
        sessionAttributeSchema={attributeSchema}
      />,
    );
    expect(screen.getByText('Format:').parentElement).toHaveTextContent('Format: Doubles');
    await user.click(screen.getByRole('button', { name: 'Session detail' }));
    const section = screen.getByRole('region', { name: 'Session detail' });
    expect(within(section).getByText('Doubles')).toBeInTheDocument();
    // Not in edit mode — no field controls inside it.
    expect(within(section).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows "..." for an attribute with no stored value', () => {
    render(<SessionDetailModal {...baseProps} sessionAttributeSchema={attributeSchema} />);
    expect(within(screen.getByText('Format:').parentElement as HTMLElement).getByText('...')).toBeInTheDocument();
  });

  it('omits the Session detail section when the sport has no session schema', () => {
    render(
      <SessionDetailModal
        {...baseProps}
        session={makeSession({ attributes: { 'match/format': 'Doubles' } })}
        sessionAttributeSchema={null}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Session detail' })).not.toBeInTheDocument();
  });

  it('the host can edit the session attributes while PREPARING (replace-wholesale payload)', async () => {
    const user = userEvent.setup();
    const onUpdateSession = vi.fn();
    render(
      <SessionDetailModal
        {...baseProps}
        canManage
        session={makeSession({ status: 'PREPARING', attributes: { 'match/format': 'Doubles' } })}
        sessionAttributeSchema={attributeSchema}
        onUpdateSession={onUpdateSession}
      />,
    );
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[5]);
    const field = screen.getByLabelText('Format');
    await user.clear(field);
    await user.type(field, 'Singles');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdateSession).toHaveBeenCalledWith({ attributes: { 'match/format': 'Singles' } }, expect.any(Function));
  });

  describe('CLIENT-SESSION-34: PREPARING banner, sections, per-section edit and scheduling', () => {
    const preparing = makeSession({
      status: 'PREPARING',
      location: null,
      feeType: null,
      scheduledEndAt: null,
      capacity: 10,
      initialSlot: 0,
    });
    const ready = makeSession({
      status: 'PREPARING',
      scheduledEndAt: '2026-08-01T20:30:00',
      capacity: 10,
      initialSlot: 0,
    });

    it('shows the amber PREPARING banner to a viewer, not to the host (who sees only what is missing)', () => {
      const { rerender } = render(<SessionDetailModal {...baseProps} canManage={false} session={preparing} />);
      expect(screen.getByText('The host is still preparing this session.')).toBeInTheDocument();
      expect(screen.getByText(/It is cancelled automatically if it is not scheduled/)).toBeInTheDocument();
      rerender(<SessionDetailModal {...baseProps} canManage session={preparing} />);
      expect(screen.queryByText('The host is still preparing this session.')).not.toBeInTheDocument();
      expect(screen.queryByText(/It is cancelled automatically if it is not scheduled/)).not.toBeInTheDocument();
      expect(screen.getByText('Still missing:')).toBeInTheDocument();
    });

    it('the host of a PREPARING session with nothing missing sees no banner at all', () => {
      render(
        <SessionDetailModal
          {...baseProps}
          canManage
          session={makeSession({
            status: 'PREPARING',
            scheduledEndAt: '2026-08-01T20:30:00',
            feeType: 'FREE',
          })}
        />,
      );
      expect(screen.queryByText('Still missing:')).not.toBeInTheDocument();
      expect(screen.queryByText('The host is still preparing this session.')).not.toBeInTheDocument();
    });

    it('shows no banner on a SCHEDULED session', () => {
      render(<SessionDetailModal {...baseProps} canManage session={makeSession({ status: 'SCHEDULED' })} />);
      expect(screen.queryByText('The host is still preparing this session.')).not.toBeInTheDocument();
    });

    it('lists what is still missing for the host only', () => {
      const { rerender } = render(<SessionDetailModal {...baseProps} canManage session={preparing} />);
      expect(screen.getByText('Still missing:')).toBeInTheDocument();
      expect(screen.getByText(/location, fee, duration/)).toBeInTheDocument();
      rerender(<SessionDetailModal {...baseProps} canManage={false} session={preparing} />);
      expect(screen.queryByText('Still missing:')).not.toBeInTheDocument();
    });

    it('puts the "Missing: ..." chips on the section that owns the gap', () => {
      render(<SessionDetailModal {...baseProps} canManage session={preparing} />);
      expect(screen.getByText('Missing: duration')).toBeInTheDocument();
      expect(screen.getByText('Missing: location')).toBeInTheDocument();
      expect(screen.getByText('Missing: fee')).toBeInTheDocument();
    });

    it('collapsed sections read "field: value", with "..." for a missing value', () => {
      render(<SessionDetailModal {...baseProps} session={preparing} />);
      const where = screen.getByText('Location:').parentElement as HTMLElement;
      expect(within(where).getByText('...')).toBeInTheDocument();
      const fee = screen.getByText('Fee:').parentElement as HTMLElement;
      expect(within(fee).getByText('...')).toBeInTheDocument();
      expect(screen.getByText('Title:').parentElement).toHaveTextContent('Title: Sunday pickup run');
    });

    it('shows the open slot as "6 (anyone)" or with the gender split', () => {
      const { rerender } = render(<SessionDetailModal {...baseProps} session={makeSession({ capacity: 7, initialSlot: 0 })} />);
      expect(screen.getByText('Open:').parentElement).toHaveTextContent('Open: 6 (anyone)');
      rerender(
        <SessionDetailModal
          {...baseProps}
          session={makeSession({ capacity: 9, initialSlot: 0, maleSlots: 4, femaleSlots: 4 })}
        />,
      );
      expect(screen.getByText('Open:').parentElement).toHaveTextContent('Open: 8 (4 male - 4 female)');
    });

    it('shows the game mood with its level word', () => {
      render(<SessionDetailModal {...baseProps} session={makeSession({ gameMood: 9 })} />);
      expect(screen.getByText('Mood:').parentElement).toHaveTextContent('Mood: 9 · Competitive');
    });

    it('gives only the host of a PREPARING session Edit buttons', () => {
      const { rerender } = render(<SessionDetailModal {...baseProps} canManage session={preparing} />);
      expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(5);
      rerender(<SessionDetailModal {...baseProps} canManage={false} session={preparing} />);
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      rerender(<SessionDetailModal {...baseProps} canManage session={makeSession({ status: 'SCHEDULED' })} />);
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('Edit swaps itself for Discard and Save in the same header, and disables the other Edit buttons', async () => {
      const user = userEvent.setup();
      render(<SessionDetailModal {...baseProps} canManage session={preparing} />);
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[2]);
      expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      const remaining = screen.getAllByRole('button', { name: 'Edit' });
      expect(remaining).toHaveLength(4);
      remaining.forEach((button) => expect(button).toBeDisabled());
    });

    it('Where: Save stays disabled until a location is picked, then saves only the location', async () => {
      const user = userEvent.setup();
      const onUpdateSession = vi.fn();
      const { rerender } = render(
        <SessionDetailModal {...baseProps} canManage session={preparing} onUpdateSession={onUpdateSession} />,
      );
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[2]);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      rerender(
        <SessionDetailModal
          {...baseProps}
          canManage
          session={preparing}
          selectedCompletionLocation={location}
          onUpdateSession={onUpdateSession}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onUpdateSession).toHaveBeenCalledWith({ locationId: location.id }, expect.any(Function));
    });

    it('Discard leaves edit mode, drops the picked location and brings Edit back', async () => {
      const user = userEvent.setup();
      const onClearCompletionLocation = vi.fn();
      render(
        <SessionDetailModal
          {...baseProps}
          canManage
          session={preparing}
          onClearCompletionLocation={onClearCompletionLocation}
        />,
      );
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[2]);
      await user.click(screen.getByRole('button', { name: 'Discard' }));
      expect(onClearCompletionLocation).toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(5);
    });

    it('the onDone callback handed to onUpdateSession ends the edit', async () => {
      const user = userEvent.setup();
      const onUpdateSession = vi.fn((_payload: unknown, onDone: () => void) => onDone());
      render(
        <SessionDetailModal
          {...baseProps}
          canManage
          session={preparing}
          selectedCompletionLocation={location}
          onUpdateSession={onUpdateSession}
        />,
      );
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[2]);
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });

    it('Overview: the title is required, so clearing it shows the error and cannot be saved (SESSION-49)', async () => {
      const user = userEvent.setup();
      const onUpdateSession = vi.fn();
      render(<SessionDetailModal {...baseProps} canManage session={preparing} onUpdateSession={onUpdateSession} />);
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      await user.clear(screen.getByLabelText(/^Session title/));
      expect(screen.getByText('Give this session a title.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      await user.type(screen.getByLabelText(/^Session title/), '  Renamed  ');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onUpdateSession).toHaveBeenCalledWith({ title: 'Renamed' }, expect.any(Function));
    });

    describe('CLIENT-SESSION-50: the editors carry the same red asterisks and end-date rule as the create form', () => {
      it('When: Duration and Ends at are marked; the end date follows a changed start date while the duration is missing', async () => {
        const user = userEvent.setup();
        render(<SessionDetailModal {...baseProps} canManage session={preparing} />);
        await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
        expect(within(screen.getByText(/^Duration \(min\)/)).getByText('*')).toBeInTheDocument();
        expect(within(screen.getByText('Ends at', { selector: 'span' })).getByText('*')).toBeInTheDocument();

        const day = format(addDays(new Date(), 2), 'yyyy-MM-dd');
        await user.selectOptions(screen.getByLabelText('Date'), day);
        expect(screen.getByLabelText('Ends at: date')).toHaveValue(day);
        expect(screen.getByLabelText('Ends at: hour')).toHaveValue('');
      });

      it('Where: Location is marked', async () => {
        const user = userEvent.setup();
        render(<SessionDetailModal {...baseProps} canManage session={preparing} />);
        await user.click(screen.getAllByRole('button', { name: 'Edit' })[2]);
        expect(within(screen.getByText('Location', { selector: 'span' })).getByText('*')).toBeInTheDocument();
        expect(within(screen.getByText('Location note')).queryByText('*')).not.toBeInTheDocument();
      });

      it('Cost: Fee is marked', async () => {
        const user = userEvent.setup();
        render(<SessionDetailModal {...baseProps} canManage session={preparing} />);
        await user.click(screen.getAllByRole('button', { name: 'Edit' })[4]);
        expect(within(screen.getByText('Fee', { selector: 'span' })).getByText('*')).toBeInTheDocument();
        expect(within(screen.getByText('Fee note')).queryByText('*')).not.toBeInTheDocument();
      });
    });

    it('When: a new duration is saved as durationMinutes only', async () => {
      const user = userEvent.setup();
      const onUpdateSession = vi.fn();
      render(<SessionDetailModal {...baseProps} canManage session={preparing} onUpdateSession={onUpdateSession} />);
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
      await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onUpdateSession).toHaveBeenCalledWith({ durationMinutes: 90 }, expect.any(Function));
    });

    it('Cost: picking Free and a note saves feeType and feeNote, and a blank note saves "" to clear', async () => {
      const user = userEvent.setup();
      const onUpdateSession = vi.fn();
      render(<SessionDetailModal {...baseProps} canManage session={preparing} onUpdateSession={onUpdateSession} />);
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[4]);
      await user.click(screen.getByLabelText('Free'));
      await user.type(screen.getByLabelText('Fee note'), 'Cash');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onUpdateSession).toHaveBeenCalledWith({ feeType: 'FREE', feeNote: 'Cash' }, expect.any(Function));
    });

    it('Cost: a fixed fee needs its amount before Save is enabled', async () => {
      const user = userEvent.setup();
      render(<SessionDetailModal {...baseProps} canManage session={preparing} />);
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[4]);
      await user.type(screen.getByPlaceholderText('VND'), '5');
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
      await user.clear(screen.getByPlaceholderText('VND'));
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('Who: "By gender" with a male count saves the split, the mood and auto approve together', async () => {
      const user = userEvent.setup();
      const onUpdateSession = vi.fn();
      render(<SessionDetailModal {...baseProps} canManage session={preparing} onUpdateSession={onUpdateSession} />);
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[3]);
      expect(screen.getByLabelText('Taken slot')).toHaveValue(1);
      expect(screen.getByLabelText('Open slot')).toHaveValue(9);
      await user.click(screen.getByLabelText('By gender'));
      await user.click(screen.getByLabelText('Male slot'));
      await user.type(screen.getByLabelText('Male slots'), '3');
      fireEvent.change(screen.getByRole('slider', { name: 'Game mood' }), { target: { value: '8' } });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onUpdateSession).toHaveBeenCalledWith(
        { capacity: 10, initialSlot: 0, maleSlots: 3, femaleSlots: 0, gameMood: 8, autoApprove: false },
        expect.any(Function),
      );
    });

    it('Who: male + female over the open slots shows the error and blocks Save', async () => {
      const user = userEvent.setup();
      render(<SessionDetailModal {...baseProps} canManage session={preparing} />);
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[3]);
      await user.click(screen.getByLabelText('By gender'));
      await user.click(screen.getByLabelText('Male slot'));
      await user.click(screen.getByLabelText('Female slot'));
      await user.type(screen.getByLabelText('Male slots'), '8');
      await user.type(screen.getByLabelText('Female slots'), '2');
      expect(screen.getByText("Male and female slots can't be more than the open slots.")).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('Who: switching back to "Anyone" clears the split (saved as 0)', async () => {
      const user = userEvent.setup();
      const onUpdateSession = vi.fn();
      render(
        <SessionDetailModal
          {...baseProps}
          canManage
          session={{ ...preparing, maleSlots: 2, femaleSlots: 1 }}
          onUpdateSession={onUpdateSession}
        />,
      );
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[3]);
      await user.click(screen.getByLabelText('Anyone'));
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onUpdateSession).toHaveBeenCalledWith(
        expect.objectContaining({ maleSlots: 0, femaleSlots: 0 }),
        expect.any(Function),
      );
    });

    it('Who: ticking auto approve asks first, "Turn on" checks it and "Cancel" leaves it unchecked', async () => {
      const user = userEvent.setup();
      render(<SessionDetailModal {...baseProps} canManage session={preparing} />);
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[3]);
      const box = screen.getByRole('checkbox', { name: 'Auto approve join request' });
      await user.click(box);
      expect(box).not.toBeChecked();
      expect(screen.getByText('Turn on auto approve?')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(box).not.toBeChecked();
      await user.click(box);
      await user.click(screen.getByRole('button', { name: 'Turn on' }));
      expect(box).toBeChecked();
      await user.click(box);
      expect(box).not.toBeChecked();
      expect(screen.queryByText('Turn on auto approve?')).not.toBeInTheDocument();
    });

    describe('CLIENT-SESSION-52: public / private in the Who section', () => {
      const privateSession = makeSession({ ...preparing, isPublic: false });
      const groupSession = makeSession({ ...preparing, groupId: 5, sessionType: 'GROUP_RECURRING', isPublic: false });

      it('a public session shows the switch on; switching it off warns and saves isPublic: false', async () => {
        const user = userEvent.setup();
        const onUpdateSession = vi.fn();
        render(<SessionDetailModal {...baseProps} canManage session={preparing} onUpdateSession={onUpdateSession} />);
        await user.click(screen.getAllByRole('button', { name: 'Edit' })[3]);
        const toggle = screen.getByRole('switch', { name: 'Public session' });
        expect(toggle).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByText('Everyone can see and ask to join your session')).toBeInTheDocument();
        expect(screen.queryByText(/Only you and invited friends/)).not.toBeInTheDocument();

        await user.click(toggle);

        expect(toggle).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByText(/Only you and invited friends can see this session/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(onUpdateSession).toHaveBeenCalledWith(expect.objectContaining({ isPublic: false }), expect.any(Function));
      });

      it('a private session starts off with the warning; switching it on saves isPublic: true', async () => {
        const user = userEvent.setup();
        const onUpdateSession = vi.fn();
        render(<SessionDetailModal {...baseProps} canManage session={privateSession} onUpdateSession={onUpdateSession} />);
        await user.click(screen.getAllByRole('button', { name: 'Edit' })[3]);
        const toggle = screen.getByRole('switch', { name: 'Public session' });
        expect(toggle).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByText(/Only you and invited friends can see this session/)).toBeInTheDocument();

        await user.click(toggle);

        expect(screen.queryByText(/Only you and invited friends/)).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(onUpdateSession).toHaveBeenCalledWith(expect.objectContaining({ isPublic: true }), expect.any(Function));
      });

      it('a save that leaves the switch alone sends no isPublic', async () => {
        const user = userEvent.setup();
        const onUpdateSession = vi.fn();
        render(<SessionDetailModal {...baseProps} canManage session={privateSession} onUpdateSession={onUpdateSession} />);
        await user.click(screen.getAllByRole('button', { name: 'Edit' })[3]);
        fireEvent.change(screen.getByRole('slider', { name: 'Game mood' }), { target: { value: '8' } });

        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(onUpdateSession).toHaveBeenCalledTimes(1);
        expect(onUpdateSession.mock.calls[0][0]).not.toHaveProperty('isPublic');
      });

      it('a group session has no visibility switch in its Who editor', async () => {
        const user = userEvent.setup();
        render(<SessionDetailModal {...baseProps} canManage session={groupSession} />);
        await user.click(screen.getAllByRole('button', { name: 'Edit' })[3]);
        // The Who editor is open (auto approve is there); a group session offers no slots and no visibility switch.
        expect(screen.getByRole('checkbox', { name: /Auto approve/i })).toBeInTheDocument();
        expect(screen.queryByLabelText('Taken slot')).not.toBeInTheDocument();
        expect(screen.queryByRole('switch', { name: 'Public session' })).not.toBeInTheDocument();
      });

      it('the Who summary names the visibility of a standalone session, and a group session has none', () => {
        const { unmount } = render(<SessionDetailModal {...baseProps} canManage session={preparing} />);
        expect(screen.getAllByText('Visibility:').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Public').length).toBeGreaterThan(0);
        unmount();

        const { unmount: unmountPrivate } = render(<SessionDetailModal {...baseProps} canManage session={privateSession} />);
        expect(screen.getAllByText('Private').length).toBeGreaterThan(0);
        unmountPrivate();

        render(<SessionDetailModal {...baseProps} canManage session={groupSession} />);
        expect(screen.queryByText('Visibility:')).not.toBeInTheDocument();
      });
    });

    it('a coded save failure shows its own line inside the section being edited', async () => {
      const user = userEvent.setup();
      render(
        <SessionDetailModal
          {...baseProps}
          canManage
          session={preparing}
          isUpdateSessionError
          updateSessionErrorText="Male and female slots can't be more than the open slots."
        />,
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[3]);
      expect(screen.getByRole('alert')).toHaveTextContent("Male and female slots can't be more than the open slots.");
    });

    it('"Mark it scheduled" is disabled while anything is missing and hidden for a non-host', () => {
      const { rerender } = render(<SessionDetailModal {...baseProps} canManage session={preparing} />);
      expect(screen.getByRole('button', { name: 'Mark it scheduled' })).toBeDisabled();
      rerender(<SessionDetailModal {...baseProps} canManage={false} session={preparing} />);
      expect(screen.queryByRole('button', { name: 'Mark it scheduled' })).not.toBeInTheDocument();
      rerender(<SessionDetailModal {...baseProps} canManage session={makeSession({ status: 'SCHEDULED' })} />);
      expect(screen.queryByRole('button', { name: 'Mark it scheduled' })).not.toBeInTheDocument();
    });

    it('"Mark it scheduled" opens the confirmation when nothing is missing', async () => {
      const user = userEvent.setup();
      const onScheduleConfirmOpenChange = vi.fn();
      render(
        <SessionDetailModal
          {...baseProps}
          canManage
          session={ready}
          onScheduleConfirmOpenChange={onScheduleConfirmOpenChange}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Mark it scheduled' }));
      expect(onScheduleConfirmOpenChange).toHaveBeenCalledWith(true);
    });

    it('the confirmation popup (complete variant) schedules on "Let\'s go" and closes on "Let me check again"', async () => {
      const user = userEvent.setup();
      const onSchedule = vi.fn();
      const onScheduleConfirmOpenChange = vi.fn();
      const props = {
        ...baseProps,
        canManage: true,
        session: ready,
        onSchedule,
        onScheduleConfirmOpenChange,
      };
      // Opened after the modal is up, as in the app (a popup mounted in the very first render would
      // be aria-hidden by the modal's own focus trap).
      const { rerender } = render(<SessionDetailModal {...props} />);
      rerender(<SessionDetailModal {...props} isScheduleConfirmOpen />);
      expect(screen.getByText('Are you ready?')).toBeInTheDocument();
      expect(screen.getByText(/Its details can't be edited after that/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: "Let's go" }));
      expect(onSchedule).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: 'Let me check again' }));
      expect(onScheduleConfirmOpenChange).toHaveBeenCalledWith(false);
    });

    it('a failed schedule shows its line in the popup', () => {
      const props = { ...baseProps, canManage: true, session: ready };
      const { rerender } = render(<SessionDetailModal {...props} />);
      rerender(
        <SessionDetailModal
          {...props}
          isScheduleConfirmOpen
          isScheduleError
          scheduleErrorText="This session still needs a location, a fee and a duration before it can be scheduled."
        />,
      );
      expect(screen.getByRole('alert')).toHaveTextContent('still needs a location');
    });

    it('still treats PREPARING as joinable for anyone', () => {
      render(<SessionDetailModal {...baseProps} session={preparing} />);
      expect(screen.getByText('Preparing')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
    });
  });

  describe('collapsible sections only where the session can be edited', () => {
    const sectionNames = ['Overview', 'When', 'Where', 'Who', 'Cost'];
    const informationToggle = () => screen.getByRole('button', { name: /^Information/ });
    const toggles = () =>
      screen.queryAllByRole('button').filter((button) => button.hasAttribute('aria-expanded') &&
        sectionNames.some((name) => (button.textContent ?? '').startsWith(name)));

    it('the host of a Preparing session gets collapsible sections', () => {
      render(<SessionDetailModal {...baseProps} canManage session={makeSession({ status: 'PREPARING' })} />);
      expect(toggles()).toHaveLength(5);
    });

    it('a viewer gets the read-only mode: one collapsed "Information" section, no per-field sections, no Edit — even while Preparing', () => {
      render(
        <SessionDetailModal
          {...baseProps}
          canManage={false}
          session={makeSession({ status: 'PREPARING', location: null, scheduledEndAt: null })}
        />,
      );
      expect(toggles()).toHaveLength(0);
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(informationToggle()).toHaveAttribute('aria-expanded', 'false');
      for (const name of sectionNames) expect(screen.queryByText(name, { exact: true })).not.toBeInTheDocument();
      // Collapsed: the one chip and the whole `field: value` summary.
      expect(screen.getByText(/^Missing: location, duration$/)).toBeInTheDocument();
      expect(screen.getByText('Title:').parentElement).toHaveTextContent('Title: Sunday pickup run');
      expect(screen.getByText('Location:')).toBeInTheDocument();
    });

    it('collapsed Information breaks the line for each group', () => {
      render(<SessionDetailModal {...baseProps} session={makeSession({ scheduledEndAt: '2026-08-01T20:30:00' })} />);
      const lineOf = (label: string) => screen.getByText(`${label}:`).parentElement?.parentElement as HTMLElement;
      // Same line within a group, a different line from the next group.
      expect(lineOf('Sport')).toBe(lineOf('Title'));
      expect(lineOf('Starts')).toBe(lineOf('Ends'));
      expect(lineOf('Taken')).toBe(lineOf('Auto approve'));
      expect(lineOf('Fee')).toBe(lineOf('Fee note'));
      const lines = ['Sport', 'Starts', 'Location', 'Taken', 'Fee'].map(lineOf);
      expect(new Set(lines).size).toBe(5);
    });

    it('expanding Information lists every field as its own row, with no sub-headings', () => {
      render(<SessionDetailModal {...baseProps} session={makeSession({ scheduledEndAt: '2026-08-01T20:30:00' })} />);
      fireEvent.click(informationToggle());
      expect(informationToggle()).toHaveAttribute('aria-expanded', 'true');
      for (const label of ['Sport', 'Title', 'Starts', 'Duration', 'Ends', 'Location', 'Note', 'Taken', 'Open', 'Mood', 'Auto approve', 'Fee', 'Fee note']) {
        expect(screen.getAllByText(label, { exact: true }).length).toBeGreaterThan(0);
      }
      expect(screen.getByText('Free')).toBeInTheDocument();
    });

    it('Players is its own read-only section: collapsed by default with the avatar preview, expanded shows the roster', () => {
      render(<SessionDetailModal {...baseProps} session={makeSession({ capacity: 10 })} />);
      const toggle = screen.getByRole('button', { name: /Players \(1\/10\)/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      // Collapsed: the avatars sit in the section header itself (owner, 2026-11-13), with no "Players:" label under it.
      expect(screen.queryByText('Players:')).not.toBeInTheDocument();
      const header = toggle.parentElement as HTMLElement;
      expect(header).toHaveTextContent('JL');
      // ... no capacity bar (it shows once opened).
      expect(document.querySelector('[class~="h-1.25"]')).toBeNull();
      expect(screen.queryByText('Jordan Lee')).not.toBeInTheDocument();
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
      expect(document.querySelector('[class~="h-1.25"]')).not.toBeNull();
      // Opened: the avatars leave the header (the roster shows the names).
      expect(header).not.toHaveTextContent('JL');
    });

    it('the buttons of a section sit to the left of its chevron, after the collapsed-only header content', () => {
      render(<SessionDetailModal {...baseProps} session={makeSession({ capacity: 10 })} />);
      const header = screen.getByRole('button', { name: /Players \(1\/10\)/ }).parentElement as HTMLElement;
      const children = Array.from(header.children);
      // label toggle first, the decorative chevron last
      expect(children[0].getAttribute('aria-expanded')).toBe('false');
      expect(children[children.length - 1].getAttribute('data-slot')).toBe('collapsible-chevron');
    });

    it.each(['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const)(
      'the host of a %s session gets static sections too (not editable any more)',
      (status) => {
        render(<SessionDetailModal {...baseProps} canManage session={makeSession({ status })} />);
        expect(toggles()).toHaveLength(0);
        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
        expect(screen.getByText('Fee:').parentElement).toHaveTextContent('Fee: Free');
        expect(screen.getByText('Mood:').parentElement).toHaveTextContent('Mood: 5 · Normal');
      },
    );

    it.each(['CANCELLED', 'COMPLETED', 'SCHEDULED'] as const)(
      'a %s session that lacks its location, fee or duration still shows the warning beside the section title',
      (status) => {
        render(
          <SessionDetailModal
            {...baseProps}
            canManage
            session={makeSession({ status, location: null, feeType: null, scheduledEndAt: null })}
          />,
        );
        expect(screen.getByText('Missing: location, fee, duration')).toBeInTheDocument();
        // The warning chip is information only: no banner, no Edit, no Mark it scheduled.
        expect(screen.queryByText('The host is still preparing this session.')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Mark it scheduled' })).not.toBeInTheDocument();
      },
    );

    it('a complete session shows no warning', () => {
      render(<SessionDetailModal {...baseProps} session={makeSession({ scheduledEndAt: '2026-08-01T20:30:00' })} />);
      expect(screen.queryByText(/^Missing:/)).not.toBeInTheDocument();
    });

    it('a static Session detail section still shows its summary, with "..." where empty', () => {
      render(
        <SessionDetailModal
          {...baseProps}
          canManage={false}
          session={makeSession({ attributes: { 'match/format': 'Doubles' } })}
          sessionAttributeSchema={attributeSchema}
        />,
      );
      expect(screen.getByText('Format:').parentElement).toHaveTextContent('Format: Doubles');
      expect(screen.queryByRole('button', { name: 'Session detail' })).not.toBeInTheDocument();
    });
  });
});

describe('SessionDetailModal: countdown, leave rule and confirmations (CLIENT-GL-51)', () => {
  const joinedSession = (startMs: number, overrides: Partial<Session> = {}) =>
    makeSession({
      scheduledStart: startIn(startMs),
      callerParticipation: makeCallerParticipation('JOINED'),
      ...overrides,
    });

  describe('the header countdown', () => {
    it('counts down to a scheduled session, with the days when there are some', () => {
      render(<SessionDetailModal {...baseProps} session={makeSession({ scheduledStart: startIn(2 * DAY_MS + 3 * HOUR_MS + 30_000) })} />);
      expect(screen.getByTestId('session-countdown')).toHaveTextContent(/^Starts in 2 days, 03:00:\d\d$/);
    });

    it('leaves the days out when the start is less than a day away', () => {
      render(<SessionDetailModal {...baseProps} session={makeSession({ scheduledStart: startIn(5 * HOUR_MS + 30_000) })} />);
      expect(screen.getByTestId('session-countdown')).toHaveTextContent(/^Starts in 05:00:\d\d$/);
    });

    it('says "Starting…" once the start has passed but the status has not changed yet', () => {
      render(<SessionDetailModal {...baseProps} session={makeSession({ scheduledStart: startIn(-MINUTE_MS) })} />);
      expect(screen.getByTestId('session-countdown')).toHaveTextContent('Starting…');
    });

    it.each(['ONGOING', 'COMPLETED', 'CANCELLED', 'PREPARING'] as const)('is not shown for a %s session', (status) => {
      render(<SessionDetailModal {...baseProps} session={makeSession({ status, scheduledStart: startIn(DAY_MS) })} />);
      expect(screen.queryByTestId('session-countdown')).not.toBeInTheDocument();
    });

    it('ticks every second', () => {
      vi.useFakeTimers();
      try {
        render(<SessionDetailModal {...baseProps} session={makeSession({ scheduledStart: startIn(HOUR_MS + 30_000) })} />);
        const before = screen.getByTestId('session-countdown').textContent;
        act(() => {
          vi.advanceTimersByTime(3000);
        });
        expect(screen.getByTestId('session-countdown').textContent).not.toBe(before);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('leaving', () => {
    it('asks first: "Stay" keeps the place, nothing is sent', async () => {
      const user = userEvent.setup();
      const onLeave = vi.fn();
      render(<SessionDetailModal {...baseProps} session={joinedSession(2 * DAY_MS)} onLeave={onLeave} />);
      await user.click(screen.getByRole('button', { name: 'Leave' }));
      const dialog = await screen.findByRole('dialog', { name: 'Are you leaving?' });
      expect(within(dialog).getByText(/Oh, this session will start in 1 day, 23:59:\d\d\. Do you still want to leave\?/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
      expect(onLeave).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Are you leaving?' })).not.toBeInTheDocument());
    });

    it('Escape also stays', async () => {
      const user = userEvent.setup();
      const onLeave = vi.fn();
      render(<SessionDetailModal {...baseProps} session={joinedSession(2 * DAY_MS)} onLeave={onLeave} />);
      await user.click(screen.getByRole('button', { name: 'Leave' }));
      await screen.findByRole('dialog', { name: 'Are you leaving?' });
      await user.keyboard('{Escape}');
      expect(onLeave).not.toHaveBeenCalled();
    });

    it('"Leave" in the question leaves, once', async () => {
      const user = userEvent.setup();
      const onLeave = vi.fn();
      render(<SessionDetailModal {...baseProps} session={joinedSession(2 * DAY_MS)} onLeave={onLeave} />);
      await user.click(screen.getByRole('button', { name: 'Leave' }));
      const dialog = await screen.findByRole('dialog', { name: 'Are you leaving?' });
      await user.click(within(dialog).getByRole('button', { name: 'Leave' }));
      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it('shows the rule as a hint next to the button', () => {
      render(<SessionDetailModal {...baseProps} session={joinedSession(2 * DAY_MS)} />);
      expect(screen.getByText('You can leave only until 15 minutes before the start.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
    });

    it('hides the button and the hint within 15 minutes of the start', () => {
      render(<SessionDetailModal {...baseProps} session={joinedSession(14 * MINUTE_MS)} />);
      expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
      expect(screen.queryByText(/You can leave only until/)).not.toBeInTheDocument();
    });

    it('keeps the button just before the cutoff', () => {
      render(<SessionDetailModal {...baseProps} session={joinedSession(16 * MINUTE_MS)} />);
      expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
    });

    it('hides the button on its own when the cutoff passes while the modal is open', () => {
      vi.useFakeTimers();
      try {
        render(<SessionDetailModal {...baseProps} session={joinedSession(15 * MINUTE_MS + 5000)} />);
        expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
        act(() => {
          vi.advanceTimersByTime(7000);
        });
        expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('hides it for an ongoing session', () => {
      render(<SessionDetailModal {...baseProps} session={joinedSession(-HOUR_MS, { status: 'ONGOING' })} />);
      expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
    });

    it('still lets a late invitee decline, without a question', async () => {
      const user = userEvent.setup();
      const onLeave = vi.fn();
      render(
        <SessionDetailModal
          {...baseProps}
          session={makeSession({ scheduledStart: startIn(5 * MINUTE_MS), callerParticipation: makeCallerParticipation('INVITED') })}
          onLeave={onLeave}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Decline' }));
      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelling a join request', () => {
    const requested = () =>
      makeSession({ scheduledStart: startIn(5 * MINUTE_MS), callerParticipation: makeCallerParticipation('REQUESTED') });

    it('asks first: "Keep waiting" keeps the request', async () => {
      const user = userEvent.setup();
      const onLeave = vi.fn();
      render(<SessionDetailModal {...baseProps} session={requested()} onLeave={onLeave} />);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      const dialog = await screen.findByRole('dialog', { name: 'Cancel your request?' });
      expect(within(dialog).getByText('Your request is waiting for approval. Do you want to wait a bit?')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Keep waiting' }));
      expect(onLeave).not.toHaveBeenCalled();
    });

    it('"Cancel" in the question withdraws the request, once', async () => {
      const user = userEvent.setup();
      const onLeave = vi.fn();
      render(<SessionDetailModal {...baseProps} session={requested()} onLeave={onLeave} />);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      const dialog = await screen.findByRole('dialog', { name: 'Cancel your request?' });
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it('shows no leave hint', () => {
      render(<SessionDetailModal {...baseProps} session={requested()} />);
      expect(screen.queryByText(/You can leave only until/)).not.toBeInTheDocument();
    });
  });
});

describe('SessionDetailModal: cancelling a group session (CLIENT-GROUP-SESSION-1)', () => {
  const groupSession = (overrides: Partial<Session> = {}) =>
    makeSession({ groupId: 5, sessionType: 'GROUP_RECURRING', isPublic: false, ...overrides });

  it('offers "Cancel session" to someone who manages a group session that has not ended', () => {
    render(<SessionDetailModal {...baseProps} session={groupSession()} canManage />);
    expect(screen.getByRole('button', { name: 'Cancel session' })).toBeInTheDocument();
  });

  it.each(['PREPARING', 'SCHEDULED', 'ONGOING'] as const)('offers it while the session is %s', (status) => {
    render(<SessionDetailModal {...baseProps} session={groupSession({ status })} canManage />);
    expect(screen.getByRole('button', { name: 'Cancel session' })).toBeInTheDocument();
  });

  it.each(['COMPLETED', 'CANCELLED'] as const)('does not offer it once the session is %s', (status) => {
    render(<SessionDetailModal {...baseProps} session={groupSession({ status })} canManage />);
    expect(screen.queryByRole('button', { name: 'Cancel session' })).not.toBeInTheDocument();
  });

  it('does not offer it to a member who does not manage the session', () => {
    render(<SessionDetailModal {...baseProps} session={groupSession()} canManage={false} />);
    expect(screen.queryByRole('button', { name: 'Cancel session' })).not.toBeInTheDocument();
  });

  it('does not offer it for a standalone session, even to its host', () => {
    render(<SessionDetailModal {...baseProps} session={makeSession({ groupId: null })} canManage />);
    expect(screen.queryByRole('button', { name: 'Cancel session' })).not.toBeInTheDocument();
  });

  it('asks first and cancels with the typed reason, trimmed', async () => {
    const user = userEvent.setup();
    const onConfirmCancel = vi.fn();
    render(<SessionDetailModal {...baseProps} session={groupSession()} canManage onConfirmCancel={onConfirmCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel session' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this session?' });
    expect(onConfirmCancel).not.toHaveBeenCalled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason for cancelling' }), '  Court closed  ');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel session' }));

    expect(onConfirmCancel).toHaveBeenCalledTimes(1);
    expect(onConfirmCancel).toHaveBeenCalledWith('Court closed');
  });

  it('cancels with an empty reason when none is typed', async () => {
    const user = userEvent.setup();
    const onConfirmCancel = vi.fn();
    render(<SessionDetailModal {...baseProps} session={groupSession()} canManage onConfirmCancel={onConfirmCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel session' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Cancel this session?' })).getByRole('button', { name: 'Cancel session' }));
    expect(onConfirmCancel).toHaveBeenCalledWith('');
  });

  it('keeps the session when the host chooses "Keep session"', async () => {
    const user = userEvent.setup();
    const onConfirmCancel = vi.fn();
    render(<SessionDetailModal {...baseProps} session={groupSession()} canManage onConfirmCancel={onConfirmCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel session' }));
    await user.click(screen.getByRole('button', { name: 'Keep session' }));
    expect(onConfirmCancel).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Cancel this session?' })).not.toBeInTheDocument();
  });

  it('forgets a reason typed before "Keep session" the next time the dialog opens', async () => {
    const user = userEvent.setup();
    render(<SessionDetailModal {...baseProps} session={groupSession()} canManage />);
    await user.click(screen.getByRole('button', { name: 'Cancel session' }));
    await user.type(screen.getByRole('textbox', { name: 'Reason for cancelling' }), 'draft reason');
    await user.click(screen.getByRole('button', { name: 'Keep session' }));
    await user.click(screen.getByRole('button', { name: 'Cancel session' }));
    expect(screen.getByRole('textbox', { name: 'Reason for cancelling' })).toHaveValue('');
  });

  it('shows the failure line when the cancel failed, and disables the button while cancelling', () => {
    const { rerender } = render(<SessionDetailModal {...baseProps} session={groupSession()} canManage isCancelError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't cancel this session. Please try again.");
    rerender(<SessionDetailModal {...baseProps} session={groupSession()} canManage isCancelling />);
    expect(screen.getByRole('button', { name: 'Cancel session' })).toBeDisabled();
  });
});

describe('SessionDetailModal: a group session shows the joined count, not slots (CLIENT-GROUP-SESSION-1)', () => {
  const groupSession = (overrides: Partial<Session> = {}) =>
    makeSession({ groupId: 5, sessionType: 'GROUP_RECURRING', isPublic: false, participantCount: 7, capacity: 12, initialSlot: 0, ...overrides });

  it('replaces the Taken and Open rows with one Joined count', () => {
    render(<SessionDetailModal {...baseProps} session={groupSession()} />);
    expect(screen.getAllByText(/^Joined\b/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Taken\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Open\b/)).not.toBeInTheDocument();
  });

  it('keeps the Taken and Open rows for a standalone session', () => {
    render(<SessionDetailModal {...baseProps} session={makeSession({ groupId: null, capacity: 12 })} />);
    expect(screen.getAllByText(/^Taken\b/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Open\b/).length).toBeGreaterThan(0);
  });

  it('shows the Players count without a capacity for a group session, and with one for a standalone session', () => {
    const { rerender } = render(<SessionDetailModal {...baseProps} session={groupSession()} />);
    expect(screen.getByText('Players (7)')).toBeInTheDocument();
    expect(screen.queryByText('Players (7/12)')).not.toBeInTheDocument();
    rerender(<SessionDetailModal {...baseProps} session={makeSession({ groupId: null, participantCount: 7, capacity: 12 })} />);
    expect(screen.getByText('Players (7/12)')).toBeInTheDocument();
  });

  it('offers no Taken, Open or gender inputs when the host edits the Who section of a group draft', async () => {
    const user = userEvent.setup();
    render(
      <SessionDetailModal
        {...baseProps}
        canManage
        session={groupSession({ status: 'PREPARING', location: null, feeType: null })}
      />,
    );
    const edits = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(edits[3]);
    expect(screen.queryByLabelText(/Taken/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Open slot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Who can join/i)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Auto approve/i })).toBeInTheDocument();
  });
});
