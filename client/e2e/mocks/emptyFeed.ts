import { http, HttpResponse } from 'msw';
import type { SetupWorker } from 'msw/browser';

function apiResponse<T>(data: T, message = 'Success') {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

const emptyPage = {
  content: [],
  totalPages: 0,
  totalElements: 0,
  number: 0,
  size: 20,
  first: true,
  last: true,
  numberOfElements: 0,
  empty: true,
};

/**
 * Overrides the running worker's `GET /posts/feed` to return zero posts —
 * used for the visual-regression spec's "empty" state (FEED-1). Runs inside
 * the page's own JS realm, same pattern as expireSession.ts's
 * overrideRefreshToExpired — only reachable via fixtures.ts's
 * seedEmptyFeedOnNextLoad.
 */
export function overrideFeedToEmpty(worker: SetupWorker): void {
  worker.use(
    http.get('/api/posts/feed', () =>
      HttpResponse.json(apiResponse(emptyPage, 'Feed retrieved successfully')),
    ),
  );
}
