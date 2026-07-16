import { http, HttpResponse } from 'msw';
import type { SetupWorker } from 'msw/browser';

function apiError(message: string) {
  return { success: false, message, data: null, timestamp: new Date().toISOString() };
}

/**
 * FEED-8 error-simulation overrides — one function per real-data surface
 * hardened by that ticket (Feed, TrendingHashtags, GroupBroadcasts,
 * GroupSpaceSwitcher's groups list). Same mechanism as
 * expireSession.ts/emptyFeed.ts: registers a runtime handler override inside
 * the page's own JS realm, reachable only via fixtures.ts's
 * `simulate*ErrorOnNextLoad` helpers. Each swaps its endpoint's success
 * response for a 500, so the real query's `isError` (and, for a
 * `hasNextPage: true` fixture, `isFetchNextPageError`) actually flips —
 * proving FEED-8's error+retry UI renders against a genuine failed fetch,
 * not just a component test's mocked prop. FEED-10's E2E journey is the
 * intended consumer (its acceptance criteria requires at least one
 * MSW-simulated error response).
 */
export function overrideFeedToError(worker: SetupWorker): void {
  worker.use(
    http.get('/api/posts/feed', () =>
      HttpResponse.json(apiError('Simulated feed failure'), { status: 500 }),
    ),
  );
}

export function overrideTrendingToError(worker: SetupWorker): void {
  worker.use(
    http.get('/api/hashtags/trending', () =>
      HttpResponse.json(apiError('Simulated trending failure'), { status: 500 }),
    ),
  );
}

export function overrideBroadcastsToError(worker: SetupWorker): void {
  worker.use(
    http.get('/api/posts/broadcast', () =>
      HttpResponse.json(apiError('Simulated broadcasts failure'), { status: 500 }),
    ),
  );
}

export function overrideGroupsToError(worker: SetupWorker): void {
  worker.use(
    http.get('/api/groups/user/:userId', () =>
      HttpResponse.json(apiError('Simulated groups failure'), { status: 500 }),
    ),
  );
}
