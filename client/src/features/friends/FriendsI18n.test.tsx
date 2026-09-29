import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
import { FriendChatPanelView } from './components/FriendChatPanelView';
import { FriendProfilePanel } from './components/FriendProfilePanel';
import { FriendRail } from './components/FriendRail';
import { FriendRequestUnavailableDialog } from './components/FriendRequestUnavailableDialog';
import { UnfriendConfirmDialog } from './components/UnfriendConfirmDialog';
import type { FriendSectionKey, FriendUser, SelectedPerson } from './types';

/**
 * CLIENT-I18N-8: Vietnamese rendering + override-prefix behavior for the Friends feature's
 * components. English output is covered by each component's own existing test file.
 */
const collapsedSections: Record<FriendSectionKey, boolean> = {
  online: false,
  friendRequests: false,
  offline: false,
  blocked: false,
};

function railProps(overrides = {}) {
  return {
    query: '',
    onQueryChange: vi.fn(),
    onClear: vi.fn(),
    isAddMode: false,
    onToggleAddMode: vi.fn(),
    onBack: vi.fn(),
    collapsedSections,
    onToggleSection: vi.fn(),
    onlineFriends: [] as FriendUser[],
    friendRequestRows: [],
    totalFriendRequestsCount: 0,
    offlineFriends: [] as FriendUser[],
    totalFriendsCount: 0,
    blockedFriends: [] as FriendUser[],
    selectedPersonId: undefined,
    onSelectPerson: vi.fn(),
    searchResults: [],
    isSearching: false,
    isSearchError: false,
    ...overrides,
  };
}

const friend: SelectedPerson = {
  id: 'f1',
  fullName: 'Priya Shah',
  avatarUrl: null,
  coverUrl: null,
  bio: null,
  friendshipStatus: 'FRIENDS',
  requestId: null,
} as SelectedPerson;

const chatProps = {
  currentUserId: 'me',
  messages: [],
  isLoading: false,
  isError: false,
  sendMessage: vi.fn(),
  isSending: false,
  editMessage: vi.fn(),
  isEditing: false,
  deleteMessage: vi.fn(),
  isDeleting: false,
  hasOlderMessages: false,
  isLoadingOlderMessages: false,
  isLoadOlderMessagesError: false,
  loadOlderMessages: vi.fn(),
  typingUsers: [],
  sendTyping: vi.fn(),
};

describe('Friends feature i18n', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('FriendRail renders Vietnamese copy', async () => {
    await i18n.changeLanguage('vi');
    render(<FriendRail {...railProps()} />);
    expect(screen.getByLabelText('Tìm bạn bè')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm bạn' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lời mời kết bạn (0)' })).toBeInTheDocument();
    expect(screen.getAllByText('Chưa có gì ở đây.')).toHaveLength(4);
  });

  it('FriendRail interpolates the query in Add mode (vi)', async () => {
    await i18n.changeLanguage('vi');
    render(<FriendRail {...railProps({ isAddMode: true, query: 'zed' })} />);
    expect(screen.getByText('Không tìm thấy người dùng nào cho "zed"')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quay lại danh sách bạn bè' })).toBeInTheDocument();
  });

  it('FriendRail prefers an override-prefix key over the default copy', () => {
    i18n.addResourceBundle('en', 'friendsOverrideTest', { custom: { rail: { addFriend: 'Invite' } } }, true, true);
    render(<FriendRail {...railProps()} i18nOverridePrefix="friendsOverrideTest:custom" />);
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search friends')).toBeInTheDocument(); // un-overridden key falls back
  });

  it('FriendProfilePanel renders Vietnamese copy for the FRIENDS state', async () => {
    await i18n.changeLanguage('vi');
    render(
      <FriendProfilePanel
        person={friend}
        sports={[]}
        isSportsLoading={false}
        onSendRequest={vi.fn()}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onCancel={vi.fn()}
        onUnfriend={vi.fn()}
        onUnfriendDialogClose={vi.fn()}
        isUnfriendError={false}
        isActionPending={false}
      />,
    );
    expect(screen.getByText('Thành tích')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bạn bè' })).toBeInTheDocument();
  });

  it('FriendChatPanelView renders Vietnamese copy', async () => {
    await i18n.changeLanguage('vi');
    render(<FriendChatPanelView {...chatProps} />);
    expect(screen.getByText('Chưa có tin nhắn nào.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tin nhắn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeInTheDocument();
  });

  it('FriendChatPanelView shows the Vietnamese load error', async () => {
    await i18n.changeLanguage('vi');
    render(<FriendChatPanelView {...chatProps} isError messages={undefined} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải cuộc trò chuyện này.');
  });

  it('UnfriendConfirmDialog interpolates the person name in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    render(
      <UnfriendConfirmDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        isSubmitting={false}
        isError={false}
        personName="Priya Shah"
      />,
    );
    expect(screen.getByText('Bạn có thật sự muốn hủy kết bạn với Priya Shah?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeInTheDocument();
  });

  it('FriendRequestUnavailableDialog renders Vietnamese copy', async () => {
    await i18n.changeLanguage('vi');
    render(<FriendRequestUnavailableDialog isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Lời mời kết bạn này không còn khả dụng.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đã hiểu' })).toBeInTheDocument();
  });
});
