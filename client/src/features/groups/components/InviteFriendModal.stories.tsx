import type { Meta, StoryObj } from '@storybook/react-vite';
import type { InviteResultRow } from '@/features/groups/useInviteFriendModalData';
import type { UserSearchResult } from '@/features/friends/types';
import { InviteFriendModal } from './InviteFriendModal';

function user(overrides: Partial<UserSearchResult>): UserSearchResult {
  return {
    id: 'user-1',
    fullName: 'Robin Alvarez',
    username: 'robin.a',
    avatarUrl: null,
    city: null,
    country: null,
    friendshipStatus: 'FRIENDS',
    ...overrides,
  };
}

function row(overrides: Partial<InviteResultRow>): InviteResultRow {
  return {
    user: user({}),
    action: 'friend',
    isSending: false,
    error: null,
    ...overrides,
  };
}

const invitableRows: InviteResultRow[] = [
  row({ user: user({ id: 'user-1', fullName: 'Robin Alvarez', username: 'robin.a' }) }),
  row({
    user: user({ id: 'user-2', fullName: 'Priya Shah', username: 'priya.s' }),
    action: 'member',
  }),
  row({
    user: user({ id: 'user-3', fullName: 'Jordan Lee', username: 'jordan.l' }),
    action: 'invited',
  }),
];

const meta = {
  title: 'Groups/InviteFriendModal',
  component: InviteFriendModal,
  args: {
    isOpen: true,
    onClose: () => {},
    inputValue: '',
    onInputChange: () => {},
    rows: [],
    isSearching: false,
    isSearchError: false,
    onInvite: () => {},
  },
} satisfies Meta<typeof InviteFriendModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Below the 2-character minimum — no query fires yet, hint text shown. */
export const BelowMinLength: Story = {
  args: { inputValue: 'r' },
};

/**
 * Invitable friends first, then already-member/already-invited friends
 * pushed to the bottom, badged instead of a button (user decision,
 * 2026-07-22). Non-friend search hits are never rendered at all.
 */
export const MixedResults: Story = {
  args: { inputValue: 'ro', rows: invitableRows },
};

export const Loading: Story = {
  args: { inputValue: 'ro', isSearching: true },
};

export const SearchErrorState: Story = {
  args: { inputValue: 'ro', isSearchError: true },
};

export const NoFriendsFound: Story = {
  args: { inputValue: 'zzz' },
};

/** One row's invite is in flight — its button disables itself. */
export const SendingInvite: Story = {
  args: { inputValue: 'ro', rows: [row({ isSending: true })] },
};

/** One row's invite failed (e.g. allowMemberInvites off) — inline error under that row only. */
export const InviteErrorOnOneRow: Story = {
  args: {
    inputValue: 'ro',
    rows: [row({ error: 'Member invitations are not allowed in this group' })],
  },
};
