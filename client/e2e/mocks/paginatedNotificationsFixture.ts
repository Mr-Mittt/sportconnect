import type { Notification } from '../../src/features/notifications/types.ts';
import { mockSession } from './fixtures.ts';

/**
 * CLIENT-NOTIF-2: 11 notifications — one more than the notification list's
 * fixed page size (10, `useNotifications.ts`/`handlers/notifications.ts`
 * both hardcode `PAGE_SIZE`) — so the bell dropdown's "Load more" button has
 * a genuine second page to fetch, same reasoning as `paginatedFeedFixture.ts`'s
 * 21-post feed. All point at `mockSession` ("Sunday pickup run"), same as
 * `defaultNotificationsState` in `handlers/notifications.ts` — this fixture
 * only needs volume, not variety, to exercise pagination.
 */
export function buildPaginatedNotifications(): Notification[] {
  return Array.from({ length: 11 }, (_, index) => ({
    id: 1000 + index,
    type: 'session.comment.created',
    entityType: 'SESSION',
    entityId: String(mockSession.id),
    actorIds: ['actor-1'],
    actorCount: 1,
    isRead: index >= 2,
    createdAt: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
    actors: [{ id: 'actor-1', fullName: 'Alice Nguyen' }],
    entityTitle: mockSession.title,
  }));
}
