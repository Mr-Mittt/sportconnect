import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Notification, NotificationType } from '../types';
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

/**
 * The only type that names no person at all — a scheduled job makes the
 * transition, so the backend sends `actorId = null` and the row leads with the
 * bold entity title instead of an actor (CLIENT-NOTIF-3).
 */
export const SessionStarted: Story = {
  args: {
    notification: { ...baseNotification, type: 'session.status.started', actorIds: [], actors: [] },
  },
};

/**
 * The degraded state for a routing key the client has no case for. Rendering
 * this deliberately stays generic, but it should be reviewable rather than only
 * unit-tested — this is what every unmapped backend event looks like to a user.
 */
export const UnknownType: Story = {
  // Cast for the same reason the fallback tests need one (CLIENT-NOTIF-4): `type` is a union of
  // what the backend emits at this build, and the whole point of this story is a value outside it.
  args: { notification: { ...baseNotification, type: 'not.a.real.routing.key' as NotificationType } },
};
