import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type { Notification } from '../../../src/features/notifications/types.ts';
import { mockFriend, mockSession } from '../fixtures.ts';
import { getOverrides } from '../overrides.ts';
import { createSessionStore, sessionIdFromRequest } from '../sessionStore.ts';

function apiResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

function apiError(message: string): ApiResponse<null> {
  return { success: false, message, data: null, timestamp: new Date().toISOString() };
}

function requireAuth(request: Request): Response | null {
  if (!request.headers.get('Authorization')) {
    return HttpResponse.json(apiError('Unauthorized'), { status: 401 });
  }
  return null;
}

const PAGE_SIZE = 10;

function pagedResponse(all: Notification[], page: number) {
  const start = page * PAGE_SIZE;
  const content = all.slice(start, start + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  return {
    content,
    totalPages,
    totalElements: all.length,
    number: page,
    size: PAGE_SIZE,
    first: page === 0,
    last: page >= totalPages - 1,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

// CLIENT-NOTIF-1: two unread (one aggregated to 2 distinct actors), one
// already-read — exercises getNotificationText's "and N others" branch, the
// mark-as-read flow, and a row that starts out dimmed. entityId matches
// mockSession.id (1) so clicking a row's `/matches?session=1` deep link
// resolves against the same session fixture MatchesPage.test.tsx already uses.
function defaultNotificationsState(): Notification[] {
  return [
    {
      id: 1,
      type: 'session.comment.created',
      entityType: 'SESSION',
      entityId: String(mockSession.id),
      actorIds: [mockFriend.id, 'hana-kim'],
      actorCount: 2,
      isRead: false,
      createdAt: '2026-08-18T08:00:00',
      updatedAt: '2026-08-18T08:00:00',
      actors: [
        { id: mockFriend.id, fullName: mockFriend.fullName },
        { id: 'hana-kim', fullName: 'Hana Kim' },
      ],
      entityTitle: mockSession.title,
    },
    {
      id: 2,
      type: 'session.join_request.created',
      entityType: 'SESSION',
      entityId: String(mockSession.id),
      actorIds: [mockFriend.id],
      actorCount: 1,
      isRead: false,
      createdAt: '2026-08-17T08:00:00',
      updatedAt: '2026-08-17T08:00:00',
      actors: [{ id: mockFriend.id, fullName: mockFriend.fullName }],
      entityTitle: mockSession.title,
    },
    {
      id: 3,
      type: 'session.join_request.approved',
      entityType: 'SESSION',
      entityId: String(mockSession.id),
      actorIds: [],
      actorCount: 1,
      isRead: true,
      createdAt: '2026-08-16T08:00:00',
      updatedAt: '2026-08-16T08:00:00',
      actors: [],
      entityTitle: mockSession.title,
    },
  ];
}

// MSW-1: session-keyed, same reasoning as feed.ts's feedSessions.
const notificationSessions = createSessionStore(defaultNotificationsState);

export const notificationHandlers: HttpHandler[] = [
  http.get('/api/notifications', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '0');
    const sessionId = sessionIdFromRequest(request);
    const all = getOverrides(sessionId).notificationsEmpty ? [] : notificationSessions.get(sessionId);
    return HttpResponse.json(apiResponse(pagedResponse(all, page), 'Notifications retrieved successfully'));
  }),

  http.get('/api/notifications/unread-count', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = sessionIdFromRequest(request);
    if (getOverrides(sessionId).notificationsEmpty) {
      return HttpResponse.json(apiResponse(0, 'Unread count retrieved successfully'));
    }
    const all = notificationSessions.get(sessionId);
    const count = all.filter((n) => !n.isRead).length;
    return HttpResponse.json(apiResponse(count, 'Unread count retrieved successfully'));
  }),

  http.put('/api/notifications/:notificationId/read', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const notificationId = Number(params.notificationId);
    const sessionId = sessionIdFromRequest(request);
    const all = notificationSessions.get(sessionId);
    const notification = all.find((n) => n.id === notificationId);
    if (!notification) {
      return HttpResponse.json(apiError('Notification not found'), { status: 404 });
    }
    notification.isRead = true;
    return HttpResponse.json(apiResponse(null, 'Notification marked read'));
  }),
];

/**
 * Test-only seed — lets a spec replace one session's notification list
 * wholesale (CLIENT-NOTIF-2's paginated fixture), same
 * `seedPostsState`/`seedJoinRequestsState` shape. Mutates the array in place
 * (rather than re-assigning) since `notificationSessions` stores
 * `Notification[]` directly, not a wrapper object — the PUT /read handler
 * above already relies on `.get()` returning a live reference the same way.
 */
export function seedNotificationsState(sessionId: string, notifications: Notification[]): void {
  const state = notificationSessions.get(sessionId);
  state.length = 0;
  state.push(...notifications);
}

/** Test-only reset — used by the mock server's `/__mock/sessions/:id/reset`. */
export function resetNotificationHandlersState(sessionId: string): void {
  notificationSessions.reset(sessionId);
}
