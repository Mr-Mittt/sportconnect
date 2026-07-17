import type { Page } from '@playwright/test';
import type { User } from '../../src/features/auth/types.ts';
import type {
  Comment,
  Group,
  GroupSearchResult,
  Hashtag,
  JoinRequest,
  PageResponse,
  Post,
} from '../../src/features/feed/types.ts';
import { hoursAgo, hoursFromNow } from '../../src/shared/lib/mockClock.ts';
import type { UserSportProfileResponse } from '../../src/shared/types/sport.ts';
import { MOCK_SERVER_URL } from './mockServerConfig.ts';

// Reused across AUTH-8 and FEED-10 rather than each test inventing its own
// ad-hoc response shapes (per MSW-0's acceptance criteria).
export const mockUser: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER'],
};

export const mockPassword = 'password123';
export const mockAccessToken = 'mock-access-token';

// A distinct refresh-token string used only to simulate the httpOnly cookie
// round-trip (set on login/register/refresh, checked on refresh/logout).
// Real tests never read this directly — the browser handles the cookie.
export const mockRefreshToken = 'mock-refresh-token';

// SPORT-1 fixtures: mockUser at the 3-sport cap (sportIds match mockPost's
// Soccer=5, mockBasketballPost's Basketball=6, plus Tennis=2 — see
// sportIdMap.ts's INSERT-order note) — keeps HF-11's step 7 "Add sport is
// aria-disabled at cap" assertion true now that SportSwitcher's data is real.
export const mockSportProfiles: UserSportProfileResponse[] = [
  {
    id: 1,
    userId: mockUser.id,
    sportId: 5,
    sportName: 'Soccer',
    skillLevel: 'intermediate',
    yearsOfExperience: 4,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  },
  {
    id: 2,
    userId: mockUser.id,
    sportId: 6,
    sportName: 'Basketball',
    skillLevel: 'beginner',
    yearsOfExperience: 1,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  },
  {
    id: 3,
    userId: mockUser.id,
    sportId: 2,
    sportName: 'Tennis',
    skillLevel: 'advanced',
    yearsOfExperience: 8,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  },
];

// Feed/groups/hashtags fixtures (FEED-0) — reused by feed.ts's handlers and
// by any future FEED-1..FEED-10 e2e spec, same reasoning as the auth
// fixtures above.
export const mockGroup: Group = {
  id: 1,
  // 5, not 1 — matches mockPost/mockGroupPost's sportId (the real `sports`
  // table's Soccer row; see mockPost's own note on the football<->soccer
  // naming gap). Was 1 (Badminton) before FEED-4, which is the first ticket
  // to filter groups by sportId — that value never lined up with this
  // group's own "Friday Night Football" theming or its posts' sportId, so a
  // sport-filtered group switcher would never have shown it under Football.
  sportId: 5,
  groupName: 'Friday Night Football',
  description: 'Weekly 5-a-side, all skill levels welcome.',
  avatarUrl: null,
  coverUrl: null,
  isPrivate: false,
  isActive: true,
  createdBy: mockUser.id,
  createdByFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  memberCount: 12,
  currentUserRole: 'group_member',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
  pinnedPosts: null,
};

// FEED-10: a second pre-seeded group where the test user is the owner (not
// just a member, like mockGroup) — the dedicated fixture for asserting
// CreatePostForm's "Broadcast" toggle appears for an owner/admin and doesn't
// for a plain member. sportId 2 (Tennis, one of mockSportProfiles' 3 sports)
// deliberately differs from mockGroup's Soccer (5), so both are reachable
// under distinct sport pills rather than colliding under the same filter.
export const mockOwnedGroup: Group = {
  id: 3,
  sportId: 2,
  groupName: 'Weekend Tennis Ladder',
  description: 'Casual ladder, singles and doubles.',
  avatarUrl: null,
  coverUrl: null,
  isPrivate: false,
  isActive: true,
  createdBy: mockUser.id,
  createdByFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  memberCount: 6,
  currentUserRole: 'group_owner',
  createdAt: '2026-06-05T10:00:00',
  updatedAt: '2026-06-05T10:00:00',
  pinnedPosts: null,
};

export const mockPost: Post = {
  id: 1,
  userId: mockUser.id,
  userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  userAvatarUrl: null,
  postType: 'USER_FEED',
  groupId: null,
  content: 'Great match today! #fridayrun',
  latitude: null,
  longitude: null,
  locationName: null,
  // 5, not 1 — the real `sports` table has no "Football" row, only "Soccer"
  // (id 5, confirmed via V003__create_sports_tables.sql's INSERT order).
  // FEED-1's temporary sportId<->SportKey map treats them as the same sport;
  // this fixture needs the real id to filter correctly under that map.
  sportId: 5,
  sportName: 'Soccer',
  visibility: 'public',
  media: [],
  // No leading '#' — matches the real backend's extraction/storage format
  // (verified against a live backend, 2026-07-13), not HF-0's mock-data
  // convention, which does include '#'.
  hashtags: ['fridayrun'],
  previewComments: [],
  likeCount: 3,
  commentCount: 1,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: '2026-07-13T09:00:00',
  updatedAt: '2026-07-13T09:00:00',
  broadcastEndTime: null,
};

export const mockGroupPost: Post = {
  ...mockPost,
  id: 2,
  postType: 'GROUP_POST',
  groupId: mockGroup.id,
  content: 'Who is in for Friday? #fridayrun',
  createdAt: '2026-07-13T08:00:00',
  updatedAt: '2026-07-13T08:00:00',
};

// A friend's post, not the logged-in test user's — covers the "no delete
// menu on someone else's post" case and gives the feed a second sport
// (basketball, sportId 6) so sport-filtering has something real to filter.
export const mockBasketballPost: Post = {
  ...mockPost,
  id: 4,
  userId: '22222222-2222-4222-8222-222222222222',
  userFullName: 'Priya Shah',
  content: 'Looking for 2 more players for Sunday pickup at Riverside courts. #pickup',
  hashtags: ['pickup'],
  sportId: 6,
  sportName: 'Basketball',
  likeCount: 9,
  commentCount: 6,
  createdAt: '2026-07-13T06:00:00',
  updatedAt: '2026-07-13T06:00:00',
};

export const mockBroadcastPost: Post = {
  ...mockPost,
  id: 3,
  postType: 'GROUP_BROADCAST',
  groupId: mockGroup.id,
  content: 'Pitch is booked for 7pm — see you all there!',
  hashtags: [],
  createdAt: '2026-07-13T07:00:00',
  updatedAt: '2026-07-13T07:00:00',
  // Computed relative to load time, not hardcoded (FEED-10 fix) — the
  // previous hardcoded '2026-07-14T07:00:00' had silently drifted into the
  // past relative to "today" by the time this was found, so a genuine expiry
  // filter (added in FEED-10 for the /posts/broadcast handler) would have
  // wrongly excluded this "active" fixture. Never hardcode a broadcast expiry
  // date for the same reason mockClock.ts's matches don't.
  broadcastEndTime: hoursFromNow(24),
};

// FEED-10: a second broadcast, genuinely expired, for the
// `/posts/broadcast` handler's expiry filter to exclude — proves the
// exclusion is a real filter over multiple candidates, not just "we didn't
// put it in the array."
export const mockExpiredBroadcastPost: Post = {
  ...mockPost,
  id: 5,
  postType: 'GROUP_BROADCAST',
  groupId: mockGroup.id,
  content: 'Last week: pitch was booked for 7pm.',
  hashtags: [],
  createdAt: '2026-07-06T07:00:00',
  updatedAt: '2026-07-06T07:00:00',
  broadcastEndTime: hoursAgo(24),
};

export const mockHashtag: Hashtag = {
  id: 1,
  tag: 'fridayrun', // no leading '#' — see mockPost.hashtags' note above
  usageCount: 12,
};

// FEED-5 fixtures: a public group the test user has NOT joined yet
// (distinct sportId from mockGroup so sport-filtered search has something
// real to filter), for exercising the "Request to join" flow.
export const mockPublicGroup: GroupSearchResult = {
  id: 2,
  sportId: 6, // Basketball, same id as mockBasketballPost
  groupName: 'Riverside Hoopers',
  description: 'Pickup games every weekend.',
  avatarUrl: null,
  memberCount: 8,
  createdByFullName: 'Priya Shah',
  isMember: false,
};

export const mockJoinRequest: JoinRequest = {
  id: 1,
  groupId: mockPublicGroup.id,
  groupName: mockPublicGroup.groupName,
  userId: mockUser.id,
  userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  userAvatarUrl: null,
  status: 'pending',
  message: null,
  reviewedBy: null,
  reviewedByFullName: null,
  reviewedAt: null,
  createdAt: '2026-07-15T00:00:00',
  updatedAt: '2026-07-15T00:00:00',
};

// FEED-2 comment fixtures. mockComment is mockPost's one existing comment
// (mockPost.commentCount is 1) so the two stay consistent for any test
// asserting on both.
export const mockComment: Comment = {
  id: 1,
  postId: mockPost.id,
  userId: 'priya-shah',
  userFullName: 'Priya Shah',
  userAvatarUrl: null,
  content: 'Nice one, count me in for next week!',
  parentCommentId: null,
  likeCount: 1,
  replyCount: 0,
  isLikedByCurrentUser: false,
  replies: [],
  createdAt: '2026-07-13T09:30:00',
  updatedAt: '2026-07-13T09:30:00',
};

/** Builds a Spring Data `Page<T>`-shaped response from a full content array. */
export function mockPageResponse<T>(content: T[]): PageResponse<T> {
  return {
    content,
    totalPages: 1,
    totalElements: content.length,
    number: 0,
    size: Math.max(content.length, 20),
    first: true,
    last: true,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

/**
 * Gets a spec's page into an authenticated state on `targetPath` (default
 * `/`), before that route (behind ProtectedRoute, AUTH-4) is asserted on.
 * AUTH-3's useSessionBootstrap fires POST /auth/refresh on every app mount,
 * so any protected route needs a valid session established first.
 *
 * Drives the real LoginForm rather than a raw `fetch()` or
 * `context.addCookies()` — go to `targetPath` directly while logged out.
 * ProtectedRoute redirects to /login carrying `targetPath` as the
 * redirect-back target. Then log in through the UI: `useLogin`'s
 * `onSuccess` calls `authStore.setSession()` directly in memory and
 * navigates back to `targetPath` via React Router's `navigate()` — an
 * in-app transition, not a reload.
 *
 * MSW-1: the mock server is a real listening process (no per-navigation
 * setup handshake), so there's no readiness race left to work around here —
 * this function no longer needs `page.evaluate('window.__mswReady')` before
 * interacting with the login form, unlike the old Service-Worker version.
 * `Set-Cookie` on a successful login is now a genuine response header the
 * browser's own cookie jar applies, so the session also survives a reload
 * from this point on (see the new reload-persistence test in
 * auth-journey.spec.ts) — no separate cookie-mirroring step needed.
 *
 * Must be called with a page from the mock-server-wired `test` in `test.ts`.
 */
export async function seedAuthenticatedSession(page: Page, targetPath = '/'): Promise<void> {
  await page.goto(targetPath);
  await page.waitForURL(/\/login/, { timeout: 10000 });
  await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
  await page.getByLabel('Password', { exact: true }).fill(mockPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(
    (url) => url.pathname + url.search === targetPath || (targetPath === '/' && url.pathname === '/'),
    { timeout: 10000 },
  );
}

/**
 * MSW-1: posts to the mock server's admin API (`/__mock/sessions/:id/...`)
 * — replaces the old `page.addInitScript` + dynamic-import +
 * `worker.use()` mechanism every `simulate*OnNextLoad`/`seed*OnNextLoad`
 * helper below used. Plain Node-side HTTP calls now, no browser JS
 * injection: call before `page.goto()`/`page.reload()` (or mid-test, for
 * `simulateCreatePostFailOnce`, which fires on the *next* matching request
 * regardless of navigation) with the test's `mockSessionId` (from `test.ts`'s
 * fixture) — the header that same id travels on is what ties a page's
 * requests back to this override.
 */
async function postAdmin(sessionId: string, path: string): Promise<void> {
  const response = await fetch(
    `${MOCK_SERVER_URL}/__mock/sessions/${encodeURIComponent(sessionId)}/${path}`,
    { method: 'POST' },
  );
  if (!response.ok) {
    throw new Error(`Mock server admin call failed: POST ${path} -> ${response.status}`);
  }
}

/**
 * Simulates a refresh token that was valid at login but revoked/expired
 * server-side sometime after (AUTH-8's step 6 scenario). Call this, then
 * trigger the request that should hit the expired session (a navigation, or
 * an already-mounted page's own retry), to simulate the scenario.
 */
export async function simulateExpiredSessionOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/refreshExpired');
}

/**
 * For FEED-1's visual-regression empty state — HF-10b's own delta said to
 * replace the old `?visual-state=empty` seam (removed from
 * useHomeFeedData) with an MSW override once the feed went real. Call this,
 * then navigate; the next `GET /posts/feed` for this session returns zero
 * posts.
 */
export async function seedEmptyFeedOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/feedEmpty');
}

/**
 * FEED-10 step 1: seeds a genuinely paginated `GET /posts/feed` (21 posts,
 * real `page`/`size` handling) — lets the "Load more" journey step fetch a
 * real second page instead of a single-page fixture that always fits.
 */
export async function seedPaginatedFeedOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'seed-paginated-feed');
}

/**
 * FEED-10's SPORT-1 delta step — for a user with zero sport profiles
 * (rather than the primary fixture user's 3-sport cap, needed elsewhere in
 * the same journey).
 */
export async function seedZeroSportProfilesOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/sportProfilesEmpty');
}

/**
 * FEED-8 error-simulation helpers — one per real-data surface FEED-8
 * hardened. Call before `page.goto()`; the next matching request for this
 * session returns a 500, so the real query's `isError` (or, for the feed's
 * pagination-edge case, `isFetchNextPageError` once a first successful page
 * is already loaded) flips and the corresponding error+retry UI renders.
 * FEED-10's E2E journey is the intended consumer.
 */
export async function simulateFeedErrorOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/feedError');
}

export async function simulateTrendingErrorOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/trendingError');
}

export async function simulateBroadcastsErrorOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/broadcastsError');
}

export async function simulateGroupsErrorOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/groupsError');
}

/**
 * FEED-10's required "at least one MSW-simulated error response" — a
 * one-time failure on the next `POST /posts` for this session (consumed on
 * read, see overrides.ts's `consumeCreatePostFailOnce`): a retry with the
 * same content succeeds normally. MSW-1: replaces failCreatePostOnce.ts's
 * `overrideCreatePostToFailOnce`, previously invoked via
 * `page.evaluate` against `window.__mswWorker` directly since the failure
 * needed to apply mid-test, not on next navigation — now a plain admin call,
 * which works identically whether called before or mid-test since it
 * doesn't depend on a navigation at all.
 */
export async function simulateCreatePostFailOnce(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/createPostFailOnce');
}
