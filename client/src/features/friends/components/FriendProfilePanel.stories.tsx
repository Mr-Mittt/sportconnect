import type { Meta, StoryObj } from '@storybook/react-vite';
import { FriendProfilePanel } from './FriendProfilePanel';
import type { SelectedPerson } from '../types';
import type { SportProfile } from '@/shared/types/sport';

const basePerson: SelectedPerson = {
  id: 'f1',
  fullName: 'Priya Shah',
  avatarUrl: null,
  coverUrl: null,
  bio: 'Weekend hooper, always down for pickup.',
  friendshipStatus: 'FRIENDS',
  requestId: null,
};

const sports: SportProfile[] = [
  { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
];

const meta = {
  title: 'Friends/FriendProfilePanel',
  component: FriendProfilePanel,
  args: {
    person: basePerson,
    sports,
    isSportsLoading: false,
    onSendRequest: () => {},
    onAccept: () => {},
    onDecline: () => {},
    onCancel: () => {},
    isActionPending: false,
  },
  decorators: [(Story) => <div className="h-100">{Story()}</div>],
} satisfies Meta<typeof FriendProfilePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Already friends — no docked action bar. */
export const Friends: Story = {};

/** Never interacted — "Send a friend request" is the only action. */
export const NoRelationship: Story = {
  args: { person: { ...basePerson, friendshipStatus: 'NONE', bio: null } },
};

/** Caller already sent a request — "Waiting for response" status + "Cancel request". */
export const PendingSent: Story = {
  args: { person: { ...basePerson, friendshipStatus: 'PENDING_SENT', requestId: 'req-2' } },
};

/** Caller received a request — Decline/Accept. */
export const PendingReceived: Story = {
  args: { person: { ...basePerson, friendshipStatus: 'PENDING_RECEIVED', requestId: 'req-1' } },
};

/** No sports on file — sport-pill row doesn't render at all. */
export const NoSports: Story = {
  args: { sports: [] },
};
