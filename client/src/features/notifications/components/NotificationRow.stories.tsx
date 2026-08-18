import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Notification } from '../types';
import { NotificationRow } from './NotificationRow';

const baseNotification: Notification = {
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
};

const meta = {
  title: 'Notifications/NotificationRow',
  component: NotificationRow,
  args: {
    notification: baseNotification,
    onSelect: () => {},
  },
} satisfies Meta<typeof NotificationRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unread: Story = {};

export const Read: Story = {
  args: { notification: { ...baseNotification, isRead: true } },
};

export const MultipleActors: Story = {
  args: {
    notification: {
      ...baseNotification,
      actors: [
        { id: 'a1', fullName: 'Alice Nguyen' },
        { id: 'a2', fullName: 'Bao Tran' },
        { id: 'a3', fullName: 'Chi Le' },
      ],
    },
  },
};

export const NoEntityTitle: Story = {
  args: { notification: { ...baseNotification, entityTitle: null } },
};

export const ApprovalOutcome: Story = {
  args: { notification: { ...baseNotification, type: 'session.join_request.approved' } },
};
