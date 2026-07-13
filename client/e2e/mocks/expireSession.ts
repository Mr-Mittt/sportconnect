import { http, HttpResponse } from 'msw';
import type { SetupWorker } from 'msw/browser';

function apiError(message: string) {
  return { success: false, message, data: null, timestamp: new Date().toISOString() };
}

/**
 * Overrides the running worker's `/auth/refresh` handler to fail, simulating
 * a refresh token that expired or was revoked server-side sometime after the
 * user's session was established. Runs inside the page's own JS realm — not
 * meant to be imported by a Node-side spec directly, only via
 * fixtures.ts's simulateExpiredSessionOnNextLoad (AUTH-8).
 */
export function overrideRefreshToExpired(worker: SetupWorker): void {
  worker.use(
    http.post('/api/auth/refresh', () =>
      HttpResponse.json(apiError('Refresh token expired'), { status: 401 }),
    ),
  );
}
