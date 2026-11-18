import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment } from '@/features/feed/types';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { ParticipantStatus, SessionParticipant, SessionStatus } from '@/shared/types/session';
import type { SessionShareData } from '../types';
import { makeSession, sportsByKey } from './sessionListFixtures';
import { SessionDetailModal } from './SessionDetailModal';

// CLIENT-SESSION-49: the Players header's Share button (who sees it, in both header layouts) and the dialog it opens.

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

const joinedHost: SessionParticipant = {
  id: 1,
  sessionId: 1,
  userId: 'user-1',
  userFullName: 'Jordan Lee',
  userAvatarUrl: null,
  status: 'JOINED',
  rejectReason: null,
  createdAt: '2026-07-01T10:00:00',
};

const joinedFriend: SessionParticipant = {
  ...joinedHost,
  id: 2,
  userId: 'u-alice',
  userFullName: 'Alice Nguyen',
};

function makeShare(overrides: Partial<SessionShareData> = {}): SessionShareData {
  return {
    isOpen: false,
    onOpen: vi.fn(),
    onClose: vi.fn(),
    friends: [
      { id: 'u-alice', fullName: 'Alice Nguyen', avatarUrl: null, coverUrl: null, bio: null },
      { id: 'u-bao', fullName: 'Bảo Trần', avatarUrl: null, coverUrl: null, bio: null },
    ],
    isFriendsLoading: false,
    isFriendsError: false,
    onShare: vi.fn(),
    isSharing: false,
    isShareError: false,
    ...overrides,
  };
}

function propsFor(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    onClose: () => {},
    session: makeSession({ id: 1, participantCount: 2 }),
    sportsByKey,
    isLoading: false,
    isError: false,
    participants: [joinedHost, joinedFriend],
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
    requestedParticipants: [],
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
    share: makeShare(),
    ...overrides,
  } as unknown as React.ComponentProps<typeof SessionDetailModal>;
}

const SHARE = 'Share this session';
const shareButton = () => screen.queryByRole('button', { name: SHARE });

describe('the Share button: who sees it', () => {
  it.each<SessionStatus>(['PREPARING', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'])(
    'shows it for a viewer of a standalone %s session',
    (status) => {
      render(<SessionDetailModal {...propsFor({ session: makeSession({ id: 1, status }) })} />);
      expect(shareButton()).toBeInTheDocument();
    },
  );

  it.each<ParticipantStatus | null>(['JOINED', 'REQUESTED', 'INVITED', 'LEFT', null])(
    'shows it whatever the viewer\'s own participation is (%s)',
    (held) => {
      const callerParticipation =
        held === null ? null : { ...joinedHost, id: 9, userId: 'user-2', userFullName: 'Me', status: held };
      render(<SessionDetailModal {...propsFor({ session: makeSession({ id: 1, callerParticipation }) })} />);
      expect(shareButton()).toBeInTheDocument();
    },
  );

  it('is inside the Players section, left of its chevron, in the read-only layout', () => {
    render(<SessionDetailModal {...propsFor()} />);
    expect(within(screen.getByRole('region', { name: 'Players' })).getByRole('button', { name: SHARE })).toBeInTheDocument();
  });

  it('is inside the Players section too in the host\'s editable layout (a PREPARING session)', () => {
    render(<SessionDetailModal {...propsFor({ session: makeSession({ id: 1, status: 'PREPARING' }), canManage: true })} />);
    expect(within(screen.getByRole('region', { name: 'Players' })).getByRole('button', { name: SHARE })).toBeInTheDocument();
  });

  it('is hidden for a group session, for everyone', () => {
    render(<SessionDetailModal {...propsFor({ session: makeSession({ id: 1, groupId: 5, sessionType: 'GROUP_RECURRING' }) })} />);
    expect(shareButton()).toBeNull();
  });

  it('is hidden when the host page passes no share slice', () => {
    render(<SessionDetailModal {...propsFor({ share: undefined })} />);
    expect(shareButton()).toBeNull();
  });

  it('asks the host to open the dialog on click', async () => {
    const user = userEvent.setup();
    const share = makeShare();
    render(<SessionDetailModal {...propsFor({ share })} />);
    await user.click(screen.getByRole('button', { name: SHARE }));
    expect(share.onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('the Players header with the Share button (host layout)', () => {
  const editable = () => propsFor({ session: makeSession({ id: 1, status: 'PREPARING' }), canManage: true });

  it('still toggles on its own button, and the Share button does not toggle it', async () => {
    const user = userEvent.setup();
    render(<SessionDetailModal {...editable()} />);
    const toggle = screen.getByRole('button', { name: /Players \(/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: SHARE }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('has exactly one focusable toggle for the section (the chevron is decoration)', () => {
    render(<SessionDetailModal {...editable()} />);
    const players = screen.getByRole('region', { name: 'Players' });
    expect(within(players).getAllByRole('button', { expanded: true })).toHaveLength(1);
  });
});

/**
 * The session modal is open first and the Share dialog opens later, as in the app: a Radix modal hides the other portals that
 * exist when it mounts, so a Share dialog rendered in the same first render would be aria-hidden (a test artifact).
 */
function renderWithShareOpened(share: SessionShareData) {
  const view = render(<SessionDetailModal {...propsFor({ share: { ...share, isOpen: false } })} />);
  view.rerender(<SessionDetailModal {...propsFor({ share })} />);
  return view;
}

describe('the Share dialog in the session modal', () => {
  it('renders nothing while the slice says closed', () => {
    render(<SessionDetailModal {...propsFor()} />);
    expect(screen.queryByRole('dialog', { name: 'Share with friends' })).toBeNull();
  });

  it('opens over the modal, listing the friends not joined with a checkbox and the joined ones with "Joined"', () => {
    renderWithShareOpened(makeShare({ isOpen: true }));
    const dialog = screen.getByRole('dialog', { name: 'Share with friends' });

    // Alice has a JOINED row in this session's participants; Bảo does not.
    expect(within(dialog).getByRole('checkbox', { name: 'Select Bảo Trần' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: 'Select Alice Nguyen' })).toBeNull();
    expect(within(dialog).getByText('Joined')).toBeInTheDocument();
  });

  it('sends the ticked friends through the slice', () => {
    const share = makeShare({ isOpen: true });
    renderWithShareOpened(share);
    const dialog = screen.getByRole('dialog', { name: 'Share with friends' });

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Bảo Trần' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Share (1)' }));

    expect(share.onShare).toHaveBeenCalledWith(['u-bao'], expect.any(Function));
  });

  it('closes through the slice', async () => {
    const user = userEvent.setup();
    const share = makeShare({ isOpen: true });
    renderWithShareOpened(share);
    const dialog = screen.getByRole('dialog', { name: 'Share with friends' });

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    expect(share.onClose).toHaveBeenCalledTimes(1);
  });

  it('is never rendered for a group session, even if the slice says open', () => {
    render(
      <SessionDetailModal
        {...propsFor({
          session: makeSession({ id: 1, groupId: 5, sessionType: 'GROUP_RECURRING' }),
          share: makeShare({ isOpen: true }),
        })}
      />,
    );
    expect(screen.queryByRole('dialog', { name: 'Share with friends' })).toBeNull();
  });
});
