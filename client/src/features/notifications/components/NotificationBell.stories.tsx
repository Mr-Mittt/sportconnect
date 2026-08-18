import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Notification } from '../types';
import { NotificationBell } from './NotificationBell';

const notifications: Notification[] = [
  {
    id: 1,
    type: 'session.comment.created',
    entityType: 'SESSION',
    entityId: '42',
    actorIds: ['actor-1'],
    actorCount: 1,
    isRead: false,
    createdAt: '2026-08-18T09:00:00',
    updatedAt: '2026-08-18T09:00:00',
    actors: [{ id: 'actor-1', fullName: 'Alice Nguyen' }],
    entityTitle: 'Friday Pickup Game',
  },
  {
    id: 2,
    type: 'session.join_request.approved',
    entityType: 'SESSION',
    entityId: '43',
    actorIds: ['actor-2'],
    actorCount: 1,
    isRead: true,
    createdAt: '2026-08-17T09:00:00',
    updatedAt: '2026-08-17T09:00:00',
    actors: [],
    entityTitle: 'Sunday pickup run',
  },
];

const meta = {
  title: 'Notifications/NotificationBell',
  component: NotificationBell,
  args: {
    unreadCount: 0,
    isOpen: false,
    onOpenChange: () => {},
    notifications: [],
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    onLoadMore: () => {},
    onSelect: () => {},
    hasUnreadLoaded: false,
    onMarkAllRead: () => {},
    isMarkingAllRead: false,
  },
} satisfies Meta<typeof NotificationBell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  args: { unreadCount: 2 },
};

export const OpenLoading: Story = {
  args: { unreadCount: 2, isOpen: true, isLoading: true },
};

export const OpenError: Story = {
  args: { unreadCount: 2, isOpen: true, isError: true },
};

export const OpenEmpty: Story = {
  args: { isOpen: true },
};

export const OpenPopulated: Story = {
  args: { unreadCount: 1, isOpen: true, notifications, hasUnreadLoaded: true },
};

export const OpenWithLoadMore: Story = {
  args: { unreadCount: 1, isOpen: true, notifications, hasUnreadLoaded: true, hasNextPage: true },
};
