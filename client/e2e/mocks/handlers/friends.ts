import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type {
  FriendRequest,
  FriendshipStatus,
  FriendUser,
  UserInfo,
} from '../../../src/features/friends/types.ts';
import type { UpdateProfilePayload } from '../../../src/features/profile/profileEditDraft.ts';
import type { UserResponse } from '../../../src/features/profile/types.ts';
import {
  mockFriend,
  mockIncomingFriendRequest,
  mockCodeLimitEmail,
  mockDownEmail,
  mockMyProfile,
  mockRaceEmail,
  mockSameAsCurrentEmail,
  mockSearchResultUser,
  mockSentFriendRequest,
  mockTakenEmail,
  mockTooSoonEmail,
  mockUser,
  mockVerificationCode,
  mockExpiredCode,
} from '../fixtures.ts';
import { getOverrides } from '../overrides.ts';
import { createSessionStore, sessionIdFromRequest } from '../sessionStore.ts';
import { rejectProof } from './auth.ts';
import { mockCountries, mockRegionsByCountryId } from './reference.ts';

function apiResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

function apiError(message: string, errorCode?: string, errorParams?: Record<string, unknown>): ApiResponse<null> {
  return { success: false, message, data: null, timestamp: new Date().toISOString(), errorCode, errorParams };
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
// `activeSportIds` (U15) — sport ids the user holds an ACTIVE profile for.
// Ids match `mockSportCatalog` in sport.ts (Badminton=1, Pickleball=3).
// SPORT-11: `GET /api/users/:userId` now carries this, and it's the only
// source of another user's sports for `FriendProfilePanel`'s pill row.
const KNOWN_USERS: Record<
  string,
  FriendUser & { username: string; activeSportIds: number[] }
> = {
  [mockFriend.id]: { ...mockFriend, username: 'priyashah', activeSportIds: [1, 3] },
  'hana-kim': {
    id: 'hana-kim',
    fullName: 'Hana Kim',
    avatarUrl: null,
    coverUrl: null,
    bio: null,
    username: 'hanakim',
    activeSportIds: [3],
  },
  'diego-alvarez': {
    id: 'diego-alvarez',
    fullName: 'Diego Alvarez',
    avatarUrl: null,
    coverUrl: null,
    bio: null,
    username: 'diegoalvarez',
    activeSportIds: [],
  },
  [mockSearchResultUser.id]: {
    id: mockSearchResultUser.id,
    fullName: mockSearchResultUser.fullName,
    avatarUrl: null,
    coverUrl: null,
    bio: null,
    username: mockSearchResultUser.username,
    activeSportIds: [1],
  },
};

interface FriendsSession {
  friendsState: FriendUser[];
  receivedRequestsState: FriendRequest[];
  sentRequestsState: FriendRequest[];
  nextRequestId: number;
  // PROFILE-8: the logged-in user's own editable profile row — `/profile`'s
  // Edit Profile modal (`useUpdateMyProfile`, `PUT /api/users/{userId}/profile`)
  // needs a save to actually change what the next GET /api/users/me (U11;
  // was GET /api/users/{userId}) returns, same "small stateful fake backend"
  // reasoning as every other mutable fixture in this suite. Didn't exist
  // before this ticket — PROFILE-7 only ever needed the GET side (a clean,
  // unsaved load).
  myProfileState: UserResponse;
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
    myProfileState: mockMyProfile,
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
      return HttpResponse.json(apiError('You are already friends', 'ALREADY_FRIENDS'), { status: 409 });
    }
    if (session.sentRequestsState.some((req) => req.receiverId === receiverId)) {
      return HttpResponse.json(apiError('Friend request already pending', 'FRIEND_REQUEST_ALREADY_PENDING'), { status: 409 });
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
      return HttpResponse.json(apiError('Friend request not found', 'FRIEND_REQUEST_NOT_FOUND'), { status: 404 });
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

  // CLIENT-NOTIF-5: the sender withdrawing their own outgoing request
  // (`DELETE /api/users/friends/requests/{requestId}`, U1's cancelFriendRequest).
  http.delete('/api/users/friends/requests/:requestId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const requestId = String(params.requestId);
    const session = friendsSessions.get(sessionIdFromRequest(request));
    session.sentRequestsState = session.sentRequestsState.filter((req) => req.requestId !== requestId);
    return HttpResponse.json(apiResponse(null, 'Friend request cancelled'));
  }),

  // FRIEND-2 (unfriend enhancement): `DELETE /api/users/friends/{friendId}`
  // (U1's removeFriend) — `friendId` is the other person's user id, a single
  // path segment, so this never shadows the `requests/:requestId` route
  // above. 409 NOT_FRIENDS (U21) if the pair are not currently friends, mirroring the real
  // service.
  http.delete('/api/users/friends/:friendId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const friendId = String(params.friendId);
    const session = friendsSessions.get(sessionIdFromRequest(request));
    if (!session.friendsState.some((friend) => friend.id === friendId)) {
      return HttpResponse.json(apiError('You are not friends with this user', 'NOT_FRIENDS'), { status: 409 });
    }
    session.friendsState = session.friendsState.filter((friend) => friend.id !== friendId);
    return HttpResponse.json(apiResponse(null, 'Friend removed'));
  }),

  // Public — no auth required (U6, ROLE_USER-gated server-side, but this
  // fixture doesn't need to simulate the 403-vs-401 nuance; every e2e
  // session is already authenticated by the time it reaches Add mode).
  http.get('/api/users/search', ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('q') ?? '';
    if (keyword.trim().length < 2) {
      return HttpResponse.json(apiError('Search keyword must be at least 2 characters', 'SEARCH_KEYWORD_TOO_SHORT', { min: 2 }), { status: 400 });
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

  // U11: the caller's own full profile moved to a dedicated self-only
  // endpoint (PROFILE-6's `useMyProfile` now calls this instead of
  // GET /api/users/{userId} with its own id). Requires auth, same as the
  // real endpoint.
  http.get('/api/users/me', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = sessionIdFromRequest(request);
    const session = friendsSessions.get(sessionId);
    // ACCOUNT-7: `emailUnverified` starts the account unverified, once.
    const overrides = getOverrides(sessionId);
    if (overrides.emailUnverified) {
      overrides.emailUnverified = false;
      session.myProfileState = { ...session.myProfileState, isEmailVerified: false };
    }
    return HttpResponse.json(apiResponse(session.myProfileState, 'User retrieved successfully'));
  }),

  // ACCOUNT-7 / backend U26: POST /api/users/me/email-change-code mails a 6-digit code to the new address
  // (60 s until a resend, 15 minutes valid) and sends nothing here. Refusals, in the real order: the address
  // is the account's own (400 NEW_EMAIL_SAME_AS_CURRENT), already registered (409), the daily limit (429),
  // the per-user resend lock (429, with the seconds left), Keycloak or Redis down (503). The fixture addresses
  // that trigger each are in fixtures.ts.
  http.post('/api/users/me/email-change-code', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = friendsSessions.get(sessionIdFromRequest(request));
    const body = (await request.json()) as { newEmail?: string };
    const address = body.newEmail?.trim() ?? '';
    if (address === '' || /\s/.test(address)) {
      return HttpResponse.json(apiError('Validation failed', 'VALIDATION_FAILED', { fields: { newEmail: 'must be a valid email' } }), {
        status: 400,
      });
    }
    if (address.toLowerCase() === (session.myProfileState.email ?? '').toLowerCase() || address === mockSameAsCurrentEmail) {
      return HttpResponse.json(apiError('That is already your email', 'NEW_EMAIL_SAME_AS_CURRENT'), { status: 400 });
    }
    if (address === mockTakenEmail) {
      return HttpResponse.json(apiError('Email already registered', 'EMAIL_ALREADY_REGISTERED'), { status: 409 });
    }
    if (address === mockCodeLimitEmail) {
      return HttpResponse.json(apiError('Too many codes today', 'NEW_EMAIL_CODE_LIMIT_REACHED', { seconds: 43200 }), { status: 429 });
    }
    if (address === mockTooSoonEmail) {
      return HttpResponse.json(apiError('A code was just sent', 'VERIFICATION_RESEND_TOO_SOON', { seconds: 42 }), { status: 429 });
    }
    if (address === mockDownEmail) {
      return HttpResponse.json(apiError('Service unavailable', 'SERVICE_UNAVAILABLE'), { status: 503 });
    }
    return HttpResponse.json(apiResponse({ resendAfterSeconds: 60, expiresInSeconds: 900 }, 'Verification code sent'));
  }),

  // ACCOUNT-7 / backend U26: PUT /api/users/me/email. Order of the real service: both codes are only checked
  // (the caller's proof first, then the new-address code, whose refusals carry purpose NEW_EMAIL), then the
  // address is written. A taken address answers 409 (the real server drops the new-address code, so the mock
  // does too: `mockRaceEmail` is refused only here), Keycloak down is 503 and both codes stay usable. On
  // success the account is on the new address, verified, and without a Google avatar.
  http.put('/api/users/me/email', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = friendsSessions.get(sessionIdFromRequest(request));
    const body = (await request.json()) as {
      newEmail?: string;
      newEmailCode?: string;
      currentPassword?: string;
      verificationCode?: string;
    };
    const address = body.newEmail?.trim() ?? '';
    if (address === '' || !body.newEmailCode?.trim()) {
      return HttpResponse.json(apiError('Validation failed', 'VALIDATION_FAILED'), { status: 400 });
    }
    const rejected = rejectProof(body, 'CHANGE_EMAIL');
    if (rejected) return rejected;
    if (body.newEmailCode === mockExpiredCode) {
      return HttpResponse.json(apiError('The code has expired', 'VERIFICATION_CODE_EXPIRED', { purpose: 'NEW_EMAIL' }), { status: 400 });
    }
    if (body.newEmailCode !== mockVerificationCode) {
      return HttpResponse.json(apiError('The code is not correct', 'VERIFICATION_CODE_INVALID', { purpose: 'NEW_EMAIL' }), { status: 400 });
    }
    if (address.toLowerCase() === (session.myProfileState.email ?? '').toLowerCase()) {
      return HttpResponse.json(apiError('That is already your email', 'NEW_EMAIL_SAME_AS_CURRENT'), { status: 400 });
    }
    if (address === mockRaceEmail || address === mockTakenEmail) {
      return HttpResponse.json(apiError('Email already registered', 'EMAIL_ALREADY_REGISTERED'), { status: 409 });
    }
    if (address === mockDownEmail) {
      return HttpResponse.json(apiError('Service unavailable', 'SERVICE_UNAVAILABLE'), { status: 503 });
    }
    session.myProfileState = { ...session.myProfileState, email: address, isEmailVerified: true, avatarUrl: null };
    return HttpResponse.json(apiResponse(null, 'Email changed successfully'));
  }),

  // ACCOUNT-7 / auth A33: POST /api/users/me/email-verification mails the link. An already verified account
  // answers alreadyVerified: true and sends nothing; the mock keeps no lock, so a second press answers 200 again.
  http.post('/api/users/me/email-verification', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = friendsSessions.get(sessionIdFromRequest(request));
    if (session.myProfileState.email === null) {
      return HttpResponse.json(apiError('No email', 'VERIFICATION_EMAIL_UNAVAILABLE'), { status: 400 });
    }
    return HttpResponse.json(
      apiResponse(
        { alreadyVerified: session.myProfileState.isEmailVerified, resendAfterSeconds: session.myProfileState.isEmailVerified ? 0 : 60 },
        'Verification email sent',
      ),
    );
  }),

  // GET /api/users/{userId}. U11: authenticated (no longer public) and
  // always returns the safe PII-free subset (UserInfoResponse) regardless of
  // who's asking — including the caller's own id, which now resolves through
  // GET /api/users/me instead. FRIEND-2: `useUserInfo` types this 1:1 with
  // `UserInfoResponse`, so the mock carries `username` too (KNOWN_USERS
  // already has it) even though FriendProfilePanel doesn't render it.
  // U15/SPORT-11: also carries `activeSportIds` — FriendProfilePanel's sport
  // pill row is sourced from it now, not the removed
  // GET /api/sports/profiles/user/{userId}.
  http.get('/api/users/:userId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const userId = String(params.userId);
    const user = KNOWN_USERS[userId];
    if (user === undefined) {
      return HttpResponse.json(apiError('User not found'), { status: 404 });
    }
    const profile: UserInfo = {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      avatarUrl: user.avatarUrl,
      coverUrl: user.coverUrl,
      bio: user.bio,
      activeSportIds: user.activeSportIds,
    };
    return HttpResponse.json(apiResponse(profile, 'User retrieved successfully'));
  }),

  // PROFILE-8: `/profile`'s Edit Profile modal (PROFILE-5/useUpdateMyProfile) — didn't exist
  // before this ticket. null-means-skip, mirroring `UserServiceImpl.updateProfile`'s real
  // behavior (`EditProfileModal`'s own `buildProfileUpdatePayload` already only ever sends
  // fields that changed, never `null`, so this handler doesn't need to special-case one).
  //
  // CLIENT-REF-3: `body.country`/`.city` are gone from `UpdateProfilePayload` — `countryId`/
  // `regionId` take their place, resolved into display names (`country`/`regionName`) from the
  // same `mockCountries`/`mockRegionsByCountryId` fixtures `reference.ts`'s handlers use, same
  // "small stateful fake backend" reasoning as `myProfileState` itself. `countryId` present means
  // `regionId` replaces the stored region — an absent `regionId` clears it (U16's "both together"
  // rule; `EditProfileModal`'s `applyGeoSelection` already always sends both when either changed).
  http.put('/api/users/:userId/profile', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const userId = String(params.userId);
    if (userId !== mockUser.id) {
      return HttpResponse.json(apiError('User not found'), { status: 404 });
    }
    const session = friendsSessions.get(sessionIdFromRequest(request));
    const body = (await request.json()) as UpdateProfilePayload;
    const current = session.myProfileState;

    // ACCOUNT-2 / U20: gender is a closed set. Absent/null = skip, "" = clear, otherwise exactly
    // MALE or FEMALE (case-sensitive) — anything else is a 400 and nothing is applied.
    if (body.gender !== undefined && body.gender !== null && body.gender !== '' && body.gender !== 'MALE' && body.gender !== 'FEMALE') {
      return HttpResponse.json(apiError('gender must be one of: MALE, FEMALE', 'GENDER_INVALID', { allowed: ['MALE', 'FEMALE'] }), { status: 400 });
    }

    let countryId = current.countryId;
    let regionId = current.regionId;
    if (body.countryId !== undefined) {
      countryId = body.countryId;
      regionId = body.regionId ?? null;
    } else if (body.regionId !== undefined) {
      regionId = body.regionId;
    }
    const country =
      countryId !== null ? (mockCountries.find((c) => c.id === countryId)?.name ?? current.country) : current.country;
    const regionName =
      regionId !== null
        ? (mockRegionsByCountryId[countryId ?? -1]?.find((r) => r.id === regionId)?.name ?? null)
        : null;

    // U25: the server saves a phone it cannot parse as typed with status INVALID instead of refusing it. The mock
    // stands in for libphonenumber with "9 to 15 digits"; blank clears both.
    let phoneNumber = current.phoneNumber;
    let phoneStatus = current.phoneStatus ?? null;
    if (body.phoneNumber !== undefined && body.phoneNumber !== null) {
      const typed = body.phoneNumber.trim();
      const digits = typed.replace(/D/g, '').length;
      phoneNumber = typed === '' ? null : typed;
      phoneStatus = typed === '' ? null : digits >= 9 && digits <= 15 ? 'VALID' : 'INVALID';
    }

    const updated: UserResponse = {
      ...current,
      ...body,
      phoneNumber,
      phoneStatus,
      gender: body.gender === undefined || body.gender === null ? current.gender : body.gender === '' ? null : body.gender,
      countryId,
      regionId,
      country,
      regionName,
      fullName: `${body.firstName ?? current.firstName} ${body.lastName ?? current.lastName}`,
    };
    session.myProfileState = updated;
    return HttpResponse.json(apiResponse(updated, 'Profile updated successfully'));
  }),
];

/** Test-only reset — used by the mock server's `/__mock/sessions/:id/reset`. */
export function resetFriendHandlersState(sessionId: string): void {
  friendsSessions.reset(sessionId);
}
