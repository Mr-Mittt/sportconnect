import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MentionSource } from '@/shared/components/MentionInput';
import type { Comment } from '@/features/feed/types';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { Session, SessionParticipant } from '@/shared/types/session';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { SessionDetailModal } from './SessionDetailModal';

// CLIENT-GL-50 part 3: the host's label in the tag list, and "Waiting for approval" folded into the Players section.

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
    likeCount: 0,
    isLikedByCurrentUser: false,
    callerParticipation: null,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    ...overrides,
  };
}

const joined: SessionParticipant = {
  id: 1,
  sessionId: 1,
  userId: 'user-1',
  userFullName: 'Jordan Lee',
  userAvatarUrl: null,
  status: 'JOINED',
  rejectReason: null,
  createdAt: '2026-07-01T10:00:00',
};

const requested: SessionParticipant = {
  id: 2,
  sessionId: 1,
  userId: 'user-3',
  userFullName: 'Alex Chen',
  userAvatarUrl: null,
  status: 'REQUESTED',
  rejectReason: null,
  createdAt: '2026-07-02T10:00:00',
};

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

const baseProps = {
  isOpen: true,
  onClose: () => {},
  session: makeSession(),
  sportsByKey,
  isLoading: false,
  isError: false,
  participants: [joined],
  isParticipantsLoading: false,
  isParticipantsError: false,
  currentUserId: 'user-2',
  canManage: true,
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
  requestedParticipants: [requested],
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
} as unknown as React.ComponentProps<typeof SessionDetailModal>;

const approvalName = 'Waiting for approval';

function follows(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('Players and Waiting for approval (read-only mode: the host of a scheduled session)', () => {
  it('shows the approval block inside the Players section while Players is collapsed, and no separate section', () => {
    render(<SessionDetailModal {...baseProps} />);
    const players = screen.getByRole('region', { name: 'Players' });
    const approval = screen.getByRole('region', { name: approvalName });
    expect(players).toContainElement(approval);
    expect(screen.getAllByRole('region', { name: approvalName })).toHaveLength(1);
    // Players is collapsed: no roster, the approval block is still there.
    expect(within(players).queryByText('Jordan Lee')).toBeNull();
    expect(within(approval).getByText('Waiting for approval (1)')).toBeInTheDocument();
    expect(within(approval).getByText('Alex Chen')).toBeInTheDocument();
  });

  it('keeps the approval block above the roster once Players is open', () => {
    render(<SessionDetailModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Players \(1\)/ }));
    const approval = screen.getByRole('region', { name: approvalName });
    const roster = within(screen.getByRole('region', { name: 'Players' })).getByText('Jordan Lee');
    expect(follows(approval, roster)).toBe(true);
  });

  it('the approval block is open by default and collapses and opens on its own heading', async () => {
    const user = userEvent.setup();
    render(<SessionDetailModal {...baseProps} />);
    const heading = screen.getByRole('button', { name: /Waiting for approval \(1\)/ });
    expect(heading).toHaveAttribute('aria-expanded', 'true');
    await user.click(heading);
    expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Alex Chen')).toBeNull();
    await user.click(heading);
    expect(screen.getByText('Alex Chen')).toBeInTheDocument();
  });

  it('collapsing the approval block leaves Players alone, and the other way round', async () => {
    const user = userEvent.setup();
    render(<SessionDetailModal {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /Waiting for approval \(1\)/ }));
    expect(screen.queryByText('Jordan Lee')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Players \(1\)/ }));
    expect(within(screen.getByRole('region', { name: 'Players' })).getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.queryByText('Alex Chen')).toBeNull();
  });

  it('shows nothing when nobody is waiting', () => {
    render(<SessionDetailModal {...baseProps} requestedParticipants={[]} />);
    expect(screen.queryByRole('region', { name: approvalName })).toBeNull();
  });

  it('approving from the folded block still calls the handler with the userId', async () => {
    const user = userEvent.setup();
    const onApproveParticipant = vi.fn();
    render(<SessionDetailModal {...baseProps} onApproveParticipant={onApproveParticipant} />);
    await user.click(within(screen.getByRole('region', { name: 'Players' })).getByRole('button', { name: 'Approve' }));
    expect(onApproveParticipant).toHaveBeenCalledWith('user-3');
  });
});

describe('Players and Waiting for approval (editable mode: the host of a Preparing session)', () => {
  const preparing = { ...baseProps, session: makeSession({ status: 'PREPARING' }) } as typeof baseProps;

  it('shows the approval block inside Players, above the roster when open and still there when collapsed', async () => {
    const user = userEvent.setup();
    render(<SessionDetailModal {...preparing} />);
    const players = screen.getByRole('region', { name: 'Players' });
    const approval = within(players).getByRole('region', { name: approvalName });
    expect(follows(approval, within(players).getByText('Jordan Lee'))).toBe(true);

    await user.click(within(players).getByRole('button', { name: /Players \(1\)/ }));
    expect(within(players).queryByText('Jordan Lee')).toBeNull();
    expect(within(players).getByRole('region', { name: approvalName })).toBeInTheDocument();
  });
});

describe('the host in the tag list of the session thread', () => {
  const people = (): MentionSource => ({
    options: [
      { id: 'user-1', name: 'Jordan Lee', label: 'Jordan Lee', avatarUrl: null },
      { id: 'user-5', name: 'Priya Shah', label: 'Priya Shah', avatarUrl: null },
    ],
    onQueryChange: vi.fn(),
  });

  it('writes (host) after the session creator, and only there', async () => {
    const user = userEvent.setup();
    render(<SessionDetailModal {...baseProps} canManage={false} mentionSource={people()} />);
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'hi @');
    const options = within(screen.getByRole('listbox', { name: 'People you can tag' })).getAllByRole('option');
    expect(options.map((option) => option.querySelector('span.truncate')?.textContent)).toEqual([
      'Jordan Lee (host)',
      'Priya Shah',
    ]);
  });

  it('keeps the chip and the sent text to the name and the id, with no (host)', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    render(
      <SessionDetailModal {...baseProps} canManage={false} mentionSource={people()} onAddComment={onAddComment} />,
    );
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), '@Jor');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('img', { name: 'Mention: Jordan Lee' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onAddComment).toHaveBeenCalledWith('@[Jordan Lee](user-1)');
  });
});
