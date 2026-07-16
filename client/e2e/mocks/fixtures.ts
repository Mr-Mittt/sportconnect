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
import type { UserSportProfileResponse } from '../../src/shared/types/sport.ts';

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
  broadcastEndTime: '2026-07-14T07:00:00',
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
 * Deliberately drives the real LoginForm rather than a raw `fetch()` or
 * `context.addCookies()`. Two things ruled those out:
 *  - `context.addCookies({ httpOnly: true, ... })` is invisible to MSW's
 *    `cookies` resolver arg (confirmed empirically). **Correction (AUTH-8):**
 *    the original note here attributed this to a localStorage-backed shadow
 *    store, which is inaccurate — `msw/lib/browser/` never references that
 *    module (grepped the installed package). The real behavior, re-verified
 *    for AUTH-8 with four targeted tests: within a single page's lifetime,
 *    login → refresh genuinely works (some in-page state does track the
 *    cookie correctly — a raw `fetch('/api/auth/login')` followed
 *    immediately by `fetch('/api/auth/refresh')`, no navigation in between,
 *    returns 200). But nothing survives an actual reload or fresh
 *    navigation: a `Set-Cookie` response header is never applied to the real
 *    browser cookie jar for a Service-Worker-mocked (or Playwright
 *    `route.fulfill()`-mocked) response at all, httpOnly or not, and
 *    `document.cookie` — which IS what `cookies` reads, not a shadow store —
 *    is consequently never populated either. MSW-0's doc claim that
 *    Set-Cookie "is processed by the browser exactly as if a real server had
 *    sent it" is wrong specifically for the across-reload case. See
 *    `seedRefreshCookieMirror` below for the one mechanism that does survive
 *    a reload, needed only when a spec must actually test that (this
 *    function doesn't need to — see next bullet).
 *  - A raw `fetch('/api/auth/login')` does work within the same page (see
 *    above), but a *subsequent* `page.goto()` still races AUTH-3's automatic
 *    bootstrap effect against MSW's per-navigation worker-ready handshake
 *    (`addInitScript` re-runs `worker.start()` on every navigation) — flaky
 *    under parallel workers (confirmed empirically: reliable alone, ~80%
 *    failure rate run in parallel).
 *
 * Instead: go to `targetPath` directly while logged out. ProtectedRoute
 * redirects to /login carrying `targetPath` as the redirect-back target —
 * this works deterministically regardless of whether THIS FIRST
 * navigation's own (expected-to-fail) bootstrap call actually got
 * intercepted by MSW or fell through entirely, since both outcomes are
 * "not logged in" and get handled identically. Then log in through the UI:
 * `useLogin`'s `onSuccess` calls `authStore.setSession()` directly in
 * memory and navigates back to `targetPath` via React Router's `navigate()`
 * — an in-app transition, not a reload, so there's no second bootstrap
 * fetch and no second race on the way back.
 *
 * Must be called with a page from the MSW-wired `test` in `test.ts`.
 */
export async function seedAuthenticatedSession(page: Page, targetPath = '/'): Promise<void> {
  await page.goto(targetPath);
  await page.waitForURL(/\/login/, { timeout: 10000 });
  await page.evaluate('window.__mswReady');
  await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
  await page.getByLabel('Password', { exact: true }).fill(mockPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(
    (url) => url.pathname + url.search === targetPath || (targetPath === '/' && url.pathname === '/'),
    { timeout: 10000 },
  );
}

/**
 * Seeds a JS-readable mirror of the refresh-token cookie so MSW's
 * `cookies` resolver arg (which reads `document.cookie` — see
 * seedAuthenticatedSession's corrected note above) can see it across a
 * `page.reload()`. This is the one mechanism that actually survives a
 * reload, because it's a genuine Playwright-managed browser cookie (not a
 * Set-Cookie response header, which is never honored for a mocked response
 * regardless of this flag).
 *
 * `httpOnly: false` is a deliberate test-only compromise: production code
 * never reads `document.cookie` either way (AUTH-0's own test asserts no
 * storage API is touched), so this doesn't weaken what's actually being
 * verified about the real httpOnly cookie contract — it only gives MSW's
 * mock visibility into what a real browser's actual (JS-invisible) cookie
 * jar would already hold at this point in a real session.
 *
 * Call after an authenticated session is established (e.g. after
 * seedAuthenticatedSession), before any navigation that needs the session to
 * survive.
 *
 * **Not currently exercised by any spec (AUTH-8).** A reload-persistence
 * test needs this cookie *and* a way to guarantee MSW's Service Worker
 * setup wins its race against the app's own bootstrap fetch on that same
 * reload — the second part isn't solved yet (see
 * `client/docs/BACKLOG_MVP.md` · **MSW-1**, filed to replace the
 * per-navigation Service Worker setup with a standalone mock server, which
 * would make this cookie unnecessary in the first place — a real server can
 * set real cookies a reload genuinely persists). This function is correct
 * and kept for when that lands, or for any other spec that needs a
 * reload-surviving session.
 */
export async function seedRefreshCookieMirror(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: 'refreshToken',
      value: mockRefreshToken,
      domain: 'localhost',
      path: '/api/auth',
      httpOnly: false,
    },
  ]);
}

/**
 * Registers a second init script (runs after test.ts's own, per Playwright's
 * addInitScript registration-order guarantee) that re-applies a "refresh
 * token expired" override to the MSW worker on the *next* navigation.
 *
 * A one-off `worker.use()` call made directly from the Node-side test
 * wouldn't survive a `page.reload()` — the worker instance itself is
 * recreated fresh on every navigation (see test.ts's own addInitScript
 * comment), so the override has to be re-applied via another init script
 * chained onto the same `window.__mswReady` promise, not a one-time runtime
 * call (AUTH-8).
 *
 * Call this, then trigger any navigation, to simulate a session that was
 * valid until this point and then expired/was revoked server-side.
 *
 * **Not currently exercised by any spec (AUTH-8).** A reload-triggered
 * version of AUTH-8's step 6 used this and turned out unreliable even in
 * normal, non-repeated suite runs — not just the per-navigation MSW-vs-app
 * race every reload risks (see `client/docs/BACKLOG_MVP.md` · **MSW-1**),
 * but a harder stuck state past that. AUTH-8's step 6 was rewritten to
 * simulate the same scenario via AUTH-5's 401-retry interceptor instead
 * (no reload needed at all — see `auth-journey.spec.ts`), which is what
 * ships today. This function is correct and kept for when MSW-1 lands and
 * a reload-based version becomes reliable.
 */
export async function simulateExpiredSessionOnNextLoad(page: Page): Promise<void> {
  await page.addInitScript(
    "window.__mswReady.then(() => import('/e2e/mocks/expireSession.ts')" +
      '.then(({ overrideRefreshToExpired }) => overrideRefreshToExpired(window.__mswWorker)));',
  );
}

/**
 * Same mechanism as simulateExpiredSessionOnNextLoad, for FEED-1's visual-
 * regression empty state — HF-10b's own delta said to replace the old
 * `?visual-state=empty` seam (removed from useHomeFeedData) with an MSW
 * override once the feed went real. Call this, then navigate; the next
 * `GET /posts/feed` on that page returns zero posts.
 */
export async function seedEmptyFeedOnNextLoad(page: Page): Promise<void> {
  await page.addInitScript(
    "window.__mswReady.then(() => import('/e2e/mocks/emptyFeed.ts')" +
      '.then(({ overrideFeedToEmpty }) => overrideFeedToEmpty(window.__mswWorker)));',
  );
}

/**
 * FEED-8 error-simulation helpers — same mechanism as
 * simulateExpiredSessionOnNextLoad/seedEmptyFeedOnNextLoad, one per real-data
 * surface FEED-8 hardened. Call before `page.goto()`; the next matching
 * request on that page returns a 500, so the real query's `isError` (or, for
 * the feed's pagination-edge case, `isFetchNextPageError` once a first
 * successful page is already loaded) flips and the corresponding error+retry
 * UI renders. FEED-10's E2E journey is the intended consumer.
 */
export async function simulateFeedErrorOnNextLoad(page: Page): Promise<void> {
  await page.addInitScript(
    "window.__mswReady.then(() => import('/e2e/mocks/apiErrors.ts')" +
      '.then(({ overrideFeedToError }) => overrideFeedToError(window.__mswWorker)));',
  );
}

export async function simulateTrendingErrorOnNextLoad(page: Page): Promise<void> {
  await page.addInitScript(
    "window.__mswReady.then(() => import('/e2e/mocks/apiErrors.ts')" +
      '.then(({ overrideTrendingToError }) => overrideTrendingToError(window.__mswWorker)));',
  );
}

export async function simulateBroadcastsErrorOnNextLoad(page: Page): Promise<void> {
  await page.addInitScript(
    "window.__mswReady.then(() => import('/e2e/mocks/apiErrors.ts')" +
      '.then(({ overrideBroadcastsToError }) => overrideBroadcastsToError(window.__mswWorker)));',
  );
}

export async function simulateGroupsErrorOnNextLoad(page: Page): Promise<void> {
  await page.addInitScript(
    "window.__mswReady.then(() => import('/e2e/mocks/apiErrors.ts')" +
      '.then(({ overrideGroupsToError }) => overrideGroupsToError(window.__mswWorker)));',
  );
}
