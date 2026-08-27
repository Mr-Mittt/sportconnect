import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type { FriendRequest, FriendshipStatus, FriendUser } from '../../../src/features/friends/types.ts';
import {
  mockFriend,
  mockIncomingFriendRequest,
  mockMyProfile,
  mockSearchResultUser,
  mockSentFriendRequest,
  mockUser,
} from '../fixtures.ts';
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

// A small local "directory" the handlers resolve ids against — GET
// /users/:userId, the search endpoint, and accept's synthesized friend row
// all need a full FriendUser shape for a bare id, not just whatever partial
// fields happen to be on a FriendRequest row. Real ids used across
// fixtures.ts (hana-kim/diego-alvarez are the two pending-request
// counterparts; owen-clarke is the search-only stranger).
const KNOWN_USERS: Record<string, FriendUser & { username: string }> = {
  [mockFriend.id]: { ...mockFriend, username: 'priyashah' },
  'hana-kim': { id: 'hana-kim', fullName: 'Hana Kim', avatarUrl: null, coverUrl: null, bio: null, username: 'hanakim' },
  'diego-alvarez': {
    id: 'diego-alvarez',
    fullName: 'Diego Alvarez',
    avatarUrl: null,
    coverUrl: null,
    bio: null,
    username: 'diegoalvarez',
  },
  [mockSearchResultUser.id]: {
    id: mockSearchResultUser.id,
    fullName: mockSearchResultUser.fullName,
    avatarUrl: null,
    coverUrl: null,
    bio: null,
    username: mockSearchResultUser.username,
  },
};

interface FriendsSession {
  friendsState: FriendUser[];
  receivedRequestsState: FriendRequest[];
  sentRequestsState: FriendRequest[];
  nextRequestId: number;
}

// Stateful, same reasoning as groups.ts/sport.ts — accepting/declining/
// sending must actually change what the next GET returns, since the real
// mutations invalidate and refetch rather than trusting a fixed responder.
function defaultFriendsSession(): FriendsSession {
  return {
    friendsState: [mockFriend],
    receivedRequestsState: [mockIncomingFriendRequest],
    sentRequestsState: [mockSentFriendRequest],
    nextRequestId: 100,
  };
}

const friendsSessions = createSessionStore(defaultFriendsSession);

function resolveFriendshipStatus(session: FriendsSession, userId: string): FriendshipStatus {
  if (session.friendsState.some((friend) => friend.id === userId)) return 'FRIENDS';
  if (session.receivedRequestsState.some((req) => req.senderId === userId)) return 'PENDING_RECEIVED';
  if (session.sentRequestsState.some((req) => req.receiverId === userId)) return 'PENDING_SENT';
  return 'NONE';
}

export const friendHandlers: HttpHandler[] = [
  http.get('/api/users/friends', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = friendsSessions.get(sessionIdFromRequest(request));
    return HttpResponse.json(apiResponse(session.friendsState, 'Friends retrieved'));
  }),

  http.get('/api/users/friends/requests/received', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = friendsSessions.get(sessionIdFromRequest(request));
    return HttpResponse.json(apiResponse(session.receivedRequestsState, 'Pending received requests retrieved'));
  }),

  http.get('/api/users/friends/requests/sent', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = friendsSessions.get(sessionIdFromRequest(request));
    return HttpResponse.json(apiResponse(session.sentRequestsState, 'Pending sent requests retrieved'));
  }),

  http.post('/api/users/friends/requests', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const { receiverId } = (await request.json()) as { receiverId: string };
    const session = friendsSessions.get(sessionIdFromRequest(request));
    if (session.friendsState.some((friend) => friend.id === receiverId)) {
      return HttpResponse.json(apiError('You are already friends'), { status: 400 });
    }
    if (session.sentRequestsState.some((req) => req.receiverId === receiverId)) {
      return HttpResponse.json(apiError('Friend request already pending'), { status: 400 });
    }
    const receiver = KNOWN_USERS[receiverId];
    session.sentRequestsState = [
      ...session.sentRequestsState,
      {
        requestId: `req-${session.nextRequestId++}`,
        senderId: mockUser.id,
        senderName: `${mockUser.firstName} ${mockUser.lastName}`,
        receiverId,
        receiverName: receiver?.fullName ?? 'Unknown',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      },
    ];
    return HttpResponse.json(apiResponse(null, 'Friend request sent'));
  }),

  http.put('/api/users/friends/requests/:requestId/accept', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const requestId = String(params.requestId);
    const session = friendsSessions.get(sessionIdFromRequest(request));
    const accepted = session.receivedRequestsState.find((req) => req.requestId === requestId);
    if (accepted === undefined) {
      return HttpResponse.json(apiError('Friend request not found'), { status: 404 });
    }
    session.receivedRequestsState = session.receivedRequestsState.filter(
      (req) => req.requestId !== requestId,
    );
    const newFriend: FriendUser = KNOWN_USERS[accepted.senderId] ?? {
      id: accepted.senderId,
      fullName: accepted.senderName,
      avatarUrl: null,
      coverUrl: null,
      bio: null,
    };
    session.friendsState = [...session.friendsState, newFriend];
    return HttpResponse.json(apiResponse(null, 'Friend request accepted'));
  }),

  http.put('/api/users/friends/requests/:requestId/decline', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const requestId = String(params.requestId);
    const session = friendsSessions.get(sessionIdFromRequest(request));
    session.receivedRequestsState = session.receivedRequestsState.filter(
      (req) => req.requestId !== requestId,
    );
    return HttpResponse.json(apiResponse(null, 'Friend request declined'));
  }),

  // Public — no auth required (U6, ROLE_USER-gated server-side, but this
  // fixture doesn't need to simulate the 403-vs-401 nuance; every e2e
  // session is already authenticated by the time it reaches Add mode).
  http.get('/api/users/search', ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('q') ?? '';
    if (keyword.trim().length < 2) {
      return HttpResponse.json(apiError('Search keyword must be at least 2 characters'), { status: 400 });
    }
    const session = friendsSessions.get(sessionIdFromRequest(request));
    const results = Object.values(KNOWN_USERS)
      .filter((user) => user.id !== mockUser.id)
      .filter((user) => user.fullName.toLowerCase().includes(keyword.trim().toLowerCase()))
      .map((user) => ({
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        city: null,
        country: null,
        friendshipStatus: resolveFriendshipStatus(session, user.id),
      }));
    return HttpResponse.json(
      apiResponse({
        content: results,
        totalPages: 1,
        totalElements: results.length,
        number: 0,
        size: 20,
        first: true,
        last: true,
        numberOfElements: results.length,
        empty: results.length === 0,
      }),
    );
  }),

  // Public — GET /api/users/{userId}. PROFILE-7: the real endpoint always
  // returns the full UserResponse regardless of caller — this mock now does
  // too for the logged-in user's own id (useMyProfile's only caller), while
  // every other id still resolves through the narrow KNOWN_USERS directory
  // (every other consumer of this endpoint only ever narrows down to
  // FriendUser, so the extra fields are simply unused there).
  http.get('/api/users/:userId', ({ params }) => {
    const userId = String(params.userId);
    if (userId === mockUser.id) {
      return HttpResponse.json(apiResponse(mockMyProfile, 'User retrieved successfully'));
    }
    const user = KNOWN_USERS[userId];
    if (user === undefined) {
      return HttpResponse.json(apiError('User not found'), { status: 404 });
    }
    const profile: FriendUser = {
      id: user.id,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      coverUrl: user.coverUrl,
      bio: user.bio,
    };
    return HttpResponse.json(apiResponse(profile, 'User retrieved successfully'));
  }),
];

/** Test-only reset — used by the mock server's `/__mock/sessions/:id/reset`. */
export function resetFriendHandlersState(sessionId: string): void {
  friendsSessions.reset(sessionId);
}
