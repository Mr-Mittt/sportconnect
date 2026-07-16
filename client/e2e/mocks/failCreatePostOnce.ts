import { http, HttpResponse } from 'msw';
import type { SetupWorker } from 'msw/browser';

function apiError(message: string) {
  return { success: false, message, data: null, timestamp: new Date().toISOString() };
}

/**
 * FEED-10's required "at least one MSW-simulated error response" — a one-time
 * failure on `POST /posts`, via msw's `{ once: true }` handler option: after
 * this handler is exhausted (one matched request), msw falls through to
 * feed.ts's real create-post handler for every subsequent call, so a retry
 * with the same content succeeds normally. Invoked mid-test (not on next
 * load, unlike every other override module here) via `page.evaluate` calling
 * this against `window.__mswWorker` directly, since the failure needs to
 * apply only to one specific submit, not the whole page load.
 */
export function overrideCreatePostToFailOnce(worker: SetupWorker): void {
  worker.use(
    http.post(
      '/api/posts',
      () => HttpResponse.json(apiError('Simulated post-creation failure'), { status: 500 }),
      { once: true },
    ),
  );
}
