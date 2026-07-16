import { http, HttpResponse } from 'msw';
import type { SetupWorker } from 'msw/browser';

function apiResponse<T>(data: T, message = 'Success') {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

/**
 * Overrides `GET /sports/profiles/user/:userId` to return zero profiles —
 * FEED-10's SPORT-1 delta step ("the zero-profiles fixture renders without
 * error"). Same mechanism as emptyFeed.ts's overrideFeedToEmpty. Only
 * reachable via fixtures.ts's seedZeroSportProfilesOnNextLoad.
 */
export function overrideSportProfilesToEmpty(worker: SetupWorker): void {
  worker.use(
    http.get('/api/sports/profiles/user/:userId', () =>
      HttpResponse.json(apiResponse([], 'User profiles retrieved successfully')),
    ),
  );
}
